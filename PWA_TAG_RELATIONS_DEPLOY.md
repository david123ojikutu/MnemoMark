# MnemoMark Tag Relations (standalone PWA)

This is a **separate installable PWA** from the main MnemoMark app. All source for this app lives in **`tag-relations-pwa/`** (own `package.json`, `manifest.json`, and service worker). Production files are emitted to **`dist/tag-relations-pwa/`**.

The main repo `npm run build` runs the MnemoMark PWA build and then **`tag-relations-pwa/build.js`**, so the [PWA workflow](.github/workflows/pwa.yml) still publishes both apps to GitHub Pages.

## GitHub Pages

- **Tag Relations PWA:** `https://david123ojikutu.github.io/MnemoMark/tag-relations-pwa/`
- **Main MnemoMark PWA:** `https://david123ojikutu.github.io/MnemoMark/`

### Firebase Auth

In [Firebase Console](https://console.firebase.google.com/) → Authentication → Settings → **Authorized domains**, add:

- `david123ojikutu.github.io`

## Local build

From repository root:

```bash
npm run build
```

Or only Tag Relations:

```bash
npm run build:tag-relations
```

Open `dist/tag-relations-pwa/index.html` via a local server (service worker needs `http://localhost` or `https`).

## Releases (separate from main MnemoMark `v*` releases)

To publish a **Tag Relations–only** GitHub Release with a zip of the built PWA, push a tag whose name starts with **`tag-relations-v`** (for example `tag-relations-v1.0.0`). The workflow [tag-relations-release.yml](.github/workflows/tag-relations-release.yml) builds `tag-relations-pwa/` and attaches `tag-relations-pwa-<tag>.zip` to that release.

Main MnemoMark installer releases continue to use tags like **`v1.2.3`** and the existing PWA workflow.

### PWABuilder (optional)

```bash
npm run pwa:package-tag-relations
```

## Firebase Hosting (optional)

Root `firebase.json` targets the main `pwa/` folder. Host this app separately if needed by pointing Firebase at `dist/tag-relations-pwa/` or copying that folder into another hosting project.
