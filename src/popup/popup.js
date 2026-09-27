const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

const { apiKey, model } = await chrome.storage.local.get(['apiKey', 'model']);
const keyEl = document.getElementById('key');
if (apiKey) {
  keyEl.textContent = `saved (${apiKey.slice(0, 8)}...)`;
} else {
  keyEl.textContent = 'missing - set it in Options';
  keyEl.className = 'warn';
}
document.getElementById('model').textContent = model || 'typesafe/jev-router (default)';

const { size } = await chrome.runtime.sendMessage({ type: 'ytvb:cacheSize' });
document.getElementById('cache').textContent = String(size ?? 0);

// Is the content script actually alive in the tab the user is looking at? Without this the
// extension fails silently whenever it was installed after that tab was opened.
const pageEl = document.getElementById('page');
if (tab?.url?.includes('youtube.com')) {
  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: 'ytvb:status' });
    pageEl.textContent = `${status.scored} of ${status.cards} thumbnails scored`;
    if (status.scored === 0) pageEl.className = 'warn';
  } catch {
    pageEl.textContent = 'not running - reload the tab, or click Inject below';
    pageEl.className = 'warn';
  }
} else {
  pageEl.textContent = 'not a YouTube tab';
}

document.getElementById('inject').addEventListener('click', async () => {
  const { count } = await chrome.runtime.sendMessage({ type: 'ytvb:injectNow' });
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'ytvb:rescan' }).catch(() => {});
  pageEl.className = '';
  pageEl.textContent = `injected into ${count} tab(s) - give it a few seconds`;
});

document.getElementById('rescan').addEventListener('click', async () => {
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'ytvb:rescan' }).catch(() => {});
  window.close();
});

document.getElementById('clear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'ytvb:clearCache' });
  document.getElementById('cache').textContent = '0';
});
