// Content scripts cannot use static ESM imports, so this classic script
// dynamically imports the real module from web_accessible_resources.
(() => {
  // chrome.scripting can inject this into tabs that were already open, on top of the
  // manifest-registered injection. Guard so start() never runs twice.
  if (window.__ytvbStarted) return;
  window.__ytvbStarted = true;

  const url = chrome.runtime.getURL('content/main.js');
  import(url)
    .then((mod) => mod.start())
    .catch((err) => console.error('[ytvb] failed to load content module', err));
})();
