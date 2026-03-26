/**
 * ReplyGenius AI - Central AI Router
 * Routes requests to optimal provider with fallback, caching, and analytics
 */

const config = require('../config');
const { createLogger } = require('../utils/logger');
const circuitBreakerManager = require('./circuitBreakerManager');
const cacheService = require('./cacheService');
const streamingHandler = require('./streamingHandler');
const analyticsEngine = require('./analyticsEngine');
const openRouterProvider = require('../providers/openrouter');
const bytezProvider = require('../providers/bytez');

const logger = createLogger('AIRouter');

class AIRouter {
  constructor() {
    this.providers = {
      openrouter: {
        name: 'OpenRouter',
        provider: openRouterProvider,
        models: config.providers.openrouter.models,
        priority: 1
      },
      bytez: {
        name: 'Bytez AI',
        provider: bytezProvider,
        models: config.providers.bytez.models,
        priority: 2
      }
    };

    this.strategies = {
      fast: {
        primary: 'openrouter',
        model: 'deepseek/deepseek-chat'
      },
      balanced: {
        primary: 'openrouter', 
        model: 'mistralai/mistral-large'
      },
      premium: {
        primary: 'openrouter',
        model: 'openai/gpt-4o'
      }
    };

    logger.info('AI Router initialized');
  }

  /**
   * Main routing method
   */
  async route(request) {
    const { messages, tone = 'professional', platform = 'linkedin', priority = 'balanced', userId, stream = false } = request;
    
    const startTime = Date.now();
    let provider = null;
    let model = null;
    let fallbackUsed = false;
    let response = null;
    let error = null;

    // 1. Determine routing strategy
    const strategy = this.strategies[priority] || this.strategies.balanced;
    
    // 2. Check cache first
    if (!stream) {
      const cacheKey = cacheService.generateKey(messages, tone, platform, { priority });
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        logger.info(`Cache hit for request`);
        return {
          ...cached,
          fromCache: true,
          latency: Date.now() - startTime
        };
      }
    }

    // 3. Try primary provider
    try {
      provider = strategy.primary;
      model = strategy.model;
      
      const breaker = circuitBreakerManager.getBreaker(provider);
      
      if (!breaker || !breaker.isAvailable()) {
        throw new Error(`Circuit breaker open for ${provider}`);
      }

      response = await breaker.execute(async () => {
        return await this.providers[provider].provider.generateReply(messages, {
          model,
          tone,
          platform,
          stream
        });
      });

      logger.info(`Primary provider successful: ${provider}/${model}`);

    } catch (primaryError) {
      logger.warn(`Primary provider (${provider}) failed: ${primaryError.message}`);
      
      // 4. Try fallback provider
      try {
        provider = 'bytez';
        model = priority === 'fast' ? 'mistralai/mistral-7b-instruct' : 
                priority === 'premium' ? 'openai/o4-mini' : 
                'meta-llama/llama-3-8b-instruct';
        fallbackUsed = true;

        const breaker = circuitBreakerManager.getBreaker(provider);
        
        if (!breaker || !breaker.isAvailable()) {
          throw new Error(`Circuit breaker open for ${provider}`);
        }

        response = await breaker.execute(async () => {
          return await this.providers[provider].provider.generateReply(messages, {
            model,
            tone,
            platform,
            stream
          });
        });

        logger.info(`Fallback provider successful: ${provider}/${model}`);

      } catch (fallbackError) {
        error = fallbackError;
        logger.error(`Fallback provider also failed: ${fallbackError.message}`);
        
        provider = provider || 'bytez';
        model = model || 'unknown';
      }
    }

    // 5. Record analytics
    const latency = Date.now() - startTime;
    const success = !error && response;
    
    if (provider && model) {
      analyticsEngine.recordRequest(provider, model, success, latency, error?.code || null);
    }
    
    if (userId) {
      analyticsEngine.recordUserUsage(userId, platform, tone);
    }

    // 6. Cache successful response
    if (success && !stream) {
      const cacheKey = cacheService.generateKey(messages, tone, platform, { priority });
      await cacheService.set(cacheKey, {
        replies: response.replies,
        provider,
        model,
        tone,
        platform,
        generatedAt: Date.now()
      });
    }

    // 7. Return result
    return {
      success,
      replies: success ? response.replies : null,
      error: error ? {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message
      } : null,
      provider,
      model,
      fallbackUsed,
      latency,
      fromCache: false
    };
  }

  /**
   * Streaming route
   */
  async routeStream(request, clientId) {
    const { messages, tone = 'professional', platform = 'linkedin', priority = 'balanced', userId } = request;
    
    const strategy = this.strategies[priority] || this.strategies.balanced;
    const provider = 'openrouter';
    const model = strategy.model;

    try {
      streamingHandler.sendProgress(clientId, { status: 'generating', provider, model });

      const result = await this.providers[provider].provider.generateReply(messages, {
        model,
        tone,
        platform,
        stream: true
      });

      if (result.chunks && result.chunks.length > 0) {
        await streamingHandler.streamResponse(clientId, result.chunks);
      }

      analyticsEngine.recordRequest(provider, model, true, 500);
      if (userId) {
        analyticsEngine.recordUserUsage(userId, platform, tone);
      }

      return {
        success: true,
        provider,
        model,
        chunks: result.chunks
      };

    } catch (error) {
      logger.error(`Streaming error: ${error.message}`);
      streamingHandler.sendError(clientId, error.message);
      
      return {
        success: false,
        error: { code: error.code || 'STREAM_ERROR', message: error.message }
      };
    }
  }

  /**
   * Get available models
   */
  getModels() {
    return Object.entries(this.providers).map(([key, provider]) => ({
      provider: key,
      name: provider.name,
      models: provider.models,
      available: provider.provider.getModels()
    }));
  }

  /**
   * Get system health status
   */
  getHealth() {
    return {
      circuitBreakers: circuitBreakerManager.getAllStates(),
      analytics: analyticsEngine.getSummary(),
      cache: cacheService.getStats()
    };
  }

  /**
   * Get recommended provider
   */
  getRecommendedProvider(priority = 'balanced') {
    return analyticsEngine.getRecommendedProvider(priority);
  }
}

// Export singleton instance
module.exports = new AIRouter();
