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

document.getElementById('rescan').addEventListener('click', async () => {
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'ytvb:rescan' }).catch(() => {});
  window.close();
});

document.getElementById('clear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'ytvb:clearCache' });
  document.getElementById('cache').textContent = '0';
});
