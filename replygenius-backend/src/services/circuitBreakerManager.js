/**
 * ReplyGenius AI - Circuit Breaker Manager
 * Manages circuit breakers for all providers
 */

const { CircuitBreaker, STATES } = require('./circuitBreaker');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CircuitBreakerManager');

class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
    this.initialize();
  }

  /**
   * Initialize circuit breakers for all providers
   */
  initialize() {
    const providers = ['openrouter', 'bytez'];
    
    providers.forEach(provider => {
      const breaker = new CircuitBreaker(provider, {
        failureThreshold: config.circuitBreaker.failureThreshold,
        successThreshold: config.circuitBreaker.successThreshold,
        timeout: config.circuitBreaker.timeout,
        halfOpenRetries: config.circuitBreaker.halfOpenRetries
      });
      
      breaker.on('open', (data) => {
        logger.warn(`Provider ${data.provider} circuit opened until ${new Date(data.nextAttempt).toISOString()}`);
      });
      
      breaker.on('close', (data) => {
        logger.info(`Provider ${data.provider} circuit closed - recovered successfully`);
      });
      
      breaker.on('halfOpen', (data) => {
        logger.info(`Provider ${data.provider} circuit half-open - testing recovery`);
      });
      
      this.breakers.set(provider, breaker);
    });
    
    logger.info('Circuit breakers initialized for all providers');
  }

  /**
   * Get circuit breaker for a provider
   */
  getBreaker(provider) {
    return this.breakers.get(provider);
  }

  /**
   * Get all circuit breaker states
   */
  getAllStates() {
    const states = {};
    this.breakers.forEach((breaker, name) => {
      states[name] = breaker.getState();
    });
    return states;
  }

  /**
   * Check if a provider is available
   */
  isAvailable(provider) {
    const breaker = this.breakers.get(provider);
    return breaker && breaker.isAvailable();
  }

  /**
   * Get the best available provider (prefer primary)
   */
  getBestAvailableProvider(primary = 'openrouter') {
    if (this.isAvailable(primary)) {
      return primary;
    }
    
    const fallback = primary === 'openrouter' ? 'bytez' : 'openrouter';
    if (this.isAvailable(fallback)) {
      logger.info(`Using fallback provider: ${fallback}`);
      return fallback;
    }
    
    logger.error('All providers are unavailable');
    return null;
  }

  /**
   * Get circuit breaker health summary
   */
  getHealth() {
    const health = {};
    this.breakers.forEach((breaker, name) => {
      const state = breaker.getState();
      health[name] = {
        state: state.state,
        available: breaker.isAvailable(),
        failures: state.failures,
        nextAttempt: state.nextAttempt
      };
    });
    return health;
  }

  /**
   * Force a specific provider's circuit
   */
  forceState(provider, state) {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      if (state === 'open') {
        breaker.forceOpen();
      } else {
        breaker.forceClosed();
      }
    }
  }

  /**
   * Cleanup all circuit breakers
   */
  destroy() {
    this.breakers.forEach(breaker => breaker.destroy());
    this.breakers.clear();
    logger.info('All circuit breakers destroyed');
  }
}

// Export singleton instance
module.exports = new CircuitBreakerManager();
