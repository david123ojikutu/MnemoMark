// Firebase REST configuration (data-only, no remote code execution)
// globalThis so the same file works in the MV3 service worker (no `window`).
const _mnemomarkGlobal = typeof globalThis !== 'undefined' ? globalThis : window;
_mnemomarkGlobal.authConfig = {
  apiKey: "AIzaSyBzG-9qup2eEtJtmr9vqvBGXBJqlf4Z5yA",
  projectId: "mnemomark"
};
