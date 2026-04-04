// PWA bootstrap: service worker + chrome.storage.local polyfill for shared scripts

(function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  const script = document.currentScript;
  if (!script || !script.src) return;
  const scriptUrl = new URL(script.src);
  const swUrl = new URL('sw.js', scriptUrl);
  const scope = scriptUrl.pathname.replace(/[^/]*$/, '');
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl.href, { scope: `${scriptUrl.origin}${scope}` })
      .then((registration) => {
        console.log('MnemoMark SW registered:', registration.scope);
      })
      .catch((error) => {
        console.warn('MnemoMark SW registration failed:', error);
      });
  });
})();

if (typeof chrome === 'undefined' || !chrome.storage) {
  window.chrome = window.chrome || {};
  window.chrome.storage = window.chrome.storage || {};
  window.chrome.storage.local = {
    get: (keys, callback) => {
      const result = {};
      const keysArray = keys === null ? Object.keys(localStorage) : Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((key) => {
        const value = localStorage.getItem(key);
        if (value !== null) {
          try {
            result[key] = JSON.parse(value);
          } catch (e) {
            result[key] = value;
          }
        }
      });
      if (callback) callback(result);
      return Promise.resolve(result);
    },
    set: (items, callback) => {
      Object.keys(items).forEach((key) => {
        localStorage.setItem(key, JSON.stringify(items[key]));
      });
      if (callback) callback();
      return Promise.resolve();
    },
    remove: (keys, callback) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((key) => localStorage.removeItem(key));
      if (callback) callback();
      return Promise.resolve();
    }
  };
}
