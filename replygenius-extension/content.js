/**
 * ReplyGenius AI - Content Script
 * Detects input fields and injects "Generate Reply" button
 */

(function() {
  'use strict';

  // Configuration - will be updated from storage
  let CONFIG = {
    // Production: https://replygenius-ai.onrender.com/api/generate-reply
    // Development: http://localhost:3000/api/generate-reply
    API_URL: 'https://replygenius-ai.onrender.com/api/generate-reply',
    DEFAULT_TONE: 'professional',
    DEFAULT_PRIORITY: 'balanced',
    BUTTON_TEXT: '⚡ Reply',
    BUTTON_CLASS: 'replygenius-btn',
    DEBOUNCE_MS: 500
  };

  // Platform detection
  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('whatsapp.com') || hostname.includes('whatsapp.net')) return 'whatsapp';
    if (hostname.includes('mail.google.com') || hostname.includes('gmail.com')) return 'gmail';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
    return 'general';
  }

  const currentPlatform = detectPlatform();

  // Track processed elements
  const processedElements = new WeakSet();
  
  // Debounce helper
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Check if element is a valid input field
  function isValidInput(element) {
    if (!element) return false;
    
    // Skip hidden or disabled elements
    if (element.offsetParent === null || element.disabled) return false;
    
    // Check tag type
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'textarea') return true;
    if (tagName === 'input' && (element.type === 'text' || !element.type)) return true;
    if (element.isContentEditable && element.getAttribute('contenteditable') !== 'false') return true;
    
    return false;
  }

  // Get text from input element
  function getInputText(element) {
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'textarea') {
      return element.value || '';
    }
    
    if (tagName === 'input') {
      return element.value || '';
    }
    
    // ContentEditable
    return element.innerText || element.textContent || '';
  }

  // Set text to input element
  function setInputText(element, text) {
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'textarea' || tagName === 'input') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.isContentEditable) {
      element.innerText = text;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }

  // Create floating button
  function createButton(inputElement) {
    // Remove existing button if present
    const existingBtn = document.querySelector(`.${CONFIG.BUTTON_CLASS}`);
    if (existingBtn) {
      existingBtn.remove();
    }

    // Create button
    const button = document.createElement('button');
    button.className = CONFIG.BUTTON_CLASS;
    button.textContent = CONFIG.BUTTON_TEXT;
    button.title = `Generate AI reply for ${currentPlatform}`;
    
    // Glassmorphism styles
    Object.assign(button.style, {
      position: 'absolute',
      zIndex: '2147483647',
      padding: '8px 14px',
      background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.9), rgba(168, 85, 247, 0.9))',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '8px',
      color: 'white',
      fontSize: '12px',
      fontWeight: '700',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), 0 0 20px rgba(0, 212, 255, 0.3)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    });

    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4), 0 0 30px rgba(0, 212, 255, 0.5)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3), 0 0 20px rgba(0, 212, 255, 0.3)';
    });

    // Click handler
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const text = getInputText(inputElement);
      
      if (!text.trim()) {
        showNotification('No text detected in input field', 'error');
        return;
      }

      // Show loading state
      const originalText = button.textContent;
      button.textContent = '⏳ Generating...';
      button.disabled = true;
      button.style.opacity = '0.8';

      try {
        const response = await fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: text }],
            tone: CONFIG.DEFAULT_TONE,
            platform: currentPlatform,
            priority: CONFIG.DEFAULT_PRIORITY
          })
        });

        const data = await response.json();
        
        if (data.success && data.replies && data.replies.length > 0) {
          // Show reply selection notification
          showNotification(`Generated ${data.replies.length} replies! Check console for options.`, 'success');
          
          // Log replies to console for user to copy
          console.log('%c⚡ ReplyGenius AI - Generated Replies', 'color: #00d4ff; font-size: 14px; font-weight: bold;');
          console.log(`%cPlatform: ${currentPlatform} | Tone: ${CONFIG.DEFAULT_TONE}`, 'color: #a855f7;');
          console.log('%c-----------------------------------', 'color: #666;');
          
          data.replies.forEach((reply, index) => {
            const cleanReply = reply.replace(/[*#]/g, '').trim();
            console.log(`%c${index + 1}. ${cleanReply.substring(0, 100)}...`, 'color: #fff;');
          });
          
          // Store replies in window for easy access
          window.replyGeniusReplies = data.replies.map(r => r.replace(/[*#]/g, '').trim());
          window.replyGeniusCurrentReply = 0;
          
          // Offer to insert first reply
          if (confirm('Insert the first AI-generated reply into the input field?')) {
            setInputText(inputElement, data.replies[0].replace(/[*#]/g, '').trim());
            showNotification('Reply inserted!', 'success');
          }
        } else {
          const errorMsg = data.error?.message || 'Failed to generate reply';
          showNotification(errorMsg, 'error');
        }
        
      } catch (error) {
        console.error('⚡ ReplyGenius Error:', error.message);
        showNotification('Connection error. Is the backend running?', 'error');
      } finally {
        button.textContent = originalText;
        button.disabled = false;
        button.style.opacity = '1';
      }
    });

    return button;
  }

  // Show notification
  function showNotification(message, type = 'info') {
    const existing = document.querySelector('.replygenius-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'replygenius-notification';
    notification.textContent = message;
    
    const colors = {
      success: 'linear-gradient(135deg, #00ff88, #00cc6a)',
      error: 'linear-gradient(135deg, #ff4757, #ff6b7a)',
      info: 'linear-gradient(135deg, #00d4ff, #a855f7)'
    };
    
    Object.assign(notification.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      padding: '12px 20px',
      background: colors[type] || colors.info,
      color: 'white',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      zIndex: '2147483647',
      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
      animation: 'slideIn 0.3s ease',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    });
    
    // Add animation keyframes
    if (!document.getElementById('replygenius-animations')) {
      const style = document.createElement('style');
      style.id = 'replygenius-animations';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  // Position button near input
  function positionButton(button, inputElement) {
    const rect = inputElement.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // Position above the input
    button.style.top = (rect.top + scrollY - 40) + 'px';
    button.style.left = (rect.left + scrollX) + 'px';
  }

  // Process a single input element
  function processInput(element) {
    if (processedElements.has(element)) return;
    if (!isValidInput(element)) return;
    
    // Skip very small inputs (likely not message inputs)
    if (element.offsetWidth < 100 || element.offsetHeight < 30) return;
    
    processedElements.add(element);

    // Create and position button
    const button = createButton(element);
    positionButton(button, element);

    // Add to DOM
    document.body.appendChild(button);

    // Update position on scroll/resize
    const updatePosition = debounce(() => {
      if (document.body.contains(button)) {
        positionButton(button, element);
      }
    }, 100);

    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
  }

  // Scan document for input elements
  function scanForInputs() {
    document.querySelectorAll('textarea').forEach(processInput);
    document.querySelectorAll('input[type="text"]').forEach(processInput);
    document.querySelectorAll('input:not([type])').forEach(processInput);
    document.querySelectorAll('[contenteditable="true"]').forEach(processInput);
  }

  // Set up MutationObserver for dynamic content
  function setupObserver() {
    const observer = new MutationObserver(debounce((mutations) => {
      let shouldScan = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      
      if (shouldScan) {
        scanForInputs();
      }
    }, CONFIG.DEBOUNCE_MS));

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Load configuration from storage
  async function loadConfig() {
    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        const result = await chrome.storage.sync.get(['apiEndpoint', 'tone', 'priority']);
        if (result.apiEndpoint) {
          CONFIG.API_URL = result.apiEndpoint + '/api/generate-reply';
        }
        if (result.tone) CONFIG.DEFAULT_TONE = result.tone;
        if (result.priority) CONFIG.DEFAULT_PRIORITY = result.priority;
      }
    } catch (e) {
      console.log('⚡ ReplyGenius: Using default config');
    }
  }

  // Initialize
  async function init() {
    console.log(`⚡ ReplyGenius AI loaded on ${currentPlatform}`);
    
    await loadConfig();
    
    // Initial scan
    setTimeout(scanForInputs, 800);
    
    // Set up observer
    setupObserver();
    
    // Periodic scan
    setInterval(scanForInputs, 5000);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
