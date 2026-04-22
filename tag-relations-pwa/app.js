const TAGS_KEY = "mnemomark-tags";

const els = {
  signInForm: document.getElementById("signInForm"),
  signInEmail: document.getElementById("signInEmail"),
  signInPassword: document.getElementById("signInPassword"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  userEmail: document.getElementById("userEmail"),
  refreshBtn: document.getElementById("refreshBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  status: document.getElementById("status"),
  meta: document.getElementById("meta"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  resetViewBtn: document.getElementById("resetViewBtn"),
  fitViewBtn: document.getElementById("fitViewBtn"),
  graphWrap: document.getElementById("graphWrap"),
  graphSvg: document.getElementById("graphSvg")
};

let tags = [];
let graphContent = null;
let graphWidth = 0;
let graphHeight = 0;
let graphTransform = { x: 0, y: 0, scale: 1 };
let dragState = { active: false, startX: 0, startY: 0, originX: 0, originY: 0 };

function setStatus(message, isError = false) {
  if (!els.status) return;
  els.status.textContent = message || "";
  els.status.classList.toggle("error", !!isError);
}

function readLocalTags() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TAGS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function syncAndRenderTags() {
  const auth = window.authService;
  if (!auth) {
    setStatus("Auth service not loaded.", true);
    return;
  }
  const user = auth.getCurrentUser && auth.getCurrentUser();
  if (!user) {
    tags = [];
    renderTagRelations();
    return;
  }
  setStatus("Syncing tags from cloud...");
  auth.syncTagsFromCloud()
    .catch(() => {})
    .finally(() => {
      tags = readLocalTags();
      renderTagRelations();
      setStatus(`Loaded ${tags.length} tags.`);
    });
}

function updateAuthView() {
  const auth = window.authService;
  const user = auth && auth.getCurrentUser ? auth.getCurrentUser() : null;
  const signedIn = !!user;
  if (els.signedOutView) els.signedOutView.hidden = signedIn;
  if (els.signedInView) els.signedInView.hidden = !signedIn;
  if (els.userEmail) els.userEmail.textContent = signedIn ? (user.email || "") : "";
  if (!signedIn) {
    tags = [];
    renderTagRelations();
    setStatus("Sign in to load your MnemoMark account tags.");
    return;
  }
  syncAndRenderTags();
}

function applyGraphTransform() {
  if (!graphContent) return;
  graphContent.setAttribute(
    "transform",
    `translate(${graphTransform.x} ${graphTransform.y}) scale(${graphTransform.scale})`
  );
}

function clampScale(scale) {
  return Math.max(0.2, Math.min(scale, 4.5));
}

function zoomAt(scaleFactor, anchorX, anchorY) {
  const oldScale = graphTransform.scale;
  const nextScale = clampScale(oldScale * scaleFactor);
  if (Math.abs(nextScale - oldScale) < 0.0001) return;
  const worldX = (anchorX - graphTransform.x) / oldScale;
  const worldY = (anchorY - graphTransform.y) / oldScale;
  graphTransform.scale = nextScale;
  graphTransform.x = anchorX - (worldX * nextScale);
  graphTransform.y = anchorY - (worldY * nextScale);
  applyGraphTransform();
}

function resetGraphView() {
  graphTransform = { x: 0, y: 0, scale: 1 };
  applyGraphTransform();
}

function fitGraphToView() {
  if (!graphContent || !graphWidth || !graphHeight || !els.graphWrap) {
    resetGraphView();
    return;
  }
  const wrapWidth = els.graphWrap.clientWidth || graphWidth;
  const wrapHeight = els.graphWrap.clientHeight || graphHeight;
  const margin = 24;
  const fitScale = clampScale(
    Math.min(
      (wrapWidth - margin * 2) / graphWidth,
      (wrapHeight - margin * 2) / graphHeight,
      1
    )
  );
  const x = (wrapWidth - graphWidth * fitScale) / 2;
  const y = (wrapHeight - graphHeight * fitScale) / 2;
  graphTransform = { x, y, scale: fitScale };
  applyGraphTransform();
}

/** Rounded orthogonal path: parent right → bus → child left (reference mind-map style). */
function roundedConnectorPath(pr, py, busX, cy, cl, rMax) {
  const down = cy >= py;
  if (Math.abs(cy - py) < 0.25) {
    return `M ${pr} ${py} L ${cl} ${cy}`;
  }
  let r = Math.min(
    rMax,
    Math.max(2.5, (busX - pr) * 0.34),
    Math.max(2.5, Math.abs(cy - py) * 0.34),
    Math.max(2.5, (cl - busX) * 0.34)
  );
  r = Math.min(r, (busX - pr) / 2 - 0.5, (cl - busX) / 2 - 0.5, Math.abs(cy - py) / 2 - 0.5);
  if (r < 2.5 || busX - pr < 8 || cl - busX < 8) {
    return `M ${pr} ${py} L ${busX} ${py} L ${busX} ${cy} L ${cl} ${cy}`;
  }
  if (down) {
    return `M ${pr} ${py} L ${busX - r} ${py} A ${r} ${r} 0 0 1 ${busX} ${py + r} L ${busX} ${cy - r} A ${r} ${r} 0 0 1 ${busX + r} ${cy} L ${cl} ${cy}`;
  }
  return `M ${pr} ${py} L ${busX - r} ${py} A ${r} ${r} 0 0 0 ${busX} ${py - r} L ${busX} ${cy + r} A ${r} ${r} 0 0 0 ${busX + r} ${cy} L ${cl} ${cy}`;
}

function renderTagRelations() {
  if (!els.graphSvg || !els.graphWrap) return;
  const svg = els.graphSvg;
  const svgNS = "http://www.w3.org/2000/svg";
  svg.innerHTML = "";
  graphContent = null;

  if (!tags.length) {
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "240");
    const txt = document.createElementNS(svgNS, "text");
    txt.setAttribute("x", "50%");
    txt.setAttribute("y", "52%");
    txt.setAttribute("fill", "#5c5c66");
    txt.setAttribute("text-anchor", "middle");
    txt.textContent = "No tags found.";
    svg.appendChild(txt);
    if (els.meta) els.meta.textContent = "0 tags";
    graphWidth = 0;
    graphHeight = 0;
    return;
  }

  const byId = new Map(tags.map((tag) => [tag.id, tag]));

  const fontSize = 15;
  const lineHeight = 30;
  const channelWidth = 96;
  const marginX = 52;
  const marginY = 44;
  const busInset = 28;
  const cornerRadius = 10;
  const edgeStroke = "#7c3aed";
  const edgeWidth = "1.5";
  const labelFill = "#141418";

  function textWidthApprox(tag) {
    const name = tag?.name || "";
    return Math.min(440, Math.max(28, 8 + name.length * (fontSize * 0.52)));
  }

  function validParentIds(tag) {
    return (Array.isArray(tag.parentIds) ? tag.parentIds : []).filter((pid) => byId.has(pid));
  }

  /** Same as valid parents but preserves `parentIds` order (main branch = first eligible parent). */
  function orderedValidParents(tag) {
    const allow = new Set(validParentIds(tag));
    return (Array.isArray(tag.parentIds) ? tag.parentIds : []).filter((pid) => allow.has(pid));
  }

  const depthCap = Math.max(tags.length, 1);
  const depth = new Map();
  tags.forEach((t) => {
    const parents = validParentIds(t);
    depth.set(t.id, parents.length ? 1 : 0);
  });
  let changed = true;
  let guard = 0;
  while (changed && guard < tags.length + 12) {
    guard += 1;
    changed = false;
    tags.forEach((t) => {
      const parents = validParentIds(t);
      const raw = parents.length === 0 ? 0 : Math.max(...parents.map((pid) => depth.get(pid) ?? 0)) + 1;
      const nextDepth = Math.min(depthCap, raw);
      if (depth.get(t.id) !== nextDepth) {
        depth.set(t.id, nextDepth);
        changed = true;
      }
    });
  }

  let maxDepth = 0;
  tags.forEach((t) => {
    maxDepth = Math.max(maxDepth, depth.get(t.id) ?? 0);
  });

  const colWidth = [];
  for (let d = 0; d <= maxDepth; d++) {
    const atDepth = tags.filter((t) => (depth.get(t.id) ?? 0) === d);
    colWidth[d] = atDepth.reduce((m, tag) => Math.max(m, textWidthApprox(tag)), 96);
  }

  const colLeft = [];
  colLeft[0] = marginX;
  for (let d = 1; d <= maxDepth; d++) {
    colLeft[d] = colLeft[d - 1] + colWidth[d - 1] + channelWidth;
  }

  /**
   * Layout tree: each tag hangs under one "classification" parent — first in `parentIds` with strictly lower depth.
   * If none, the tag is a layout root (own clade) — avoids cycles / same-depth parent loops.
   */
  function primaryParentId(tag) {
    const ordered = orderedValidParents(tag);
    if (!ordered.length) return null;
    const dc = depth.get(tag.id) ?? 0;
    for (const pid of ordered) {
      if ((depth.get(pid) ?? 0) < dc) return pid;
    }
    return null;
  }

  const layoutChildren = new Map();
  tags.forEach((t) => {
    const pp = primaryParentId(t);
    if (!pp) return;
    if (!layoutChildren.has(pp)) layoutChildren.set(pp, []);
    layoutChildren.get(pp).push(t);
  });
  layoutChildren.forEach((list) => list.sort((a, b) => (a.name || "").localeCompare(b.name || "")));

  const subGap = 20;
  const rootGap = 40;
  const leafBand = lineHeight + 12;
  const heightMemo = new Map();

  function subtreePixelHeight(id) {
    if (heightMemo.has(id)) return heightMemo.get(id);
    const kids = layoutChildren.get(id) || [];
    if (!kids.length) {
      heightMemo.set(id, leafBand);
      return leafBand;
    }
    let s = 0;
    kids.forEach((k, i) => {
      s += subtreePixelHeight(k.id);
      if (i < kids.length - 1) s += subGap;
    });
    heightMemo.set(id, s);
    return s;
  }

  tags.forEach((t) => subtreePixelHeight(t.id));

  let roots = tags
    .filter((t) => primaryParentId(t) === null)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (!roots.length) {
    const pick = tags
      .slice()
      .sort(
        (a, b) =>
          (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) ||
          (a.name || "").localeCompare(b.name || "") ||
          a.id.localeCompare(b.id)
      )[0];
    roots = pick ? [pick] : [];
  }

  const layout = new Map();

  function placeNode(tag, y0, y1) {
    const d = depth.get(tag.id) ?? 0;
    const x = colLeft[d];
    const w = textWidthApprox(tag);
    const kids = (layoutChildren.get(tag.id) || []).slice();

    if (!kids.length) {
      const cy = (y0 + y1) / 2;
      layout.set(tag.id, {
        x,
        y: cy - lineHeight / 2,
        width: w,
        height: lineHeight,
        tag
      });
      return cy;
    }

    const total = kids.reduce((s, k) => s + subtreePixelHeight(k.id), 0) + (kids.length - 1) * subGap;
    let cur = y0 + (y1 - y0 - total) / 2;
    const centers = [];
    kids.forEach((k, i) => {
      const h = subtreePixelHeight(k.id);
      const cy = placeNode(k, cur, cur + h);
      centers.push(cy);
      cur += h + (i < kids.length - 1 ? subGap : 0);
    });
    const pcy = centers.reduce((a, b) => a + b, 0) / centers.length;
    layout.set(tag.id, {
      x,
      y: pcy - lineHeight / 2,
      width: w,
      height: lineHeight,
      tag
    });
    return pcy;
  }

  let yCursor = marginY;
  roots.forEach((r, i) => {
    const h = subtreePixelHeight(r.id);
    placeNode(r, yCursor, yCursor + h);
    yCursor += h + (i < roots.length - 1 ? rootGap : 0);
  });

  const height = Math.max(220, yCursor + marginY);
  const width = colLeft[maxDepth] + colWidth[maxDepth] + marginX + 40;

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  graphWidth = width;
  graphHeight = height;

  graphContent = document.createElementNS(svgNS, "g");
  graphContent.setAttribute("id", "graphContent");
  svg.appendChild(graphContent);

  const defs = document.createElementNS(svgNS, "defs");
  const gridPat = document.createElementNS(svgNS, "pattern");
  gridPat.setAttribute("id", "tagRelationsGrid");
  gridPat.setAttribute("width", "24");
  gridPat.setAttribute("height", "24");
  gridPat.setAttribute("patternUnits", "userSpaceOnUse");
  const gridPath = document.createElementNS(svgNS, "path");
  gridPath.setAttribute("d", "M 24 0 L 0 0 0 24");
  gridPath.setAttribute("fill", "none");
  gridPath.setAttribute("stroke", "#c6c6d4");
  gridPath.setAttribute("stroke-width", "0.55");
  gridPat.appendChild(gridPath);
  defs.appendChild(gridPat);
  graphContent.appendChild(defs);

  const gridBg = document.createElementNS(svgNS, "rect");
  gridBg.setAttribute("x", "0");
  gridBg.setAttribute("y", "0");
  gridBg.setAttribute("width", String(width));
  gridBg.setAttribute("height", String(height));
  gridBg.setAttribute("fill", "url(#tagRelationsGrid)");
  graphContent.appendChild(gridBg);

  function centerY(node) {
    return node.y + node.height / 2;
  }

  tags.forEach((child) => {
    const childNode = layout.get(child.id);
    if (!childNode) return;
    const parents = validParentIds(child).filter((pid) => {
      const dp = depth.get(pid) ?? 0;
      const dc = depth.get(child.id) ?? 0;
      return dp < dc;
    });
    parents.forEach((parentId) => {
      const parentNode = layout.get(parentId);
      if (!parentNode) return;
      const pr = parentNode.x + parentNode.width;
      const py = centerY(parentNode);
      const cl = childNode.x;
      const cy = centerY(childNode);
      let busX = cl - busInset;
      const minBus = pr + 12;
      if (busX < minBus) busX = minBus;
      if (busX >= cl) busX = Math.max(pr + 6, cl - 6);
      const dPath = roundedConnectorPath(pr, py, busX, cy, cl, cornerRadius);
      const edge = document.createElementNS(svgNS, "path");
      edge.setAttribute("d", dPath);
      edge.setAttribute("fill", "none");
      edge.setAttribute("stroke", edgeStroke);
      edge.setAttribute("stroke-width", edgeWidth);
      edge.setAttribute("stroke-linecap", "round");
      edge.setAttribute("stroke-linejoin", "round");
      graphContent.appendChild(edge);
    });
  });

  Array.from(layout.values()).forEach((node) => {
    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("x", String(node.x));
    text.setAttribute("y", String(node.y + node.height * 0.72));
    text.setAttribute("text-anchor", "start");
    text.setAttribute("fill", labelFill);
    text.setAttribute("font-size", String(fontSize));
    text.setAttribute("font-family", "Segoe UI, system-ui, sans-serif");
    text.textContent = node.tag.name || "(unnamed)";
    graphContent.appendChild(text);
  });

  fitGraphToView();
  if (els.meta) els.meta.textContent = `${tags.length} tags`;
}

function bindEvents() {
  if (els.signInForm) {
    els.signInForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = (els.signInEmail.value || "").trim();
      const password = els.signInPassword.value || "";
      if (!email || !password) {
        setStatus("Enter email and password.", true);
        return;
      }
      setStatus("Signing in...");
      const result = await window.authService.signIn(email, password);
      if (!result.success) {
        setStatus(result.error || "Sign in failed.", true);
        return;
      }
      setStatus("Signed in.");
      updateAuthView();
    });
  }

  if (els.signOutBtn) {
    els.signOutBtn.addEventListener("click", async () => {
      await window.authService.signOut();
      setStatus("Signed out.");
      updateAuthView();
    });
  }

  if (els.refreshBtn) {
    els.refreshBtn.addEventListener("click", syncAndRenderTags);
  }

  if (els.zoomInBtn) {
    els.zoomInBtn.addEventListener("click", () => {
      const w = els.graphWrap.clientWidth || 1;
      const h = els.graphWrap.clientHeight || 1;
      zoomAt(1.2, w / 2, h / 2);
    });
  }
  if (els.zoomOutBtn) {
    els.zoomOutBtn.addEventListener("click", () => {
      const w = els.graphWrap.clientWidth || 1;
      const h = els.graphWrap.clientHeight || 1;
      zoomAt(1 / 1.2, w / 2, h / 2);
    });
  }
  if (els.resetViewBtn) {
    els.resetViewBtn.addEventListener("click", resetGraphView);
  }
  if (els.fitViewBtn) {
    els.fitViewBtn.addEventListener("click", fitGraphToView);
  }

  if (els.graphWrap) {
    els.graphWrap.addEventListener("wheel", (event) => {
      if (!graphContent) return;
      event.preventDefault();
      const rect = els.graphWrap.getBoundingClientRect();
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(factor, anchorX, anchorY);
    }, { passive: false });

    els.graphWrap.addEventListener("mousedown", (event) => {
      if (!graphContent || event.button !== 0) return;
      dragState.active = true;
      dragState.startX = event.clientX;
      dragState.startY = event.clientY;
      dragState.originX = graphTransform.x;
      dragState.originY = graphTransform.y;
      els.graphWrap.classList.add("dragging");
    });
  }

  window.addEventListener("mousemove", (event) => {
    if (!dragState.active) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    graphTransform.x = dragState.originX + dx;
    graphTransform.y = dragState.originY + dy;
    applyGraphTransform();
  });
  window.addEventListener("mouseup", () => {
    dragState.active = false;
    if (els.graphWrap) els.graphWrap.classList.remove("dragging");
  });

  window.addEventListener("resize", () => {
    if (tags.length) {
      fitGraphToView();
    } else {
      renderTagRelations();
    }
  });
  window.addEventListener("authStateChanged", updateAuthView);
  window.addEventListener("tagsSynced", () => {
    tags = readLocalTags();
    renderTagRelations();
  });
}

bindEvents();
updateAuthView();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
  });
}
