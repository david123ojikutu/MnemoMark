# Building MnemoMark Desktop App for Distribution

This guide explains how to build the desktop app into installable packages for Windows, macOS, and Linux.

## Prerequisites

1. **Node.js** (v16 or higher) - Download from [nodejs.org](https://nodejs.org/)
2. **npm** (comes with Node.js)

## Step-by-Step Build Process

### 1. Install Dependencies

First, navigate to the desktop app directory and install all required packages:

```bash
cd "Highlighting Desktop App"
npm install
```

This will install:
- Electron (the framework)
- electron-builder (build tool)
- pdfjs-dist (PDF rendering)
- mammoth (Word document support)
- firebase (authentication)

### 2. Build the Application

Run the build command:

```bash
npm run build
```

### 3. What Gets Created

After building, you'll find the installers in the `dist/` folder:

- **Windows**: `MnemoMark Setup X.X.X.exe` (NSIS installer)
- **macOS**: `MnemoMark-X.X.X.dmg` (disk image)
- **Linux**: `MnemoMark-X.X.X.AppImage` (portable app)

### 4. Building for Specific Platforms

**Build for current platform only:**
```bash
npm run build
```

**Build for Windows (from any platform):**
```bash
npm run build -- --win
```

**Build for macOS (from macOS only):**
```bash
npm run build -- --mac
```

**Build for Linux:**
```bash
npm run build -- --linux
```

**Build for all platforms (if on macOS):**
```bash
npm run build -- --win --mac --linux
```

Note: Building macOS apps from Windows/Linux is not possible due to code signing requirements.

## Distribution

### For Windows Users:
- Share the `.exe` file from the `dist/` folder
- Users double-click to install
- The installer will create a Start Menu entry and desktop shortcut

### For macOS Users:
- Share the `.dmg` file from the `dist/` folder
- Users open the DMG, drag the app to Applications folder
- Note: macOS may show a security warning for unsigned apps (users need to allow in System Preferences)

### For Linux Users:
- Share the `.AppImage` file from the `dist/` folder
- Users make it executable: `chmod +x MnemoMark-X.X.X.AppImage`
- Users can run it directly (no installation needed)

## Optional: Code Signing (for Production)

For production releases, you'll want to code sign your apps:

### Windows Code Signing:
Add to `package.json` build config:
```json
"win": {
  "target": "nsis",
  "icon": "icons/icon128.png",
  "certificateFile": "path/to/certificate.pfx",
  "certificatePassword": "your-password"
}
```

### macOS Code Signing:
Add to `package.json` build config:
```json
"mac": {
  "target": "dmg",
  "icon": "icons/icon128.png",
  "identity": "Developer ID Application: Your Name"
}
```

## Troubleshooting

### Build fails with "electron-builder not found"
- Run `npm install` again to ensure electron-builder is installed

### Icon not found error
- Make sure `icons/icon128.png` exists in the desktop app directory
- Or update the icon path in `package.json`

### Build is very large
- This is normal for Electron apps (includes Chromium)
- Typical size: 100-200 MB
- You can optimize by excluding unnecessary files in the `files` array in `package.json`

## Quick Start Summary

```bash
# 1. Navigate to app directory
cd "Highlighting Desktop App"

# 2. Install dependencies (first time only)
npm install

# 3. Build the app
npm run build

# 4. Find your installer in the dist/ folder
```

That's it! The installer files in `dist/` are ready to share with users.

