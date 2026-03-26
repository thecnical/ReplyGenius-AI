/**
 * ReplyGenius AI V2 - Background Service Worker
 * Handles auth persistence, token refresh, messaging relay, and alarms
 */

// Constants
const COMMANDS = { GENERATE_REPLY: 'generate-reply' };
const TOKEN_REFRESH_ALARM = 'rg-token-refresh';

// ========================================
// MESSAGE HANDLER
// ========================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      handleGetSettings().then(sendResponse);
      return true;

    case 'SAVE_SETTINGS':
      handleSaveSettings(message.data).then(sendResponse);
      return true;

    case 'OPEN_POPUP':
      chrome.action.openPopup?.();
      sendResponse({ success: true });
      return;

    case 'NOTIFY':
      handleNotify(message.data);
      sendResponse({ success: true });
      return;

    case 'SET_AUTH_TOKEN':
      chrome.storage.sync.set({ authToken: message.token }, () => {
        sendResponse({ success: true });
      });
      return true;

    case 'CLEAR_AUTH':
      chrome.storage.sync.remove(['authToken', 'userData'], () => {
        sendResponse({ success: true });
      });
      return true;

    case 'RELAY_TO_CONTENT':
      // Relay message from popup to active tab's content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, message.payload, (response) => {
            sendResponse(response || { success: false });
          });
        }
      });
      return true;

    default:
      break;
  }
});

// ========================================
// COMMAND HANDLER
// ========================================
chrome.commands.onCommand.addListener((command) => {
  if (command === COMMANDS.GENERATE_REPLY) {
    handleGenerateReplyCommand();
  }
});

// ========================================
// INSTALL/STARTUP
// ========================================
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      tone: 'professional',
      platform: 'general',
      priority: 'balanced',
      apiUrl: 'https://replygenius-ai.onrender.com',
      autoMode: 'manual',
      personality: null,
      darkMode: true,
      voiceEnabled: false
    });
  }

  // Set up token refresh alarm (every 6 hours)
  chrome.alarms.create(TOKEN_REFRESH_ALARM, { periodInMinutes: 360 });
});

chrome.runtime.onStartup.addListener(() => {
  setBadge('');
  chrome.alarms.create(TOKEN_REFRESH_ALARM, { periodInMinutes: 360 });
});

// ========================================
// ALARM HANDLER (Token Refresh)
// ========================================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TOKEN_REFRESH_ALARM) {
    await refreshAuthToken();
  }
});

async function refreshAuthToken() {
  try {
    const { authToken, apiUrl } = await chrome.storage.sync.get(['authToken', 'apiUrl']);
    if (!authToken) return;

    const baseUrl = apiUrl || 'https://replygenius-ai.onrender.com';
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.token) {
        await chrome.storage.sync.set({ authToken: data.token });
      }
    }
  } catch (refreshError) {
    console.warn('Token refresh failed:', refreshError.message);
  }
}

// ========================================
// HELPERS
// ========================================
async function handleGetSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (items) => resolve(items));
  });
}

async function handleSaveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => resolve({ success: true }));
  });
}

function handleNotify(data) {
  const { title, message, type = 'info' } = data;
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title || 'ReplyGenius AI V2',
    message: message || '',
    priority: type === 'error' ? 2 : 1
  });
}

async function handleGenerateReplyCommand() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'GENERATE_FROM_CONTEXT' }, () => {
        if (chrome.runtime.lastError) { /* tab might not have content script */ }
      });
    }
  } catch (cmdError) {
    console.warn('Generate reply command failed:', cmdError.message);
  }
}

// ========================================
// CONTEXT MENU
// ========================================
chrome.contextMenus?.removeAll(() => {
  chrome.contextMenus?.create({
    id: 'replygenius-generate',
    title: '⚡ Generate Reply with ReplyGenius AI',
    contexts: ['selection', 'editable']
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'replygenius-generate') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'GENERATE_FROM_CONTEXT',
      text: info.selectionText
    });
  }
});

// ========================================
// STORAGE CHANGE BROADCAST
// ========================================
chrome.storage.onChanged.addListener((changes) => {
  // Notify content scripts of config changes
  const configKeys = ['tone', 'priority', 'personality', 'autoMode', 'apiEndpoint', 'authToken'];
  const relevantChanges = {};
  let hasRelevant = false;

  for (const key of configKeys) {
    if (changes[key]) {
      relevantChanges[key] = changes[key].newValue;
      hasRelevant = true;
    }
  }

  if (hasRelevant) {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_CONFIG', data: relevantChanges }).catch(() => {});
      }
    });
  }
});

// Badge helper
function setBadge(text, color = '#00d4ff') {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

console.log('⚡ ReplyGenius AI V2 Background Service Worker loaded');
