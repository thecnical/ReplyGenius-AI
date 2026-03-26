/**
 * ReplyGenius AI - Base Provider Interface
 * Abstract base class for all AI providers
 */

const { createLogger } = require('../utils/logger');

const logger = createLogger('BaseProvider');

class BaseProvider {
  /**
   * @param {Object} config - Provider configuration
   */
  constructor(config) {
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 8000;
    this.maxRetries = config.maxRetries || 2;
    this.models = config.models || {};
  }

  /**
   * Generate reply (to be implemented by subclasses)
   */
  async generateReply(messages, options) {
    throw new Error('Method not implemented');
  }

  /**
   * Validate API key
   */
  async validateKey() {
    throw new Error('Method not implemented');
  }

  /**
   * Get available models
   */
  getModels() {
    return this.models.available || [];
  }

  /**
   * Execute function with retry and timeout
   */
  async withRetry(fn, retries = null) {
    const maxRetries = retries ?? this.maxRetries;
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await this.withTimeout(fn, this.timeout);
      } catch (error) {
        lastError = error;
        
        if (error.code === 'AUTH_ERROR' || error.code === 'INVALID_REQUEST') {
          throw error;
        }
        
        if (i < maxRetries) {
          const delay = Math.pow(2, i) * 500;
          logger.warn(`Retry ${i + 1}/${maxRetries} for ${this.name} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute function with timeout
   */
  withTimeout(fn, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error('Request timeout');
        error.code = 'TIMEOUT';
        reject(error);
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Build headers for API requests
   */
  getHeaders(extraHeaders = {}) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...extraHeaders
    };
  }
}

module.exports = BaseProvider;
