# Icon Setup Instructions

Icons are now stored locally in each project's directory structure. Each project has its own `icons/` folder with the icon files.

**Current Status:**
- ✅ Desktop app has icons in `Highlighting Desktop App/icons/` (icon16.png, icon48.png, icon128.png)
- ✅ Extension has icons in `Highlighting Extension/icons/` (icon16.png, icon48.png, icon128.png)
- ✅ Both projects are configured to use their local icons

## Setup

Each project now has its own local copy of the icons. No additional setup is needed.

## Icon Files

Each `icons/` folder contains:
- `icon16.png` - 16x16 icon
- `icon48.png` - 48x48 icon  
- `icon128.png` - 128x128 icon

## Verifying Setup

- **Extension**: Check that `Highlighting Extension/icons/icon16.png`, `icon48.png`, and `icon128.png` exist
- **Desktop App**: Check that `Highlighting Desktop App/icons/icon16.png`, `icon48.png`, and `icon128.png` exist
- **Desktop App Build**: Icons are referenced in `package.json` build configuration as `icons/icon128.png`

