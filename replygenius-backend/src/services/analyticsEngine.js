/**
 * ReplyGenius AI - Analytics Engine
 * Tracks metrics and provides auto-routing optimization
 */

const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AnalyticsEngine');

class AnalyticsEngine {
  constructor() {
    this.metrics = {
      providers: {},
      models: {},
      users: {},
      platforms: {},
      tones: {}
    };

    const providers = ['openrouter', 'bytez'];
    providers.forEach(provider => {
      this.metrics.providers[provider] = {
        requests: 0,
        successes: 0,
        failures: 0,
        totalLatency: 0,
        timeouts: 0,
        rateLimits: 0,
        avgLatency: 0,
        successRate: 0,
        lastUsed: null,
        lastSuccess: null,
        lastFailure: null,
        cost: 0
      };
    });

    this.rules = {
      latencyThreshold: config.analytics.latencyThreshold,
      failureThreshold: config.analytics.failureThreshold
    };

    this.optimizationInterval = setInterval(
      () => this._runOptimization(),
      config.analytics.optimizationInterval
    );

    logger.info('Analytics engine initialized');
  }

  /**
   * Record a request for analytics
   */
  recordRequest(provider, model, success, latency, errorType = null) {
    const pMetrics = this.metrics.providers[provider];
    if (pMetrics) {
      pMetrics.requests++;
      pMetrics.totalLatency += latency;
      pMetrics.avgLatency = Math.round(pMetrics.totalLatency / pMetrics.requests);
      pMetrics.lastUsed = Date.now();

      if (success) {
        pMetrics.successes++;
        pMetrics.lastSuccess = Date.now();
      } else {
        pMetrics.failures++;
        pMetrics.lastFailure = Date.now();
        
        if (errorType === 'TIMEOUT') pMetrics.timeouts++;
        if (errorType === 'RATE_LIMIT') pMetrics.rateLimits++;
      }
      
      pMetrics.successRate = Math.round((pMetrics.successes / pMetrics.requests) * 10000) / 100;
    }

    if (!this.metrics.models[model]) {
      this.metrics.models[model] = { 
        requests: 0, successes: 0, failures: 0, totalLatency: 0, avgLatency: 0, successRate: 0
      };
    }
    const mMetrics = this.metrics.models[model];
    mMetrics.requests++;
    mMetrics.totalLatency += latency;
    mMetrics.avgLatency = Math.round(mMetrics.totalLatency / mMetrics.requests);
    if (success) mMetrics.successes++;
    else mMetrics.failures++;
    mMetrics.successRate = Math.round((mMetrics.successes / mMetrics.requests) * 10000) / 100;

    logger.debug(`Analytics: ${provider}/${model} - ${success ? 'success' : 'failure'} (${latency}ms)`);
  }

  /**
   * Record user usage
   */
  recordUserUsage(userId, platform, tone) {
    if (!this.metrics.users[userId]) {
      this.metrics.users[userId] = {
        requests: 0,
        platforms: {},
        tones: {},
        totalLatency: 0,
        avgLatency: 0
      };
    }

    const uMetrics = this.metrics.users[userId];
    uMetrics.requests++;
    uMetrics.platforms[platform] = (uMetrics.platforms[platform] || 0) + 1;
    uMetrics.tones[tone] = (uMetrics.tones[tone] || 0) + 1;

    this.metrics.platforms[platform] = (this.metrics.platforms[platform] || 0) + 1;
    this.metrics.tones[tone] = (this.metrics.tones[tone] || 0) + 1;
  }

  /**
   * Get best model based on current metrics and priority
   */
  getBestModel(priority = 'balanced', provider = 'openrouter') {
    const models = Object.entries(this.metrics.models);
    
    if (models.length === 0) {
      const defaults = {
        fast: 'deepseek/deepseek-chat',
        balanced: 'mistralai/mistral-large',
        premium: 'openai/gpt-4o'
      };
      return defaults[priority] || defaults.balanced;
    }

    const scored = models.map(([model, metrics]) => {
      let score = 0;
      
      if (priority === 'fast') {
        const latencyScore = metrics.avgLatency > 0 ? (10000 / metrics.avgLatency) : 0;
        const successScore = metrics.successRate * 10;
        score = latencyScore + successScore;
      } else if (priority === 'premium') {
        score = (metrics.successRate * 1.5) + (metrics.requests * 0.1);
      } else {
        const latencyScore = metrics.avgLatency > 0 ? (5000 / metrics.avgLatency) : 0;
        const successScore = metrics.successRate * 0.7;
        score = latencyScore + successScore;
      }

      return { model, score, metrics };
    });

    scored.sort((a, b) => b.score - a.score);
    
    const best = scored[0];
    logger.info(`Best model for ${priority}: ${best.model} (score: ${best.score.toFixed(2)})`);
    
    return best.model;
  }

