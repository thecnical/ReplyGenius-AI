/**
 * ReplyGenius AI - Professional Popup Script
 * Full backend integration with modern UI/UX
 */

(function() {
  'use strict';

  // ========================================
  // CONFIGURATION
  // ========================================
  const CONFIG = {
    API_BASE: 'http://localhost:3000',
    ENDPOINTS: {
      GENERATE_REPLY: '/api/generate-reply',
      MODELS: '/api/models',
      HISTORY: '/api/history',
      SAVE_REPLY: '/api/history',
      HEALTH: '/api/health'
    },
    TIMEOUT: 30000,
    MAX_REPLIES: 5,
    DEBOUNCE_MS: 300
  };

  // ========================================
  // STATE MANAGEMENT
  // ========================================
  const state = {
    currentReply: null,
    replies: [],
    selectedIndex: 0,
    isLoading: false,
    settings: {
      apiEndpoint: CONFIG.API_BASE,
      defaultTone: 'professional',
      defaultPriority: 'balanced',
      autoCopy: false,
      showStreaming: true,
      soundEffects: false
    },
    stats: {
      repliesToday: 0,
      favorites: 0
    },
    history: []
  };

  // ========================================
  // DOM ELEMENTS
  // ========================================
  const elements = {
    // Header
    statusBadge: document.getElementById('statusBadge'),
    settingsBtn: document.getElementById('settingsBtn'),
    
    // Input
    messageInput: document.getElementById('messageInput'),
    charCount: document.getElementById('charCount'),
    clearBtn: document.getElementById('clearBtn'),
    
    // Options
    toneSelect: document.getElementById('toneSelect'),
    platformSelect: document.getElementById('platformSelect'),
    prioritySelect: document.getElementById('prioritySelect'),
    
    // Generate
    generateBtn: document.getElementById('generateBtn'),
    
    // Loading
    loadingSection: document.getElementById('loadingSection'),
    loadingSubtitle: document.getElementById('loadingSubtitle'),
    progressBar: document.getElementById('progressBar'),
    
    // Results
    resultsSection: document.getElementById('resultsSection'),
    resultsCount: document.getElementById('resultsCount'),
    copyAllBtn: document.getElementById('copyAllBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    repliesTrack: document.getElementById('repliesTrack'),
    carouselDots: document.getElementById('carouselDots'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    selectedPreview: document.getElementById('selectedPreview'),
    previewContent: document.getElementById('previewContent'),
    editBtn: document.getElementById('editBtn'),
    useReplyBtn: document.getElementById('useReplyBtn'),
    
    // Error
    errorSection: document.getElementById('errorSection'),
    errorMessage: document.getElementById('errorMessage'),
    retryBtn: document.getElementById('retryBtn'),
    
    // History
    historyPreview: document.getElementById('historyPreview'),
    historyList: document.getElementById('historyList'),
    viewAllHistoryBtn: document.getElementById('viewAllHistoryBtn'),
    
    // Footer
    repliesToday: document.getElementById('repliesToday'),
    favoritesCount: document.getElementById('favoritesCount'),
    historyBtn: document.getElementById('historyBtn'),
    helpBtn: document.getElementById('helpBtn'),
    
    // Modals
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    apiEndpoint: document.getElementById('apiEndpoint'),
    defaultTone: document.getElementById('defaultTone'),
    defaultPriority: document.getElementById('defaultPriority'),
    autoCopy: document.getElementById('autoCopy'),
    showStreaming: document.getElementById('showStreaming'),
    soundEffects: document.getElementById('soundEffects'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    
    historyModal: document.getElementById('historyModal'),
    closeHistoryBtn: document.getElementById('closeHistoryBtn'),
    historySearch: document.getElementById('historySearch'),
    historyFilter: document.getElementById('historyFilter'),
    historyItems: document.getElementById('historyItems')
  };

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function showElement(el) {
    el?.classList.add('active');
  }

  function hideElement(el) {
    el?.classList.remove('active');
  }

  function setStatus(status, label) {
    const badge = elements.statusBadge;
    badge.className = 'status-badge ' + status;
    badge.querySelector('.status-label').textContent = label;
  }

  function showError(message) {
    elements.errorMessage.textContent = message;
    showElement(elements.errorSection);
    hideElement(elements.loadingSection);
    hideElement(elements.resultsSection);
    setStatus('error', 'Error');
  }

  function clearError() {
    hideElement(elements.errorSection);
  }

  // ========================================
  // API FUNCTIONS
  // ========================================
  async function apiCall(endpoint, options = {}) {
    const url = state.settings.apiEndpoint + endpoint;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'API request failed');
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  }

  async function generateReply() {
    const message = elements.messageInput.value.trim();
    
    if (!message) {
      showError('Please enter a message');
      return;
    }

    state.isLoading = true;
    clearError();
    hideElement(elements.resultsSection);
    hideElement(elements.errorSection);
    showElement(elements.loadingSection);
    elements.generateBtn.disabled = true;
    setStatus('', 'Generating...');

    // Update loading subtitle
    const priorities = {
      fast: 'Using fast AI model...',
      balanced: 'Analyzing context...',
      premium: 'Using premium AI...'
    };
    elements.loadingSubtitle.textContent = priorities[state.settings.defaultPriority] || 'Processing...';

    try {
      const result = await apiCall(CONFIG.ENDPOINTS.GENERATE_REPLY, {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: message }],
          tone: elements.toneSelect.value,
          platform: elements.platformSelect.value,
          priority: elements.prioritySelect.value
        })
      });

      if (result.success && result.replies) {
        state.replies = result.replies;
        state.selectedIndex = 0;
        displayReplies(result);
        
        // Update stats
        state.stats.repliesToday++;
        elements.repliesToday.textContent = state.stats.repliesToday;
        
        setStatus('', 'Ready');
      } else {
        throw new Error(result.error?.message || 'Failed to generate replies');
      }
    } catch (error) {
      console.error('Generate error:', error);
      showError(error.message);
      setStatus('error', 'Failed');
    } finally {
      state.isLoading = false;
      hideElement(elements.loadingSection);
      elements.generateBtn.disabled = false;
    }
  }

  async function loadHistory() {
    try {
      const result = await apiCall(CONFIG.ENDPOINTS.HISTORY, {
        method: 'GET'
      });
      
      if (result.history) {
        state.history = result.history;
        displayHistoryPreview(result.history.slice(0, 3));
        
        // Update stats
        state.stats.favorites = result.history.filter(h => h.favorite).length;
        elements.favoritesCount.textContent = state.stats.favorites;
      }
    } catch (error) {
      console.error('Load history error:', error);
    }
  }

  // ========================================
  // UI RENDERING
  // ========================================
  function displayReplies(data) {
    hideElement(elements.loadingSection);
    hideElement(elements.errorSection);
    showElement(elements.resultsSection);

    // Update count
    elements.resultsCount.textContent = `(${data.replies.length})`;

    // Clear and populate track
    elements.repliesTrack.innerHTML = '';
    elements.carouselDots.innerHTML = '';

    data.replies.forEach((reply, index) => {
      // Create reply card
      const card = document.createElement('div');
      card.className = 'reply-card' + (index === 0 ? ' selected' : '');
      card.dataset.index = index;
      
      card.innerHTML = `
        <span class="reply-number">${index + 1}</span>
        <div class="reply-content">${reply}</div>
        <div class="reply-meta">
          <span class="reply-provider">${data.provider || 'AI'}</span>
          <span class="reply-tone">${elements.toneSelect.value}</span>
        </div>
      `;
      
      card.addEventListener('click', () => selectReply(index));
      elements.repliesTrack.appendChild(card);
      
      // Create dot
      const dot = document.createElement('span');
      dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
      dot.addEventListener('click', () => goToSlide(index));
      elements.carouselDots.appendChild(dot);
    });

    // Select first reply
    if (data.replies.length > 0) {
      selectReply(0);
    }
  }

  function selectReply(index) {
    state.selectedIndex = index;
    state.currentReply = state.replies[index];
    
    // Update cards
    document.querySelectorAll('.reply-card').forEach((card, i) => {
      card.classList.toggle('selected', i === index);
    });
    
    // Update dots
    document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
    
    // Update preview
    elements.previewContent.textContent = state.currentReply;
    
    // Update carousel position
    const track = elements.repliesTrack;
    track.style.transform = `translateX(-${index * 100}%)`;
  }

  function goToSlide(index) {
    if (index >= 0 && index < state.replies.length) {
      selectReply(index);
    }
  }

  function displayHistoryPreview(items) {
    if (!items || items.length === 0) {
      elements.historyList.innerHTML = '<div class="text-center text-muted">No history yet</div>';
      return;
    }

    elements.historyList.innerHTML = items.map(item => `
      <div class="history-item" data-id="${item._id}">
        <div class="history-item-content">
          <div class="history-item-text">${item.generatedReply?.substring(0, 50)}...</div>
          <div class="history-item-meta">${item.platform} • ${item.tone}</div>
        </div>
        <div class="history-item-actions">
          <button class="history-item-btn copy-btn" title="Copy">📋</button>
          <button class="history-item-btn fav-btn" title="Favorite">${item.favorite ? '⭐' : '☆'}</button>
        </div>
      </div>
    `).join('');
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      // Show feedback
      elements.useReplyBtn.innerHTML = '<span>✓</span> Copied!';
      setTimeout(() => {
        elements.useReplyBtn.innerHTML = '<span>📝</span> Use This Reply';
      }, 2000);
    });
  }

  // ========================================
  // EVENT HANDLERS
  // ========================================
  function setupEventListeners() {
    // Input
    elements.messageInput.addEventListener('input', debounce(() => {
      const length = elements.messageInput.value.length;
      elements.charCount.textContent = `${length}/500`;
    }, 100));

    elements.clearBtn.addEventListener('click', () => {
      elements.messageInput.value = '';
      elements.charCount.textContent = '0/500';
      hideElement(elements.resultsSection);
      hideElement(elements.errorSection);
    });

    // Generate
    elements.generateBtn.addEventListener('click', generateReply);

    // Keyboard shortcut
    elements.messageInput.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        generateReply();
      }
    });

    // Carousel navigation
    elements.prevBtn.addEventListener('click', () => {
      goToSlide(state.selectedIndex - 1);
    });

    elements.nextBtn.addEventListener('click', () => {
      goToSlide(state.selectedIndex + 1);
    });

    // Action buttons
    elements.useReplyBtn.addEventListener('click', () => {
      if (state.currentReply) {
        copyToClipboard(state.currentReply);
      }
    });

    elements.refreshBtn.addEventListener('click', generateReply);

    elements.copyAllBtn.addEventListener('click', () => {
      if (state.replies.length > 0) {
        const allReplies = state.replies.join('\n\n---\n\n');
        copyToClipboard(allReplies);
      }
    });

    // Error retry
    elements.retryBtn.addEventListener('click', generateReply);

    // Settings modal
    elements.settingsBtn.addEventListener('click', () => {
      loadSettings();
      showElement(elements.settingsModal);
    });

    elements.closeSettingsBtn.addEventListener('click', () => {
      hideElement(elements.settingsModal);
    });

    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.resetSettingsBtn.addEventListener('click', resetSettings);

    // History modal
    elements.historyBtn.addEventListener('click', () => {
      showElement(elements.historyModal);
      loadHistory();
    });

    elements.viewAllHistoryBtn?.addEventListener('click', () => {
      showElement(elements.historyModal);
      loadHistory();
    });

    elements.closeHistoryBtn.addEventListener('click', () => {
      hideElement(elements.historyModal);
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          hideElement(overlay);
        }
      });
    });
  }

  // ========================================
  // SETTINGS
  // ========================================
  function loadSettings() {
    chrome.storage.sync.get(null, (items) => {
      state.settings = {
        apiEndpoint: items.apiEndpoint || CONFIG.API_BASE,
        defaultTone: items.tone || 'professional',
        defaultPriority: items.priority || 'balanced',
        autoCopy: items.autoCopy || false,
        showStreaming: items.showStreaming !== false,
        soundEffects: items.soundEffects || false
      };

      // Update form
      elements.apiEndpoint.value = state.settings.apiEndpoint;
      elements.defaultTone.value = state.settings.defaultTone;
      elements.defaultPriority.value = state.settings.defaultPriority;
      elements.autoCopy.checked = state.settings.autoCopy;
      elements.showStreaming.checked = state.settings.showStreaming;
      elements.soundEffects.checked = state.settings.soundEffects;

      // Update selects
      elements.toneSelect.value = state.settings.defaultTone;
      elements.prioritySelect.value = state.settings.defaultPriority;
    });
  }

  function saveSettings() {
    const newSettings = {
      apiEndpoint: elements.apiEndpoint.value || CONFIG.API_BASE,
      tone: elements.defaultTone.value,
      priority: elements.defaultPriority.value,
      defaultTone: elements.defaultTone.value,
      defaultPriority: elements.defaultPriority.value,
      autoCopy: elements.autoCopy.checked,
      showStreaming: elements.showStreaming.checked,
      soundEffects: elements.soundEffects.checked
    };

    chrome.storage.sync.set(newSettings, () => {
      state.settings = newSettings;
      CONFIG.API_BASE = newSettings.apiEndpoint;
      
      // Show saved feedback
      elements.saveSettingsBtn.textContent = '✓ Saved!';
      setTimeout(() => {
        elements.saveSettingsBtn.textContent = 'Save Settings';
        hideElement(elements.settingsModal);
      }, 1000);
    });
  }

  function resetSettings() {
    chrome.storage.sync.clear(() => {
      loadSettings();
    });
  }

  // ========================================
  // INITIALIZATION
  // ========================================
  async function init() {
    console.log('⚡ ReplyGenius AI Popup initialized');
    
    // Setup events
    setupEventListeners();
    
    // Load settings
    loadSettings();
    
    // Update API base
    CONFIG.API_BASE = state.settings.apiEndpoint;
    
    // Load history
    loadHistory();
    
    // Check API health
    checkApiHealth();
    
    // Focus input
    elements.messageInput.focus();
  }

  async function checkApiHealth() {
    try {
      const result = await apiCall(CONFIG.ENDPOINTS.HEALTH);
      if (result.status === 'ok') {
        setStatus('', 'Ready');
      } else {
        setStatus('warning', 'Degraded');
      }
    } catch (error) {
      setStatus('error', 'Offline');
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
