/**
 * ReplyGenius AI - Background Service Worker
 * Handles background tasks, messaging, and keyboard shortcuts
 */

// Constants
const COMMANDS = {
  GENERATE_REPLY: 'generate-reply'
};

// Message Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
  switch (message.type) {
    case 'GET_SETTINGS':
      handleGetSettings().then(sendResponse);
      return true;
      
    case 'SAVE_SETTINGS':
      handleSaveSettings(message.data).then(sendResponse);
      return true;
      
    case 'OPEN_POPUP':
      handleOpenPopup();
      sendResponse({ success: true });
      return;
      
    case 'NOTIFY':
      handleNotify(message.data);
      sendResponse({ success: true });
      return;
      
    default:
      console.log('Unknown message type:', message.type);
  }
});

// Command Handler
chrome.commands.onCommand.addListener((command) => {
  console.log('Command triggered:', command);
  
  if (command === COMMANDS.GENERATE_REPLY) {
    handleGenerateReplyCommand();
  }
});

// Tab Handler
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('Tab switched:', activeInfo.tabId);
});

// Install Handler
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      tone: 'professional',
      platform: 'general',
      priority: 'balanced',
      apiUrl: 'http://localhost:3000',
      autoSend: false,
      darkMode: true
    });
  }
});

// Startup Handler
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
});

// Settings Handlers
async function handleGetSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (items) => {
      resolve(items);
    });
  });
}

async function handleSaveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      resolve({ success: true });
    });
  });
}

// Popup Handler
function handleOpenPopup() {
  chrome.action.openPopup();
}

// Notification Handler
function handleNotify(data) {
  const { title, message, type = 'info' } = data;
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title || 'ReplyGenius AI',
    message: message || 'Notification from ReplyGenius AI',
    priority: type === 'error' ? 2 : 1
  });
}

// Generate Reply Command Handler
async function handleGenerateReplyCommand() {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab) {
      // Send message to content script to get selected text or input
      chrome.tabs.sendMessage(tab.id, { type: 'GET_INPUT' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not send message to tab');
        }
      });
    }
  } catch (error) {
    console.error('Error handling generate reply command:', error);
  }
}

// Context Menu Handler
chrome.contextMenus?.removeAll(() => {
  chrome.contextMenus?.create({
    id: 'replygenius-generate',
    title: 'Generate Reply with ReplyGenius AI',
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

// Storage Change Handler
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('Storage changed:', Object.keys(changes));
  
  // Broadcast changes to popup if open
  chrome.runtime.sendMessage({
    type: 'SETTINGS_CHANGED',
    changes: Object.keys(changes)
  }).catch(() => {
    // Popup might not be open, ignore error
  });
});

// Badge Handler
function setBadge(text, color = '#00d4ff') {
  chrome.action.setBadgeText({ text: text });
  chrome.action.setBadgeBackgroundColor({ color: color });
}

// Clear badge on startup
chrome.runtime.onStartup.addListener(() => {
  setBadge('');
});

console.log('ReplyGenius AI Background Service Worker loaded');