  /**
   * Get provider health status
   */
  getProviderHealth(provider) {
    const metrics = this.metrics.providers[provider];
    if (!metrics || metrics.requests === 0) return 'UNKNOWN';

    const { avgLatency, successRate, failures } = metrics;

    if (avgLatency > this.rules.latencyThreshold * 2 || successRate < 50) {
      return 'CRITICAL';
    }
    if (avgLatency > this.rules.latencyThreshold || successRate < 80 || failures > this.rules.failureThreshold) {
      return 'DEGRADED';
    }
    return 'HEALTHY';
  }

  /**
   * Get recommended provider based on current performance
   */
  getRecommendedProvider(priority = 'balanced') {
    const healths = {
      openrouter: this.getProviderHealth('openrouter'),
      bytez: this.getProviderHealth('bytez')
    };

    if (healths.openrouter === 'HEALTHY' || healths.openrouter === 'UNKNOWN') {
      return 'openrouter';
    }

    if (healths.openrouter === 'CRITICAL') {
      logger.warn('Primary provider is CRITICAL, using fallback');
      return 'bytez';
    }

    if (healths.openrouter === 'DEGRADED') {
      const orLatency = this.metrics.providers.openrouter?.avgLatency || 0;
      const bzLatency = this.metrics.providers.bytez?.avgLatency || 0;
      
      if (bzLatency > 0 && bzLatency < orLatency * 0.7) {
        logger.info('Fallback has better latency, using Bytez');
        return 'bytez';
      }
    }

    return 'openrouter';
  }

  /**
   * Run automatic optimization
   */
  _runOptimization() {
    logger.info('Running analytics optimization...');
    
    Object.keys(this.metrics.providers).forEach(provider => {
      const health = this.getProviderHealth(provider);
      const metrics = this.metrics.providers[provider];
      
      if (health === 'CRITICAL') {
        logger.warn(`Provider ${provider} is CRITICAL - ${metrics?.requests} requests, ${metrics?.successRate}% success rate`);
      } else if (health === 'DEGRADED') {
        logger.info(`Provider ${provider} is DEGRADED - avg latency: ${metrics?.avgLatency}ms`);
      }
    });

    const topModels = Object.entries(this.metrics.models)
      .sort((a, b) => b[1].requests - a[1].requests)
      .slice(0, 5);
    
    if (topModels.length > 0) {
      logger.info(`Top models: ${topModels.map(([m, v]) => `${m}(${v.requests})`).join(', ')}`);
    }
  }

  /**
   * Get analytics summary
   */
  getSummary() {
    const providers = {};
    Object.entries(this.metrics.providers).forEach(([key, v]) => {
      providers[key] = { ...v };
    });

    const models = {};
    Object.entries(this.metrics.models).forEach(([key, v]) => {
      models[key] = { ...v };
    });

    const totalRequests = Object.values(this.metrics.providers).reduce((a, p) => a + p.requests, 0);
    const totalSuccesses = Object.values(this.metrics.providers).reduce((a, p) => a + p.successes, 0);

    return {
      providers,
      models,
      platforms: this.metrics.platforms,
      tones: this.metrics.tones,
      summary: {
        totalRequests,
        totalSuccesses,
        overallSuccessRate: totalRequests > 0 ? Math.round((totalSuccesses / totalRequests) * 10000) / 100 : 0,
        healthStatus: Object.fromEntries(
          Object.keys(this.metrics.providers).map(p => [p, this.getProviderHealth(p)])
        )
      },
      timestamp: Date.now()
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    Object.keys(this.metrics.providers).forEach(p => {
      this.metrics.providers[p] = {
        requests: 0, successes: 0, failures: 0,
        totalLatency: 0, avgLatency: 0, successRate: 0,
        timeouts: 0, rateLimits: 0
      };
    });
    this.metrics.models = {};
    this.metrics.users = {};
    this.metrics.platforms = {};
    this.metrics.tones = {};
    logger.info('Analytics reset');
  }

  /**
   * Cleanup
   */
  destroy() {
    clearInterval(this.optimizationInterval);
  }
}

module.exports = new AnalyticsEngine();
