const TAGS_KEY = "mnemomark-tags";
const svg = document.getElementById("relationsSvg");
const graphFrame = document.getElementById("graphFrame");
const graphMeta = document.getElementById("graphMeta");
const refreshGraphBtn = document.getElementById("refreshGraphBtn");

let tags = [];

function loadTags() {
    try {
        tags = JSON.parse(localStorage.getItem(TAGS_KEY) || "[]");
        if (!Array.isArray(tags)) tags = [];
    } catch (_) {
        tags = [];
    }
}

function syncThenRender() {
    const auth = window.authService;
    if (auth && auth.getCurrentUser && auth.getCurrentUser() && auth.isSharingTags && auth.isSharingTags()) {
        auth.syncTagsFromCloud()
            .catch(() => {})
            .finally(() => {
                loadTags();
                renderTagRelations();
            });
        return;
    }
    loadTags();
    renderTagRelations();
}

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
    if (!svg || !graphFrame) return;
    const svgNS = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";

    if (!tags.length) {
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "220");
        const txt = document.createElementNS(svgNS, "text");
        txt.setAttribute("x", "50%");
        txt.setAttribute("y", "50%");
        txt.setAttribute("fill", "#5c5c66");
        txt.setAttribute("text-anchor", "middle");
        txt.textContent = "No tags available for this account yet.";
        svg.appendChild(txt);
        if (graphMeta) graphMeta.textContent = "0 tags";
        return;
    }

    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    const fontSize = 15;
    const lineHeight = 30;
    const rowGap = 22;
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
        colWidth[d] = row.reduce((m, tag) => Math.max(m, textWidthApprox(tag)), 96);
    }

    const colLeft = [];
    colLeft[0] = marginX;
    for (let d = 1; d <= maxDepth; d++) {
        colLeft[d] = colLeft[d - 1] + colWidth[d - 1] + channelWidth;
    }

    const layout = new Map();
    const colBottom = [];

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

    const height = Math.max(220, Math.max(...colBottom.map((b) => b)) + marginY);
    const width = colLeft[maxDepth] + colWidth[maxDepth] + marginX + 40;

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

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
    svg.appendChild(defs);

    const gridBg = document.createElementNS(svgNS, "rect");
    gridBg.setAttribute("x", "0");
    gridBg.setAttribute("y", "0");
    gridBg.setAttribute("width", String(width));
    gridBg.setAttribute("height", String(height));
    gridBg.setAttribute("fill", "url(#tagRelationsGrid)");
    svg.appendChild(gridBg);

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
            svg.appendChild(edge);
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
        svg.appendChild(text);
    });

    if (graphMeta) graphMeta.textContent = `${tags.length} tags`;
}

if (refreshGraphBtn) {
    refreshGraphBtn.addEventListener("click", syncThenRender);
}

window.addEventListener("resize", renderTagRelations);
window.addEventListener("storage", (event) => {
    if (!event.key || event.key === TAGS_KEY) {
        loadTags();
        renderTagRelations();
    }
});
window.addEventListener("tagsSynced", () => {
    loadTags();
    renderTagRelations();
});
window.addEventListener("authStateChanged", () => {
    syncThenRender();
});

syncThenRender();
