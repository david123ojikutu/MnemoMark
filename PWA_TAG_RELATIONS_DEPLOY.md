# MnemoMark Tag Relations (standalone PWA)

This is a **separate installable PWA** from the main MnemoMark app. Source lives under `pwa/`; production files are built into `dist/tag-relations-pwa/`.

## GitHub Pages (MnemoMark repo)

The [PWA workflow](.github/workflows/pwa.yml) runs `npm run build` and publishes `dist/` to GitHub Pages. After a successful deploy:

- **Tag Relations PWA:** `https://david123ojikutu.github.io/MnemoMark/tag-relations-pwa/`
- **Main MnemoMark PWA:** `https://david123ojikutu.github.io/MnemoMark/`

### Firebase Auth

In [Firebase Console](https://console.firebase.google.com/) → Authentication → Settings → **Authorized domains**, add:

- `david123ojikutu.github.io`

### Local build

```bash
npm run build
```

Open `dist/tag-relations-pwa/index.html` via a local server (service worker needs `http://localhost` or `https`).

### PWABuilder (optional)

```bash
npm run pwa:package-tag-relations
```

---

## Firebase Hosting (optional)

From repo root: `npm run firebase:deploy` — see `firebase.json` if configured.
