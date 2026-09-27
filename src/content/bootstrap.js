// Content scripts cannot use static ESM imports, so this classic script
// dynamically imports the real module from web_accessible_resources.
(() => {
  const url = chrome.runtime.getURL('content/main.js');
  import(url)
    .then((mod) => mod.start())
    .catch((err) => console.error('[ytvb] failed to load content module', err));
})();
