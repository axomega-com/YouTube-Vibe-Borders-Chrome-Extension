const keyInput = document.getElementById('key');
const modelInput = document.getElementById('model');
const status = document.getElementById('status');

const { apiKey, model } = await chrome.storage.local.get(['apiKey', 'model']);
if (apiKey) keyInput.placeholder = `${apiKey.slice(0, 8)}... (saved; type to replace)`;
modelInput.value = model ?? '';

document.getElementById('save').addEventListener('click', async () => {
  const patch = {};
  if (keyInput.value.trim()) patch.apiKey = keyInput.value.trim();
  if (modelInput.value.trim()) patch.model = modelInput.value.trim();
  else await chrome.storage.local.remove('model');
  await chrome.storage.local.set(patch);
  status.textContent = `Saved. Key: ${patch.apiKey ? 'updated' : 'unchanged'}; model: ${modelInput.value.trim() || 'default'}.`;
  keyInput.value = '';
});
