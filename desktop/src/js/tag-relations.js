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
        txt.setAttribute("fill", "#8f8f8f");
        txt.setAttribute("text-anchor", "middle");
        txt.textContent = "No tags available for this account yet.";
        svg.appendChild(txt);
        if (graphMeta) graphMeta.textContent = "0 tags";
        return;
    }

    const tagsById = new Map(tags.map(tag => [tag.id, tag]));
    const memoDepth = new Map();
    function getDepth(tagId, chain = new Set()) {
        if (memoDepth.has(tagId)) return memoDepth.get(tagId);
        if (chain.has(tagId)) return 0;
        chain.add(tagId);
        const tag = tagsById.get(tagId);
        const parentIds = (tag && Array.isArray(tag.parentIds)) ? tag.parentIds : [];
        let depth = 0;
        parentIds.forEach(parentId => {
            if (!tagsById.has(parentId)) return;
            depth = Math.max(depth, getDepth(parentId, chain) + 1);
        });
        chain.delete(tagId);
        memoDepth.set(tagId, depth);
        return depth;
    }

    const levels = new Map();
    tags.forEach(tag => {
        const depth = getDepth(tag.id);
        if (!levels.has(depth)) levels.set(depth, []);
        levels.get(depth).push(tag);
    });
    levels.forEach(list => list.sort((a, b) => (a.name || "").localeCompare(b.name || "")));

    const layout = new Map();
    const boxHeight = 44;
    const columnGap = 92;
    const rowGap = 30;
    let x = 40;
    const sortedDepths = Array.from(levels.keys()).sort((a, b) => a - b);
    sortedDepths.forEach(depth => {
        const levelTags = levels.get(depth) || [];
        const levelWidth = Math.max(
            130,
            ...levelTags.map(tag => Math.min(280, 36 + ((tag.name || "").length * 8)))
        );
        levelTags.forEach((tag, index) => {
            layout.set(tag.id, {
                x,
                y: 40 + index * (boxHeight + rowGap),
                width: levelWidth,
                height: boxHeight,
                tag
            });
        });
        x += levelWidth + columnGap;
    });

    const usedWidth = Math.max(x, graphFrame.clientWidth || 900);
    const usedHeight = Math.max(
        220,
        ...Array.from(layout.values()).map(node => node.y + node.height + 40)
    );
    svg.setAttribute("width", String(usedWidth));
    svg.setAttribute("height", String(usedHeight));
    svg.setAttribute("viewBox", `0 0 ${usedWidth} ${usedHeight}`);

    const defs = document.createElementNS(svgNS, "defs");
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id", "relation-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto-start-reverse");
    const markerPath = document.createElementNS(svgNS, "path");
    markerPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    markerPath.setAttribute("fill", "#6ab5ff");
    marker.appendChild(markerPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    tags.forEach(child => {
        const childNode = layout.get(child.id);
        if (!childNode || !Array.isArray(child.parentIds)) return;
        child.parentIds.forEach(parentId => {
            const parentNode = layout.get(parentId);
            if (!parentNode) return;
            const sx = parentNode.x + parentNode.width;
            const sy = parentNode.y + (parentNode.height / 2);
            const ex = childNode.x;
            const ey = childNode.y + (childNode.height / 2);
            const curve = Math.max((ex - sx) * 0.45, 40);
            const edge = document.createElementNS(svgNS, "path");
            edge.setAttribute("d", `M ${sx} ${sy} C ${sx + curve} ${sy}, ${ex - curve} ${ey}, ${ex} ${ey}`);
            edge.setAttribute("stroke", "#6ab5ff");
            edge.setAttribute("stroke-width", "2");
            edge.setAttribute("fill", "none");
            edge.setAttribute("marker-end", "url(#relation-arrow)");
            svg.appendChild(edge);
        });
    });

    Array.from(layout.values()).forEach(node => {
        const g = document.createElementNS(svgNS, "g");
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", String(node.x));
        rect.setAttribute("y", String(node.y));
        rect.setAttribute("width", String(node.width));
        rect.setAttribute("height", String(node.height));
        rect.setAttribute("rx", "8");
        rect.setAttribute("fill", "#252525");
        rect.setAttribute("stroke", node.tag.color || "#4caf50");
        rect.setAttribute("stroke-width", "2");
        g.appendChild(rect);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", String(node.x + (node.width / 2)));
        label.setAttribute("y", String(node.y + (node.height / 2) + 5));
        label.setAttribute("fill", "#ededed");
        label.setAttribute("font-size", "14");
        label.setAttribute("font-family", "Segoe UI, sans-serif");
        label.setAttribute("text-anchor", "middle");
        label.textContent = node.tag.name || "(unnamed)";
        g.appendChild(label);

        svg.appendChild(g);
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
