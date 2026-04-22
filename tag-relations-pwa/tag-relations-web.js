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

  const fontSize = 14;
  const lineHeight = 20;
  const rowGap = 10;
  const channelWidth = 52;
  const marginX = 36;
  const marginY = 28;
  const busInset = 14;
  const edgeStroke = "#a78bfa";
  const edgeWidth = "1.35";
  const labelFill = "#1a1a1f";

  function textWidthApprox(tag) {
    const name = tag?.name || "";
    return Math.min(420, Math.max(24, 6 + name.length * (fontSize * 0.52)));
  }

  function validParentIds(tag) {
    return (Array.isArray(tag.parentIds) ? tag.parentIds : []).filter((pid) => byId.has(pid));
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

  const layers = new Map();
  let maxDepth = 0;
  tags.forEach((t) => {
    const d = depth.get(t.id) ?? 0;
    maxDepth = Math.max(maxDepth, d);
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(t);
  });
  layers.forEach((list) => list.sort((a, b) => (a.name || "").localeCompare(b.name || "")));

  const colWidth = [];
  for (let d = 0; d <= maxDepth; d++) {
    const row = layers.get(d) || [];
    colWidth[d] = row.reduce((m, tag) => Math.max(m, textWidthApprox(tag)), 80);
  }

  const colLeft = [];
  colLeft[0] = marginX;
  for (let d = 1; d <= maxDepth; d++) {
    colLeft[d] = colLeft[d - 1] + colWidth[d - 1] + channelWidth;
  }

  function medianParentCenterY(tag) {
    const dc = depth.get(tag.id) ?? 0;
    const ps = validParentIds(tag).filter((pid) => (depth.get(pid) ?? 0) < dc);
    const ys = ps
      .map((pid) => {
        const n = layout.get(pid);
        return n ? n.y + n.height / 2 : null;
      })
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    if (!ys.length) return 0;
    const mid = Math.floor((ys.length - 1) / 2);
    return ys.length % 2 ? ys[mid] : (ys[mid] + ys[mid + 1]) / 2;
  }

  const layout = new Map();
  const colBottom = [];

  for (let d = 0; d <= maxDepth; d++) {
    const row = layers.get(d) || [];
    if (d > 0) {
      row.sort((a, b) => {
        const ma = medianParentCenterY(a);
        const mb = medianParentCenterY(b);
        if (Math.abs(ma - mb) > 0.5) return ma - mb;
        return (a.name || "").localeCompare(b.name || "");
      });
    }
    let y = marginY;
    row.forEach((tag) => {
      const w = textWidthApprox(tag);
      const h = lineHeight;
      layout.set(tag.id, {
        x: colLeft[d],
        y,
        width: w,
        height: h,
        tag
      });
      y += h + rowGap;
    });
    colBottom[d] = y;
  }

  const height = Math.max(200, Math.max(...colBottom.map((b) => b)) + marginY);
  const width = colLeft[maxDepth] + colWidth[maxDepth] + marginX + 24;

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
  gridPat.setAttribute("width", "20");
  gridPat.setAttribute("height", "20");
  gridPat.setAttribute("patternUnits", "userSpaceOnUse");
  const gridPath = document.createElementNS(svgNS, "path");
  gridPath.setAttribute("d", "M 20 0 L 0 0 0 20");
  gridPath.setAttribute("fill", "none");
  gridPath.setAttribute("stroke", "#c8c8d2");
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
      const minBus = pr + 8;
      if (busX < minBus) busX = minBus;
      if (busX >= cl) busX = Math.max(pr + 4, cl - 4);
      const d = `M ${pr} ${py} L ${busX} ${py} L ${busX} ${cy} L ${cl} ${cy}`;
      const edge = document.createElementNS(svgNS, "path");
      edge.setAttribute("d", d);
      edge.setAttribute("fill", "none");
      edge.setAttribute("stroke", edgeStroke);
      edge.setAttribute("stroke-width", edgeWidth);
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
