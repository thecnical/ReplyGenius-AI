/**
 * ReplyGenius AI V2 - Content Script
 * Grammarly-like floating AI assistant with real-time suggestions,
 * context extraction, and auto-mode support
 */

(function () {
  'use strict';

  // ========================================
  // CONFIGURATION
  // ========================================
  let CONFIG = {
    API_URL: 'https://replygenius-ai.onrender.com',
    DEFAULT_TONE: 'professional',
    DEFAULT_PRIORITY: 'balanced',
    PERSONALITY: null,
    MODE: 'manual', // manual | suggestion | auto_reply
    DEBOUNCE_MS: 1500,
    SCAN_INTERVAL: 4000,
    AUTH_TOKEN: null
  };

  // ========================================
  // PLATFORM DETECTION
  // ========================================
  function detectPlatform() {
    const h = window.location.hostname;
    if (h.includes('linkedin.com')) return 'linkedin';
    if (h.includes('whatsapp.com') || h.includes('whatsapp.net')) return 'whatsapp';
    if (h.includes('mail.google.com') || h.includes('gmail.com')) return 'gmail';
    if (h.includes('twitter.com') || h.includes('x.com')) return 'twitter';
    if (h.includes('instagram.com')) return 'instagram';
    if (h.includes('telegram.org')) return 'telegram';
    return 'general';
  }

  const PLATFORM = detectPlatform();
  const processedElements = new WeakSet();
  let activeInput = null;
  let suggestionTimeout = null;

  // ========================================
  // INJECT STYLES
  // ========================================
  function injectStyles() {
    if (document.getElementById('rg-v2-styles')) return;
    const style = document.createElement('style');
    style.id = 'rg-v2-styles';
    style.textContent = `
      /* ===== ReplyGenius V2 Floating Button ===== */
      .rg-float-btn {
        position: absolute;
        z-index: 2147483646;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00d4ff, #a855f7);
        border: 2px solid rgba(255,255,255,0.25);
        color: #fff;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0,212,255,0.4), 0 0 15px rgba(168,85,247,0.3);
        transition: all 0.25s cubic-bezier(.4,0,.2,1);
        font-family: system-ui, -apple-system, sans-serif;
        line-height: 1;
        padding: 0;
        pointer-events: auto;
      }
      .rg-float-btn:hover {
        transform: scale(1.15);
        box-shadow: 0 6px 28px rgba(0,212,255,0.6), 0 0 25px rgba(168,85,247,0.5);
      }
      .rg-float-btn.loading {
        opacity: 0.7;
        pointer-events: none;
        animation: rg-pulse 1.2s infinite;
      }

      /* ===== Suggestion Bubble (Grammarly-like) ===== */
      .rg-suggestion-bubble {
        position: absolute;
        z-index: 2147483647;
        background: rgba(15,15,25,0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(0,212,255,0.3);
        border-radius: 14px;
        padding: 0;
        min-width: 320px;
        max-width: 420px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 30px rgba(0,212,255,0.15);
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        animation: rg-slideUp 0.3s cubic-bezier(.4,0,.2,1);
        overflow: hidden;
      }
      .rg-bubble-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: linear-gradient(135deg, rgba(0,212,255,0.12), rgba(168,85,247,0.12));
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .rg-bubble-title {
        font-size: 12px;
        font-weight: 700;
        color: #00d4ff;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .rg-bubble-close {
        width: 22px;
        height: 22px;
        border: none;
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.5);
        border-radius: 50%;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .rg-bubble-close:hover {
        background: rgba(255,70,70,0.3);
        color: #fff;
      }
      .rg-bubble-body {
        padding: 10px 14px;
        max-height: 300px;
        overflow-y: auto;
      }
      .rg-bubble-body::-webkit-scrollbar {
        width: 4px;
      }
      .rg-bubble-body::-webkit-scrollbar-thumb {
        background: rgba(0,212,255,0.3);
        border-radius: 4px;
      }

      /* Reply Card */
      .rg-reply-card {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 10px 12px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
      }
      .rg-reply-card:hover {
        background: rgba(0,212,255,0.08);
        border-color: rgba(0,212,255,0.3);
        transform: translateX(3px);
      }
      .rg-reply-card:last-child { margin-bottom: 0; }
      .rg-reply-text {
        color: rgba(255,255,255,0.9);
        font-size: 13px;
        line-height: 1.5;
        word-break: break-word;
      }
      .rg-reply-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
      }
      .rg-reply-badge {
        padding: 2px 8px;
        border-radius: 20px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(0,212,255,0.15);
        color: #00d4ff;
      }
      .rg-reply-action {
        margin-left: auto;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid rgba(0,212,255,0.3);
        background: transparent;
        color: #00d4ff;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .rg-reply-action:hover {
        background: rgba(0,212,255,0.2);
      }

      /* Bubble Footer */
      .rg-bubble-footer {
        padding: 8px 14px;
        border-top: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .rg-bubble-footer-info {
        font-size: 10px;
        color: rgba(255,255,255,0.35);
      }
      .rg-bubble-footer-actions {
        display: flex;
        gap: 6px;
      }
      .rg-icon-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.04);
        color: rgba(255,255,255,0.6);
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .rg-icon-btn:hover {
        background: rgba(0,212,255,0.15);
        color: #00d4ff;
        border-color: rgba(0,212,255,0.3);
      }

      /* Suggestion Indicator (mini badge while typing) */
      .rg-typing-indicator {
        position: absolute;
        z-index: 2147483645;
        padding: 4px 10px;
        background: rgba(15,15,25,0.9);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(0,212,255,0.2);
        border-radius: 8px;
        font-size: 11px;
        color: rgba(0,212,255,0.8);
        font-family: system-ui, sans-serif;
        animation: rg-fadeIn 0.2s ease;
        display: flex;
        align-items: center;
        gap: 6px;
        pointer-events: none;
      }
      .rg-typing-dots {
        display: flex;
        gap: 3px;
      }
      .rg-typing-dots span {
        width: 4px;
        height: 4px;
        background: #00d4ff;
        border-radius: 50%;
        animation: rg-dotBounce 1.2s infinite;
      }
      .rg-typing-dots span:nth-child(2) { animation-delay: 0.15s; }
      .rg-typing-dots span:nth-child(3) { animation-delay: 0.3s; }

      /* Toast Notification */
      .rg-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        padding: 12px 20px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        font-family: system-ui, sans-serif;
        color: #fff;
        box-shadow: 0 8px 30px rgba(0,0,0,0.4);
        animation: rg-slideIn 0.35s cubic-bezier(.4,0,.2,1);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .rg-toast.success { background: linear-gradient(135deg, #00ff88, #00cc6a); }
      .rg-toast.error   { background: linear-gradient(135deg, #ff4757, #ff6b7a); }
      .rg-toast.info    { background: linear-gradient(135deg, #00d4ff, #a855f7); }

      /* ===== Animations ===== */
      @keyframes rg-slideUp {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes rg-slideIn {
        from { transform: translateX(120px); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
      }
      @keyframes rg-fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes rg-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(0,212,255,0.4); }
        50% { box-shadow: 0 4px 30px rgba(0,212,255,0.8); }
      }
      @keyframes rg-dotBounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }
    `;
    document.head.appendChild(style);
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================
  function debounce(fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  }

  function isValidInput(el) {
    if (!el || el.offsetParent === null || el.disabled) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input' && (el.type === 'text' || !el.type)) return true;
    if (el.isContentEditable && el.getAttribute('contenteditable') !== 'false') return true;
    return false;
  }

  function getInputText(el) {
    const tag = el.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return el.value || '';
    return el.innerText || el.textContent || '';
  }

  function setInputText(el, text) {
    const tag = el.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.innerText = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }

  function showToast(message, type = 'info') {
    const existing = document.querySelector('.rg-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `rg-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'rg-slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ========================================
  // CONTEXT EXTRACTION (Platform-specific)
  // ========================================
  function extractConversation() {
    const msgs = [];
    try {
      if (PLATFORM === 'linkedin') {
        document.querySelectorAll('.msg-s-event-listitem__body, .msg-s-message-list__event .msg-s-event-listitem__message-body').forEach(el => {
          msgs.push({ role: 'user', content: el.innerText?.trim() || '' });
        });
      } else if (PLATFORM === 'whatsapp') {
        document.querySelectorAll('.message-in .selectable-text, .message-out .selectable-text').forEach(el => {
          msgs.push({ role: 'user', content: el.innerText?.trim() || '' });
        });
      } else if (PLATFORM === 'gmail') {
        document.querySelectorAll('.a3s.aiL, .gs .ii.gt').forEach(el => {
          msgs.push({ role: 'user', content: el.innerText?.trim().substring(0, 500) || '' });
        });
      } else if (PLATFORM === 'twitter') {
        document.querySelectorAll('[data-testid="tweetText"]').forEach(el => {
          msgs.push({ role: 'user', content: el.innerText?.trim() || '' });
        });
      } else if (PLATFORM === 'instagram') {
        document.querySelectorAll('[role="row"] span').forEach(el => {
          const text = el.innerText?.trim();
          if (text && text.length > 1) msgs.push({ role: 'user', content: text });
        });
      } else if (PLATFORM === 'telegram') {
        document.querySelectorAll('.message .text-content').forEach(el => {
          msgs.push({ role: 'user', content: el.innerText?.trim() || '' });
        });
      }
    } catch (e) {
      // Platform extraction failed, continue with empty context
    }

    // Take last 15 messages
    return msgs.filter(m => m.content.length > 0).slice(-15);
  }

  // ========================================
  // FLOATING AI BUTTON
  // ========================================
  function createFloatingButton(inputEl) {
    const btn = document.createElement('button');
    btn.className = 'rg-float-btn';
    btn.textContent = '⚡';
    btn.title = 'ReplyGenius AI — Generate Smart Reply';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeInput = inputEl;
      await generateAndShowSuggestions(inputEl, btn);
    });

    return btn;
  }

  function positionElement(el, ref, offsetX = 0, offsetY = -42) {
    const rect = ref.getBoundingClientRect();
    el.style.top = (rect.top + window.scrollY + offsetY) + 'px';
    el.style.left = (rect.right + window.scrollX + offsetX - 42) + 'px';
  }

  // ========================================
  // SUGGESTION BUBBLE
  // ========================================
  function showSuggestionBubble(inputEl, replies, provider, contextAnalysis) {
    closeSuggestionBubble();

    const bubble = document.createElement('div');
    bubble.className = 'rg-suggestion-bubble';
    bubble.id = 'rg-suggestion-bubble';

    // Header
    const header = document.createElement('div');
    header.className = 'rg-bubble-header';

    const title = document.createElement('div');
    title.className = 'rg-bubble-title';
    title.innerHTML = '⚡ ReplyGenius AI';

    if (contextAnalysis?.emotion && contextAnalysis.emotion !== 'neutral') {
      const emotionEmojis = { angry: '😤', frustrated: '😫', friendly: '😊', excited: '🎉', sad: '😢' };
      title.innerHTML += ` <span style="font-size:10px;opacity:0.7">• ${emotionEmojis[contextAnalysis.emotion] || ''} ${contextAnalysis.emotion}</span>`;
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'rg-bubble-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeSuggestionBubble);

    header.appendChild(title);
    header.appendChild(closeBtn);
    bubble.appendChild(header);

    // Body — reply cards
    const body = document.createElement('div');
    body.className = 'rg-bubble-body';

    replies.forEach((reply, idx) => {
      const cleanReply = reply.replace(/[*#]/g, '').trim();
      const card = document.createElement('div');
      card.className = 'rg-reply-card';

      const text = document.createElement('div');
      text.className = 'rg-reply-text';
      text.textContent = cleanReply.length > 200 ? cleanReply.substring(0, 200) + '…' : cleanReply;

      const meta = document.createElement('div');
      meta.className = 'rg-reply-meta';

      const badge = document.createElement('span');
      badge.className = 'rg-reply-badge';
      badge.textContent = `#${idx + 1}`;

      const useBtn = document.createElement('button');
      useBtn.className = 'rg-reply-action';
      useBtn.textContent = '↵ Use';
      useBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setInputText(inputEl, cleanReply);
        closeSuggestionBubble();
        showToast('Reply inserted! ✨', 'success');
      });

      meta.appendChild(badge);
      meta.appendChild(useBtn);
      card.appendChild(text);
      card.appendChild(meta);

      card.addEventListener('click', () => {
        navigator.clipboard.writeText(cleanReply);
        showToast('Copied to clipboard 📋', 'success');
      });

      body.appendChild(card);
    });

    bubble.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'rg-bubble-footer';

    const info = document.createElement('span');
    info.className = 'rg-bubble-footer-info';
    info.textContent = `${provider || 'AI'} • ${PLATFORM}`;

    const actions = document.createElement('div');
    actions.className = 'rg-bubble-footer-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'rg-icon-btn';
    refreshBtn.title = 'Regenerate';
    refreshBtn.textContent = '🔄';
    refreshBtn.addEventListener('click', async () => {
      closeSuggestionBubble();
      const floatBtn = document.querySelector('.rg-float-btn');
      if (floatBtn) await generateAndShowSuggestions(inputEl, floatBtn);
    });

    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'rg-icon-btn';
    copyAllBtn.title = 'Copy All';
    copyAllBtn.textContent = '📋';
    copyAllBtn.addEventListener('click', () => {
      const allText = replies.map((r, i) => `${i + 1}. ${r.replace(/[*#]/g, '').trim()}`).join('\n\n');
      navigator.clipboard.writeText(allText);
      showToast('All replies copied!', 'success');
    });

    actions.appendChild(refreshBtn);
    actions.appendChild(copyAllBtn);
    footer.appendChild(info);
    footer.appendChild(actions);
    bubble.appendChild(footer);

    // Position and add to DOM
    document.body.appendChild(bubble);
    const rect = inputEl.getBoundingClientRect();
    const bubbleHeight = bubble.offsetHeight;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceAbove > bubbleHeight + 10) {
      bubble.style.top = (rect.top + window.scrollY - bubbleHeight - 8) + 'px';
    } else {
      bubble.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    }
    bubble.style.left = Math.max(10, rect.left + window.scrollX) + 'px';
  }

  function closeSuggestionBubble() {
    const el = document.getElementById('rg-suggestion-bubble');
    if (el) el.remove();
  }

  // ========================================
  // TYPING INDICATOR
  // ========================================
  function showTypingIndicator(inputEl) {
    removeTypingIndicator();
    const ind = document.createElement('div');
    ind.className = 'rg-typing-indicator';
    ind.id = 'rg-typing-indicator';
    ind.innerHTML = '<span>AI analyzing</span><div class="rg-typing-dots"><span></span><span></span><span></span></div>';
    document.body.appendChild(ind);
    const rect = inputEl.getBoundingClientRect();
    ind.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    ind.style.left = (rect.left + window.scrollX) + 'px';
  }

  function removeTypingIndicator() {
    const el = document.getElementById('rg-typing-indicator');
    if (el) el.remove();
  }

  // ========================================
  // API CALL
  // ========================================
  async function apiCall(endpoint, options = {}) {
    const url = CONFIG.API_URL + endpoint;
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.AUTH_TOKEN) headers['Authorization'] = `Bearer ${CONFIG.AUTH_TOKEN}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal, headers: { ...headers, ...options.headers } });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  // ========================================
  // GENERATE + SHOW
  // ========================================
  async function generateAndShowSuggestions(inputEl, floatBtn) {
    const text = getInputText(inputEl);

    // Extract conversation context
    const conversation = extractConversation();

    // Build messages array
    let messages;
    if (conversation.length > 0) {
      messages = [...conversation];
      if (text.trim()) messages.push({ role: 'user', content: text.trim() });
    } else if (text.trim()) {
      messages = [{ role: 'user', content: text.trim() }];
    } else {
      showToast('Type something or navigate to a conversation', 'error');
      return;
    }

    // Loading state
    floatBtn.classList.add('loading');
    floatBtn.textContent = '⏳';

    try {
      const result = await apiCall('/api/generate-reply', {
        method: 'POST',
        body: JSON.stringify({
          messages,
          tone: CONFIG.DEFAULT_TONE,
          platform: PLATFORM,
          priority: CONFIG.DEFAULT_PRIORITY,
          personality: CONFIG.PERSONALITY
        })
      });

      if (result.success && result.replies?.length > 0) {
        showSuggestionBubble(inputEl, result.replies, result.provider, result.contextAnalysis);
      } else {
        showToast(result.error?.message || 'Failed to generate', 'error');
      }
    } catch (err) {
      showToast('Connection error — is the backend running?', 'error');
    } finally {
      floatBtn.classList.remove('loading');
      floatBtn.textContent = '⚡';
    }
  }

  // ========================================
  // AUTO-SUGGESTION MODE
  // ========================================
  function onInputActivity(inputEl) {
    if (CONFIG.MODE !== 'suggestion') return;

    clearTimeout(suggestionTimeout);
    removeTypingIndicator();

    const text = getInputText(inputEl);
    if (text.trim().length < 10) return; // Need some text to suggest

    showTypingIndicator(inputEl);

    suggestionTimeout = setTimeout(async () => {
      removeTypingIndicator();
      const floatBtn = inputEl._rgFloatBtn;
      if (floatBtn) await generateAndShowSuggestions(inputEl, floatBtn);
    }, CONFIG.DEBOUNCE_MS);
  }

  // ========================================
  // PROCESS INPUT FIELDS
  // ========================================
  function processInput(element) {
    if (processedElements.has(element)) return;
    if (!isValidInput(element)) return;
    if (element.offsetWidth < 80 || element.offsetHeight < 25) return;

    processedElements.add(element);

    // Create floating button
    const btn = createFloatingButton(element);
    element._rgFloatBtn = btn;
    document.body.appendChild(btn);
    positionElement(btn, element);

    // Reposition on scroll/resize
    const updatePos = debounce(() => {
      if (document.body.contains(btn) && document.body.contains(element)) {
        positionElement(btn, element);
      } else if (!document.body.contains(element)) {
        btn.remove();
      }
    }, 80);

    window.addEventListener('scroll', updatePos, { passive: true });
    window.addEventListener('resize', updatePos, { passive: true });

    // Auto-suggestion mode listener
    const inputHandler = debounce(() => onInputActivity(element), 300);
    element.addEventListener('input', inputHandler);
    element.addEventListener('keyup', inputHandler);

    // Focus/blur for cleanup
    element.addEventListener('focus', () => { activeInput = element; });
  }

  function scanForInputs() {
    document.querySelectorAll('textarea').forEach(processInput);
    document.querySelectorAll('input[type="text"]').forEach(processInput);
    document.querySelectorAll('input:not([type])').forEach(processInput);
    document.querySelectorAll('[contenteditable="true"]').forEach(processInput);
  }

  // ========================================
  // MUTATION OBSERVER
  // ========================================
  function setupObserver() {
    const observer = new MutationObserver(debounce(() => { scanForInputs(); }, CONFIG.SCAN_INTERVAL));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ========================================
  // MESSAGE HANDLING (from popup / background)
  // ========================================
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'UPDATE_CONFIG') {
        Object.assign(CONFIG, msg.data);
        sendResponse({ success: true });
      }
      if (msg.type === 'GET_INPUT') {
        const text = activeInput ? getInputText(activeInput) : '';
        sendResponse({ success: true, text, platform: PLATFORM });
      }
      if (msg.type === 'GENERATE_FROM_CONTEXT') {
        if (activeInput) {
          const btn = activeInput._rgFloatBtn;
          if (btn) generateAndShowSuggestions(activeInput, btn);
        }
        sendResponse({ success: true });
      }
      if (msg.type === 'SET_MODE') {
        CONFIG.MODE = msg.mode || 'manual';
        showToast(`Mode: ${CONFIG.MODE}`, 'info');
        sendResponse({ success: true });
      }
      return true;
    });
  }

  // ========================================
  // LOAD CONFIG FROM STORAGE
  // ========================================
  async function loadConfig() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const result = await chrome.storage.sync.get([
          'apiEndpoint', 'tone', 'priority', 'personality', 'autoMode', 'authToken'
        ]);
        if (result.apiEndpoint) CONFIG.API_URL = result.apiEndpoint;
        if (result.tone) CONFIG.DEFAULT_TONE = result.tone;
        if (result.priority) CONFIG.DEFAULT_PRIORITY = result.priority;
        if (result.personality) CONFIG.PERSONALITY = result.personality;
        if (result.autoMode) CONFIG.MODE = result.autoMode;
        if (result.authToken) CONFIG.AUTH_TOKEN = result.authToken;
      }
    } catch (e) {
      // Use defaults
    }
  }

  // ========================================
  // INITIALIZE
  // ========================================
  async function init() {
    console.log(`⚡ ReplyGenius AI V2 loaded on ${PLATFORM}`);
    injectStyles();
    await loadConfig();
    setTimeout(scanForInputs, 600);
    setupObserver();
    setInterval(scanForInputs, CONFIG.SCAN_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
