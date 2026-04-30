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
    txt.setAttribute("fill", "#8aa0b3");
    txt.setAttribute("text-anchor", "middle");
    txt.textContent = "No tags found.";
    svg.appendChild(txt);
    if (els.meta) els.meta.textContent = "0 tags";
    graphWidth = 0;
    graphHeight = 0;
    return;
  }

  const byId = new Map(tags.map((tag) => [tag.id, tag]));

  const boxHeight = 42;
  const siblingGap = 28;
  const levelGap = 118;
  const marginX = 40;
  const marginY = 30;

  function getNodeWidthFromTag(tag) {
    const name = tag?.name || "";
    return Math.min(270, Math.max(130, 36 + name.length * 8));
  }

  function validParentIds(tag) {
    return (Array.isArray(tag.parentIds) ? tag.parentIds : []).filter((pid) => byId.has(pid));
  }

  // One node per tag: layer = max(parent layer) + 1. Relaxation converges for DAG; depth capped for cycles.
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

  const layout = new Map();
  const layerWidths = [];

  for (let d = 0; d <= maxDepth; d++) {
    const row = layers.get(d) || [];
    let w = 0;
    row.forEach((tag, i) => {
      w += getNodeWidthFromTag(tag);
      if (i < row.length - 1) w += siblingGap;
    });
    layerWidths[d] = w;
  }

  const contentWidth = Math.max(marginX * 2 + 200, ...layerWidths.map((w) => w + marginX * 2));

  for (let d = 0; d <= maxDepth; d++) {
    const row = layers.get(d) || [];
    const rowW = layerWidths[d] || 0;
    let cursorX = marginX + (contentWidth - marginX * 2 - rowW) / 2;
    const y = marginY + d * levelGap;
    row.forEach((tag) => {
      const nw = getNodeWidthFromTag(tag);
      layout.set(tag.id, {
        x: cursorX,
        y,
        width: nw,
        height: boxHeight,
        tag
      });
      cursorX += nw + siblingGap;
    });
  }

  const edges = [];
  tags.forEach((child) => {
    validParentIds(child).forEach((parentId) => {
      edges.push({ from: parentId, to: child.id });
    });
  });

  const width = contentWidth;
  const height = Math.max(220, marginY * 2 + (maxDepth + 1) * levelGap + boxHeight);

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  graphWidth = width;
  graphHeight = height;

  graphContent = document.createElementNS(svgNS, "g");
  graphContent.setAttribute("id", "graphContent");
  svg.appendChild(graphContent);

  const defs = document.createElementNS(svgNS, "defs");
  const marker = document.createElementNS(svgNS, "marker");
  marker.setAttribute("id", "graph-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const tri = document.createElementNS(svgNS, "path");
  tri.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  tri.setAttribute("fill", "#65b8ff");
  marker.appendChild(tri);
  defs.appendChild(marker);
  graphContent.appendChild(defs);

  edges.forEach((edgeInfo) => {
    const parentNode = layout.get(edgeInfo.from);
    const childNode = layout.get(edgeInfo.to);
    if (!parentNode || !childNode) return;
    const sx = parentNode.x + parentNode.width / 2;
    const sy = parentNode.y + parentNode.height;
    const ex = childNode.x + childNode.width / 2;
    const ey = childNode.y;
    const c = Math.max((ey - sy) * 0.45, 28);
    const edge = document.createElementNS(svgNS, "path");
    edge.setAttribute("d", `M ${sx} ${sy} C ${sx} ${sy + c}, ${ex} ${ey - c}, ${ex} ${ey}`);
    edge.setAttribute("fill", "none");
    edge.setAttribute("stroke", "#65b8ff");
    edge.setAttribute("stroke-width", "2");
    edge.setAttribute("marker-end", "url(#graph-arrow)");
    graphContent.appendChild(edge);
  });

  Array.from(layout.values()).forEach((node) => {
    const g = document.createElementNS(svgNS, "g");
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", String(node.x));
    rect.setAttribute("y", String(node.y));
    rect.setAttribute("width", String(node.width));
    rect.setAttribute("height", String(node.height));
    rect.setAttribute("rx", "8");
    rect.setAttribute("fill", "#1a2732");
    rect.setAttribute("stroke", node.tag.color || "#3ea86d");
    rect.setAttribute("stroke-width", "2");
    g.appendChild(rect);

    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("x", String(node.x + node.width / 2));
    text.setAttribute("y", String(node.y + node.height / 2 + 5));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "#e8edf3");
    text.setAttribute("font-size", "14");
    text.setAttribute("font-family", "Segoe UI, sans-serif");
    text.textContent = node.tag.name || "(unnamed)";
    g.appendChild(text);
    graphContent.appendChild(g);
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
