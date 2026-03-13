const fs = require('fs');
const path = require('path');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy PWA files
const filesToCopy = [
  { src: 'pwa/index.html', dest: 'dist/index.html' },
  { src: 'pwa/manifest.json', dest: 'dist/manifest.json' },
  { src: 'pwa/sw.js', dest: 'dist/sw.js' },
  { src: 'pwa/app.js', dest: 'dist/app.js' },
  { src: 'pwa/app.css', dest: 'dist/app.css' },
  { src: 'pwa/index-web.js', dest: 'dist/js/index.js' } // Web-compatible version
];

// Copy desktop app files
const desktopFiles = [
  { src: 'desktop/src/css/index.css', dest: 'dist/css/index.css' },
  { src: 'desktop/src/css/auth.css', dest: 'dist/css/auth.css' },
  { src: 'desktop/src/css/tags-and-highlights.css', dest: 'dist/css/tags-and-highlights.css' },
  { src: 'desktop/src/js/auth-config.js', dest: 'dist/js/auth-config.js' },
  { src: 'desktop/src/js/auth-service.js', dest: 'dist/js/auth-service.js' },
  { src: 'desktop/src/js/auth-ui.js', dest: 'dist/js/auth-ui.js' },
  { src: 'desktop/src/js/tags-and-highlights.js', dest: 'dist/js/tags-and-highlights.js' },
  { src: 'desktop/src/tags-and-highlights.html', dest: 'dist/tags-and-highlights.html' },
  { src: 'desktop/src/assets/images/grayscale.png', dest: 'dist/assets/images/grayscale.png' },
  { src: 'desktop/src/assets/images/logo.png', dest: 'dist/assets/images/logo.png' },
  { src: 'desktop/src/assets/icons/png/256x256.png', dest: 'dist/icon128.png' },
  { src: 'desktop/src/assets/icons/png/256x256.png', dest: 'dist/icon192.png' },
  { src: 'desktop/src/assets/icons/png/256x256.png', dest: 'dist/icon512.png' }
];

// Copy PDF.js library (copy entire directory)
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Warning: ${src} not found, skipping...`);
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(src, dest) {
  const srcPath = path.join(__dirname, src);
  const destPath = path.join(__dirname, dest);
  
  if (fs.existsSync(srcPath)) {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied: ${src} -> ${dest}`);
  } else {
    console.warn(`Warning: ${src} not found, skipping...`);
  }
}

// Copy all files
[...filesToCopy, ...desktopFiles].forEach(({ src, dest }) => {
  copyFile(src, dest);
});

// Copy PDF.js library
const pdfjsSrc = path.join(__dirname, 'desktop/src/lib/pdfjs');
const pdfjsDest = path.join(__dirname, 'dist/lib/pdfjs');
if (fs.existsSync(pdfjsSrc)) {
  copyDir(pdfjsSrc, pdfjsDest);
  console.log('Copied PDF.js library');
}

console.log('Build complete!');
