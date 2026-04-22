const fs = require("fs");
const path = require("path");

const here = __dirname;
const root = path.join(here, "..");
const outDir = path.join(root, "dist", "tag-relations-pwa");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function copyFile(from, to) {
  if (!fs.existsSync(from)) {
    console.warn(`Warning: missing ${path.relative(root, from)}`);
    return;
  }
  const dir = path.dirname(to);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`Tag Relations PWA: ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

const local = [
  ["index.html", "index.html"],
  ["styles.css", "styles.css"],
  ["app.js", "app.js"],
  ["manifest.json", "manifest.json"],
  ["sw.js", "sw.js"],
  [".nojekyll", ".nojekyll"]
];

local.forEach(([src, dest]) => {
  copyFile(path.join(here, src), path.join(outDir, dest));
});

copyFile(path.join(root, "pwa", "auth-config.js"), path.join(outDir, "auth-config.js"));
copyFile(path.join(root, "pwa", "auth-service.js"), path.join(outDir, "auth-service.js"));

const iconSrc = path.join(root, "desktop", "src", "assets", "icons", "png", "256x256.png");
copyFile(iconSrc, path.join(outDir, "icon192.png"));
copyFile(iconSrc, path.join(outDir, "icon512.png"));

console.log("Tag Relations PWA build complete -> dist/tag-relations-pwa/");
