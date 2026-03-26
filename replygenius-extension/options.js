/**
 * ReplyGenius AI - Options Page Script
 */

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
});

async function loadSettings() {
  const result = await chrome.storage.sync.get(null);
  
  document.getElementById('apiUrl').value = result.apiUrl || 'http://localhost:3000';
  document.getElementById('defaultTone').value = result.tone || 'professional';
  document.getElementById('defaultPriority').value = result.priority || 'balanced';
}

async function saveSettings() {
  const settings = {
    apiUrl: document.getElementById('apiUrl').value,
    tone: document.getElementById('defaultTone').value,
    priority: document.getElementById('defaultPriority').value
  };
  
  await chrome.storage.sync.set(settings);
  
  const status = document.getElementById('status');
  status.textContent = 'Settings saved successfully!';
  status.className = 'status success';
  status.classList.remove('hidden');
  
  setTimeout(() => {
    status.classList.add('hidden');
  }, 3000);
}
