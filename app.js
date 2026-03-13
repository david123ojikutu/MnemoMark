// PWA-specific initialization
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
}

// PWA: Use localStorage instead of chrome.storage for web version
if (typeof chrome === 'undefined' || !chrome.storage) {
  // Polyfill chrome.storage.local for web
  window.chrome = window.chrome || {};
  window.chrome.storage = window.chrome.storage || {};
  window.chrome.storage.local = {
    get: (keys, callback) => {
      const result = {};
      const keysArray = keys === null ? Object.keys(localStorage) : (Array.isArray(keys) ? keys : [keys]);
      keysArray.forEach(key => {
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
      Object.keys(items).forEach(key => {
        localStorage.setItem(key, JSON.stringify(items[key]));
      });
      if (callback) callback();
      return Promise.resolve();
    },
    remove: (keys, callback) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(key => localStorage.removeItem(key));
      if (callback) callback();
      return Promise.resolve();
    }
  };
}
