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
  { src: 'pwa/app.css', dest: 'dist/app.css' }
];

// Copy extension files that the PWA needs
const extensionFiles = [
  { src: 'Highlighting Extension/homepage.css', dest: 'dist/homepage.css' },
  { src: 'Highlighting Extension/auth.css', dest: 'dist/auth.css' },
  { src: 'Highlighting Extension/auth-service.js', dest: 'dist/auth-service.js' },
  { src: 'Highlighting Extension/auth-ui.js', dest: 'dist/auth-ui.js' },
  { src: 'Highlighting Extension/auth-config.js', dest: 'dist/auth-config.js' },
  { src: 'Highlighting Extension/homepage.js', dest: 'dist/homepage.js' },
  { src: 'Highlighting Extension/icons/icon128.png', dest: 'dist/icon128.png' },
  { src: 'Highlighting Extension/icons/icon256.png', dest: 'dist/icon192.png' }, // Use 256 as 192
  { src: 'Highlighting Extension/icons/icon256.png', dest: 'dist/icon512.png' }  // Use 256 as 512
];

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
[...filesToCopy, ...extensionFiles].forEach(({ src, dest }) => {
  copyFile(src, dest);
});

console.log('Build complete!');
