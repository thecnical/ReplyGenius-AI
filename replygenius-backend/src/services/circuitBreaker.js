/**
 * ReplyGenius AI - Circuit Breaker Implementation
 * Prevents cascade failures from unstable providers
 * 
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Too many failures, requests blocked
 * - HALF_OPEN: Testing if provider recovered
 */

const EventEmitter = require('events');
const { createLogger } = require('../utils/logger');

const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

const logger = createLogger('CircuitBreaker');

class CircuitBreaker extends EventEmitter {
  /**
   * @param {string} providerName - Name of the provider
   * @param {Object} options - Configuration options
   */
  constructor(providerName, options = {}) {
    super();
    
    this.providerName = providerName;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000;
    this.halfOpenRetries = options.halfOpenRetries || 3;
    
    // State management
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.halfOpenAttempts = 0;
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => this._cleanup(), 30000);
    
    logger.info(`Circuit breaker initialized for ${providerName}`);
  }

  /**
   * Execute function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} - Function result
   */
  async execute(fn) {
    // Check if circuit is open
    if (this.state === STATES.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(`CIRCUIT_OPEN: ${this.providerName} is temporarily unavailable`);
        error.code = 'CIRCUIT_OPEN';
        error.retryAfter = this.nextAttempt - Date.now();
        throw error;
      }
      // Transition to HALF_OPEN
      this._transitionToHalfOpen();
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  _onSuccess() {
    this.failures = 0;
    
    if (this.state === STATES.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this._transitionToClosed();
      }
    }
    
    this.emit('success', { provider: this.providerName, state: this.state });
  }

  /**
   * Handle failed request
   */
  _onFailure() {
    this.failures++;
    this.successes = 0;
    
    if (this.state === STATES.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenRetries) {
        this._transitionToOpen();
      }
    } else if (this.state === STATES.CLOSED && this.failures >= this.failureThreshold) {
      this._transitionToOpen();
    }
    
    this.emit('failure', { provider: this.providerName, failures: this.failures, state: this.state });
  }

  /**
   * Transition to OPEN state
   */
  _transitionToOpen() {
    this.state = STATES.OPEN;
    this.nextAttempt = Date.now() + this.timeout;
    this.halfOpenAttempts = 0;
    
    logger.warn(`Circuit breaker OPENED for ${this.providerName} (failures: ${this.failures})`);
    
    this.emit('open', { provider: this.providerName, nextAttempt: this.nextAttempt });
  }

  /**
   * Transition to HALF_OPEN state
   */
  _transitionToHalfOpen() {
    this.state = STATES.HALF_OPEN;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    
    logger.info(`Circuit breaker HALF_OPEN for ${this.providerName}`);
    
    this.emit('halfOpen', { provider: this.providerName });
  }

  /**
   * Transition to CLOSED state
   */
  _transitionToClosed() {
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    
    logger.info(`Circuit breaker CLOSED for ${this.providerName} - recovered successfully`);
    
    this.emit('close', { provider: this.providerName });
  }

  /**
   * Cleanup stale state periodically
   */
  _cleanup() {
    if (this.state === STATES.CLOSED && this.failures > 0) {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  /**
   * Get current circuit state
   */
  getState() {
    return {
      provider: this.providerName,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.nextAttempt,
      halfOpenAttempts: this.halfOpenAttempts
    };
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return this.state !== STATES.OPEN;
  }

  /**
   * Manually force circuit open
   */
  forceOpen() {
    this._transitionToOpen();
  }

  /**
   * Manually force circuit closed
   */
  forceClosed() {
    this._transitionToClosed();
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.removeAllListeners();
  }
}

module.exports = { CircuitBreaker, STATES };
