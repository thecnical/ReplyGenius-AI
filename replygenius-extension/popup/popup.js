/**
 * ReplyGenius AI V2 - Popup JavaScript
 * Full-feature integration: tabs, auth, templates, personality, analytics, voice, memory
 */

(function () {
  'use strict';

  // ========================================
  // STATE
  // ========================================
  const state = {
    apiUrl: 'https://replygenius-ai.onrender.com',
    authToken: null,
    userData: null,
    tone: 'professional',
    platform: 'general',
    priority: 'balanced',
    personality: null,
    mode: 'manual',
    isLoggedIn: false,
    isRecording: false,
    recognition: null
  };

  // ========================================
  // INIT
  // ========================================
  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    initTabs();
    initModeSelector();
    initPersonalityGrid();
    initHomeTab();
    initAuthTab();
    initTemplatesTab();
    initVoice();
    await checkAuth();
  });

  // ========================================
  // SETTINGS
  // ========================================
  async function loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.get(null, (items) => {
          if (items.apiUrl) state.apiUrl = items.apiUrl;
          if (items.authToken) state.authToken = items.authToken;
          if (items.tone) state.tone = items.tone;
          if (items.platform) state.platform = items.platform;
          if (items.priority) state.priority = items.priority;
          if (items.personality) state.personality = items.personality;
          if (items.autoMode) state.mode = items.autoMode;
          if (items.userData) state.userData = items.userData;

          // Apply to selects
          const toneEl = document.getElementById('toneSelect');
          const platEl = document.getElementById('platformSelect');
          const prioEl = document.getElementById('prioritySelect');
          if (toneEl) toneEl.value = state.tone;
          if (platEl) platEl.value = state.platform;
          if (prioEl) prioEl.value = state.priority;

          // Apply mode
          document.querySelectorAll('.mode-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === state.mode);
          });

          // Apply personality
          document.querySelectorAll('.personality-card').forEach(c => {
            c.classList.toggle('active', (c.dataset.pid || '') === (state.personality || ''));
          });

          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  function saveSettings(data) {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set(data);
    }
    // Relay to content scripts
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'RELAY_TO_CONTENT',
        payload: { type: 'UPDATE_CONFIG', data }
      });
    }
  }

  // ========================================
  // TABS
  // ========================================
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(`tab-${btn.dataset.tab}`);
        if (panel) panel.classList.add('active');

        // Load tab data
        if (btn.dataset.tab === 'dashboard' && state.isLoggedIn) loadDashboard();
        if (btn.dataset.tab === 'templates') loadTemplates();
      });
    });
  }

  // ========================================
  // MODE SELECTOR
  // ========================================
  function initModeSelector() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.mode = btn.dataset.mode;
        saveSettings({ autoMode: state.mode });

        // Notify content script
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'RELAY_TO_CONTENT',
            payload: { type: 'SET_MODE', mode: state.mode }
          });
        }
      });
    });
  }

  // ========================================
  // PERSONALITY GRID
  // ========================================
  function initPersonalityGrid() {
    document.querySelectorAll('.personality-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.personality-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        state.personality = card.dataset.pid || null;
        saveSettings({ personality: state.personality });
      });
    });
  }

  // ========================================
  // HOME TAB
  // ========================================
  function initHomeTab() {
    const messageInput = document.getElementById('messageInput');
    const charCounter = document.getElementById('charCounter');
    const generateBtn = document.getElementById('generateBtn');
    const clearBtn = document.getElementById('clearBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const retryBtn = document.getElementById('retryBtn');
    const copyAllBtn = document.getElementById('copyAllBtn');
    const ttsBtn = document.getElementById('ttsBtn');

    // Char counter
    messageInput.addEventListener('input', () => {
      charCounter.textContent = `${messageInput.value.length}/500`;
    });

    // Generate
    generateBtn.addEventListener('click', () => generateReply());
    clearBtn.addEventListener('click', () => {
      messageInput.value = '';
      charCounter.textContent = '0/500';
      hideAll();
    });
    refreshBtn.addEventListener('click', () => generateReply());
    retryBtn.addEventListener('click', () => generateReply());

    // Copy all
    copyAllBtn.addEventListener('click', () => {
      const cards = document.querySelectorAll('.reply-content');
      const all = Array.from(cards).map((c, i) => `${i + 1}. ${c.textContent}`).join('\n\n');
      navigator.clipboard.writeText(all);
      showStatus('Copied all!', 'success');
    });

    // TTS
    ttsBtn.addEventListener('click', () => {
      const selected = document.querySelector('.reply-card.selected .reply-content');
      if (selected) {
        speakText(selected.textContent);
      } else {
        showStatus('Select a reply first', 'warning');
      }
    });

    // Tone/Platform/Priority change
    document.getElementById('toneSelect').addEventListener('change', (e) => {
      state.tone = e.target.value;
      saveSettings({ tone: state.tone });
    });
    document.getElementById('platformSelect').addEventListener('change', (e) => {
      state.platform = e.target.value;
      saveSettings({ platform: state.platform });
    });
    document.getElementById('prioritySelect').addEventListener('change', (e) => {
      state.priority = e.target.value;
      saveSettings({ priority: state.priority });
    });
  }

  // ========================================
  // GENERATE REPLY
  // ========================================
  let currentReplies = [];

  async function generateReply() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();

    if (!text) {
      showStatus('Enter a message first', 'warning');
      return;
    }

    const messages = [{ role: 'user', content: text }];

    showLoading(true);
    hideResults();
    hideError();

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;

      const resp = await fetch(`${state.apiUrl}/api/generate-reply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages,
          tone: state.tone,
          platform: state.platform,
          priority: state.priority,
          personality: state.personality
        })
      });

      const data = await resp.json();

      if (data.success && data.replies?.length > 0) {
        currentReplies = data.replies;
        renderReplies(data.replies, data.provider, data.contextAnalysis);
        showStatus('Ready', 'success');

        // Update footer count
        const footerToday = document.getElementById('footerToday');
        if (footerToday) {
          footerToday.textContent = Number.parseInt(footerToday.textContent) + 1;
        }
      } else {
        showError(data.error?.message || 'Failed to generate reply');
      }
    } catch (err) {
      showError('Connection failed — check backend');
    } finally {
      showLoading(false);
    }
  }

  function renderReplies(replies, provider, contextAnalysis) {
    const list = document.getElementById('resultsList');
    const countEl = document.getElementById('resultCount');
    const contextEl = document.getElementById('contextInfo');
    const section = document.getElementById('resultsSection');

    list.innerHTML = '';
    countEl.textContent = `(${replies.length})`;

    replies.forEach((reply, idx) => {
      const cleanReply = reply.replace(/[\*#]/g, '').trim();

      const card = document.createElement('div');
      card.className = 'reply-card';
      card.innerHTML = `
        <div class="reply-number">${idx + 1}</div>
        <div class="reply-content">${escapeHtml(cleanReply)}</div>
        <div class="reply-actions">
          <button class="reply-use-btn" data-idx="${idx}">↵ Use</button>
          <button class="reply-copy-btn" data-idx="${idx}">📋 Copy</button>
        </div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.reply-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      // Use button — send to content script
      card.querySelector('.reply-use-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'INSERT_REPLY',
                text: cleanReply
              });
            }
          });
        }
        navigator.clipboard.writeText(cleanReply);
        showStatus('Inserted & copied!', 'success');
      });

      // Copy button
      card.querySelector('.reply-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(cleanReply);
        e.target.textContent = '✅';
        setTimeout(() => e.target.textContent = '📋 Copy', 1500);
      });

      list.appendChild(card);
    });

    // Context info
    if (contextAnalysis) {
      const emotionEmoji = { angry: '😤', frustrated: '😫', friendly: '😊', excited: '🎉', sad: '😢', neutral: '😐' };
      contextEl.innerHTML = `🧠 Context: ${contextAnalysis.intent || 'info'} • ${emotionEmoji[contextAnalysis.emotion] || ''} ${contextAnalysis.emotion || 'neutral'} • ${contextAnalysis.urgency || 'low'} urgency`;
    } else {
      contextEl.innerHTML = '';
    }

    section.classList.add('active');
  }

  // ========================================
  // AUTH
  // ========================================
  function initAuthTab() {
    document.getElementById('showSignup').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('loginForm').classList.remove('active');
      document.getElementById('signupForm').classList.add('active');
    });
    document.getElementById('showLogin').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('signupForm').classList.remove('active');
      document.getElementById('loginForm').classList.add('active');
    });

    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('signupBtn').addEventListener('click', handleSignup);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('saveSettingsBtn')?.addEventListener('click', handleSaveAccountSettings);
    document.getElementById('resetMemoryBtn')?.addEventListener('click', handleResetMemory);
  }

  async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!email || !password) { errorEl.textContent = 'Fill in all fields'; return; }

    errorEl.textContent = '';

    try {
      const resp = await fetch(`${state.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await resp.json();

      if (data.success) {
        state.authToken = data.token;
        state.userData = data.user;
        state.isLoggedIn = true;
        saveSettings({ authToken: data.token, userData: data.user });
        updateAuthUI();
        showStatus('Logged in!', 'success');
      } else {
        errorEl.textContent = data.message || 'Login failed';
      }
    } catch (err) {
      errorEl.textContent = 'Connection error';
    }
  }

  async function handleSignup() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const errorEl = document.getElementById('signupError');

    if (!email || !password) { errorEl.textContent = 'Fill in all fields'; return; }
    if (password.length < 6) { errorEl.textContent = 'Password must be 6+ chars'; return; }

    errorEl.textContent = '';

    try {
      const resp = await fetch(`${state.apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });
      const data = await resp.json();

      if (data.success) {
        state.authToken = data.token;
        state.userData = data.user;
        state.isLoggedIn = true;
        saveSettings({ authToken: data.token, userData: data.user });
        updateAuthUI();
        showStatus('Account created!', 'success');
      } else {
        errorEl.textContent = data.message || 'Signup failed';
      }
    } catch (err) {
      errorEl.textContent = 'Connection error';
    }
  }

  async function handleLogout() {
    state.authToken = null;
    state.userData = null;
    state.isLoggedIn = false;
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'CLEAR_AUTH' });
    }
    updateAuthUI();
    showStatus('Logged out', 'info');
  }

  async function checkAuth() {
    if (!state.authToken) {
      updateAuthUI();
      return;
    }

    try {
      const resp = await fetch(`${state.apiUrl}/auth/me`, {
        headers: { 'Authorization': `Bearer ${state.authToken}` }
      });
      const data = await resp.json();

      if (data.success) {
        state.userData = data.user;
        state.isLoggedIn = true;
      } else {
        state.authToken = null;
        state.isLoggedIn = false;
      }
    } catch {
      // Keep existing state
    }

    updateAuthUI();
  }

  function updateAuthUI() {
    const authSection = document.getElementById('authSection');
    const profileSection = document.getElementById('profileSection');
    const dashGate = document.getElementById('dashLoginGate');
    const dashContent = document.getElementById('dashboardContent');

    if (state.isLoggedIn && state.userData) {
      authSection.style.display = 'none';
      profileSection.style.display = 'block';
      dashGate.style.display = 'none';
      dashContent.style.display = 'block';

      // Fill profile
      document.getElementById('profileName').textContent = state.userData.name || 'User';
      document.getElementById('profileEmail').textContent = state.userData.email || '';
      document.getElementById('profilePlan').textContent = (state.userData.plan || 'free').toUpperCase();
      document.getElementById('profileAvatar').textContent = (state.userData.name || 'U')[0].toUpperCase();

      // Usage
      const daily = state.userData.usage?.daily || 0;
      const limit = state.userData.usage?.limit || 20;
      document.getElementById('usageText').textContent = `${daily} / ${limit}`;
      document.getElementById('usageFill').style.width = `${(daily / limit) * 100}%`;
      document.getElementById('footerToday').textContent = daily;

      // Settings
      document.getElementById('settingsApiUrl').value = state.apiUrl;

      // Load dashboard
      loadDashboard();
    } else {
      authSection.style.display = 'block';
      profileSection.style.display = 'none';
      dashGate.style.display = 'block';
      dashContent.style.display = 'none';
    }
  }

  function handleSaveAccountSettings() {
    const apiUrl = document.getElementById('settingsApiUrl').value.trim();
    const voice = document.getElementById('settingsVoice').checked;

    if (apiUrl) {
      state.apiUrl = apiUrl;
      saveSettings({ apiUrl, apiEndpoint: apiUrl, voiceEnabled: voice });
      showStatus('Settings saved', 'success');
    }
  }

  async function handleResetMemory() {
    if (!state.authToken) return;
    try {
      await fetch(`${state.apiUrl}/api/memory`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.authToken}` }
      });
      showStatus('AI Memory reset', 'success');
      loadDashboard();
    } catch {
      showStatus('Failed to reset memory', 'error');
    }
  }

  // ========================================
  // TEMPLATES
  // ========================================
  async function loadTemplates() {
    const list = document.getElementById('templatesList');
    const filter = document.getElementById('templateCategoryFilter').value;

    list.innerHTML = '<div class="empty-state">Loading…</div>';

    try {
      const url = filter ? `${state.apiUrl}/api/templates?category=${filter}` : `${state.apiUrl}/api/templates`;
      const headers = {};
      if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;

      const resp = await fetch(url, { headers });
      const data = await resp.json();

      if (data.success && data.templates?.length > 0) {
        list.innerHTML = '';
        data.templates.forEach(t => {
          const card = document.createElement('div');
          card.className = 'template-card';
          card.innerHTML = `
            <div class="template-name">${escapeHtml(t.name)}</div>
            <div class="template-preview">${escapeHtml(t.content.substring(0, 120))}…</div>
            <div class="template-meta">
              <span class="template-tag">${t.category}</span>
              <span class="template-tag">${t.platform}</span>
            </div>
          `;
          card.addEventListener('click', () => {
            document.getElementById('messageInput').value = t.content;
            document.getElementById('charCounter').textContent = `${t.content.length}/500`;
            // Switch to home tab
            document.querySelector('.tab-btn[data-tab="home"]').click();
            showStatus('Template loaded', 'info');
          });
          list.appendChild(card);
        });
      } else {
        list.innerHTML = '<div class="empty-state">No templates found</div>';
      }
    } catch {
      list.innerHTML = '<div class="empty-state">Failed to load templates</div>';
    }

    // Filter change
    document.getElementById('templateCategoryFilter').addEventListener('change', () => loadTemplates());
  }

  function initTemplatesTab() {
    // Will load when tab is clicked
  }

  // ========================================
  // DASHBOARD
  // ========================================
  async function loadDashboard() {
    if (!state.authToken) return;

    try {
      const resp = await fetch(`${state.apiUrl}/api/analytics/dashboard`, {
        headers: { 'Authorization': `Bearer ${state.authToken}` }
      });
      const data = await resp.json();

      if (data.success && data.dashboard) {
        const d = data.dashboard;

        document.getElementById('dashTotal').textContent = d.user.repliesGenerated || 0;
        document.getElementById('dashToday').textContent = d.user.dailyUsage || 0;
        document.getElementById('dashLimit').textContent = d.user.dailyLimit || 20;
        document.getElementById('dashPlan').textContent = (d.user.plan || 'free').toUpperCase();

        // Tone chart
        renderBarChart('toneChart', d.breakdown?.tones || {});

        // Platform chart
        renderBarChart('platformChart', d.breakdown?.platforms || {});

        // Memory
        if (d.memory) {
          document.getElementById('memoryScore').textContent = `${d.memory.adaptationScore || 0}%`;
          document.getElementById('memoryInteractions').textContent = d.memory.totalInteractions || 0;
        }
      }
    } catch {
      // Dashboard load failed silently
    }
  }

  function renderBarChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const entries = Object.entries(data);
    if (entries.length === 0) {
      container.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,0.3)">No data yet</div>';
      return;
    }

    const maxVal = Math.max(...entries.map(e => e[1]), 1);

    entries.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <span class="bar-label">${label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(value / maxVal) * 100}%"></div></div>
        <span class="bar-value">${value}</span>
      `;
      container.appendChild(row);
    });
  }

  // ========================================
  // VOICE (Web Speech API)
  // ========================================
  function initVoice() {
    const voiceBtn = document.getElementById('voiceBtn');
    if (!voiceBtn) return;

    voiceBtn.addEventListener('click', () => {
      if (state.isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  function startRecording() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      showStatus('Speech not supported', 'warning');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    state.recognition = new SpeechRecognition();
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.lang = 'en-US';

    state.recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');
      document.getElementById('messageInput').value = transcript;
      document.getElementById('charCounter').textContent = `${transcript.length}/500`;
    };

    state.recognition.onend = () => {
      state.isRecording = false;
      document.getElementById('voiceBtn').classList.remove('recording');
    };

    state.recognition.onerror = () => {
      state.isRecording = false;
      document.getElementById('voiceBtn').classList.remove('recording');
      showStatus('Voice error', 'error');
    };

    state.recognition.start();
    state.isRecording = true;
    document.getElementById('voiceBtn').classList.add('recording');
    showStatus('Listening…', 'info');
  }

  function stopRecording() {
    if (state.recognition) {
      state.recognition.stop();
    }
    state.isRecording = false;
    document.getElementById('voiceBtn').classList.remove('recording');
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) {
      showStatus('TTS not supported', 'warning');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  // ========================================
  // UI HELPERS
  // ========================================
  function showLoading(show) {
    const el = document.getElementById('loadingSection');
    const btn = document.getElementById('generateBtn');

    if (show) {
      el.classList.add('active');
      btn.disabled = true;

      // Animate progress
      const fill = document.getElementById('progressFill');
      fill.style.width = '0%';
      let w = 0;
      const interval = setInterval(() => {
        w += Math.random() * 15;
        if (w > 90) { clearInterval(interval); w = 90; }
        fill.style.width = `${w}%`;
      }, 300);
      el._progressInterval = interval;
    } else {
      const fill = document.getElementById('progressFill');
      fill.style.width = '100%';
      if (el._progressInterval) clearInterval(el._progressInterval);
      setTimeout(() => {
        el.classList.remove('active');
        btn.disabled = false;
      }, 300);
    }
  }

  function hideResults() { document.getElementById('resultsSection').classList.remove('active'); }
  function hideError() { document.getElementById('errorSection').classList.remove('active'); }
  function hideAll() { hideResults(); hideError(); }

  function showError(msg) {
    document.getElementById('errorMsg').textContent = msg;
    document.getElementById('errorSection').classList.add('active');
  }

  function showStatus(text, type = 'info') {
    const pill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    statusText.textContent = text;
    pill.className = 'status-pill';
    if (type === 'error') pill.classList.add('error');
    if (type === 'warning') pill.classList.add('warning');

    if (type !== 'info') {
      setTimeout(() => {
        statusText.textContent = 'Ready';
        pill.className = 'status-pill';
      }, 3000);
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
