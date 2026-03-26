/**
 * ReplyGenius AI V2 - Central AI Router
 * Routes requests to optimal provider with fallback, caching, analytics, context analysis, personality, and memory
 * PRIMARY: Bytez AI | FALLBACK: OpenRouter
 */

const config = require('../config');
const { createLogger } = require('../utils/logger');
const circuitBreakerManager = require('./circuitBreakerManager');
const cacheService = require('./cacheService');
const streamingHandler = require('./streamingHandler');
const analyticsEngine = require('./analyticsEngine');
const contextAnalyzer = require('./contextAnalyzer');
const personalityEngine = require('./personalityEngine');
const openRouterProvider = require('../providers/openrouter');
const bytezProvider = require('../providers/bytez');

const logger = createLogger('AIRouter');

class AIRouter {
  constructor() {
    this.providers = {
      bytez: {
        name: 'Bytez AI',
        provider: bytezProvider,
        models: config.providers.bytez.models,
        priority: 1 // PRIMARY
      },
      openrouter: {
        name: 'OpenRouter',
        provider: openRouterProvider,
        models: config.providers.openrouter.models,
        priority: 2 // FALLBACK
      }
    };

    // V2: Bytez is PRIMARY for all strategies
    this.strategies = {
      fast: {
        primary: 'bytez',
        model: 'mistralai/mistral-7b-instruct',
        fallbackProvider: 'openrouter',
        fallbackModel: 'deepseek/deepseek-chat'
      },
      balanced: {
        primary: 'bytez',
        model: 'meta-llama/llama-3-8b-instruct',
        fallbackProvider: 'openrouter',
        fallbackModel: 'mistralai/mistral-large'
      },
      premium: {
        primary: 'bytez',
        model: 'openai/o4-mini',
        fallbackProvider: 'openrouter',
        fallbackModel: 'openai/gpt-4o'
      }
    };

    logger.info('AI Router V2 initialized — Bytez PRIMARY, OpenRouter FALLBACK');
  }

  /**
   * Main routing method with context analysis, personality, and memory
   */
  async route(request) {
    const {
      messages,
      tone = 'professional',
      platform = 'linkedin',
      priority = 'balanced',
      userId,
      stream = false,
      personality = null,
      templateContent = null,
      userStyle = null
    } = request;

    const startTime = Date.now();
    let provider = null;
    let model = null;
    let fallbackUsed = false;
    let response = null;
    let error = null;

    // 1. Determine routing strategy
    const strategy = this.strategies[priority] || this.strategies.balanced;

    // 2. Run context analysis + personality resolution
    const { contextAnalysis, personalityPrompt, effectiveTone } = this._prepareContext(messages, platform, tone, personality);

    // 3. Check cache
    if (!stream) {
      const cached = await this._checkCache(messages, effectiveTone, platform, priority, personality, startTime, contextAnalysis);
      if (cached) return cached;
    }

    // 6. Build enhanced options
    const genOptions = {
      tone: effectiveTone,
      platform,
      stream,
      contextAnalysis,
      personalityPrompt,
      templateContent,
      userStyle
    };

    // 7. Try PRIMARY then FALLBACK
    const primaryResult = await this._tryProvider(
      strategy.primary, strategy.model, messages, genOptions
    );

    if (primaryResult.success) {
      provider = strategy.primary;
      model = strategy.model;
      response = primaryResult.response;
      logger.info(`Primary provider successful: ${provider}/${model}`);
    } else {
      logger.warn(`Primary provider (${strategy.primary}) failed: ${primaryResult.error}`);
      fallbackUsed = true;

      const fallbackResult = await this._tryProvider(
        strategy.fallbackProvider, strategy.fallbackModel, messages, genOptions
      );

      if (fallbackResult.success) {
        provider = strategy.fallbackProvider;
        model = strategy.fallbackModel;
        response = fallbackResult.response;
        logger.info(`Fallback provider successful: ${provider}/${model}`);
      } else {
        error = new Error(fallbackResult.error);
        logger.error(`Fallback provider also failed: ${fallbackResult.error}`);
        provider = strategy.fallbackProvider || 'openrouter';
        model = strategy.fallbackModel || 'unknown';
      }
    }

    // 9. Record analytics and cache
    const latency = Date.now() - startTime;
    const success = !error && response;
    this._recordAnalytics({ provider, model, success, latency, error, userId, platform, effectiveTone, stream, messages, priority, personality, response });



    // 11. Return result
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
      fromCache: false,
      contextAnalysis
    };
  }

  /**
   * Streaming route — tries Bytez first, falls back to OpenRouter
   */
  async routeStream(request, clientId) {
    const { messages, tone = 'professional', platform = 'linkedin', priority = 'balanced', userId, personality = null } = request;

    const strategy = this.strategies[priority] || this.strategies.balanced;
    let provider = strategy.primary;
    let model = strategy.model;

    const contextAnalysis = contextAnalyzer.analyzeConversation(messages, platform);
    const effectiveTone = contextAnalysis?.suggestedTone || tone;
    const personalityPrompt = personality ? personalityEngine.getPersonalityPrompt(personality) : null;

    const genOptions = { model, tone: effectiveTone, platform, stream: true, contextAnalysis, personalityPrompt };

    try {
      streamingHandler.sendProgress(clientId, { status: 'generating', provider, model });

      const result = await this.providers[provider].provider.generateReply(messages, genOptions);

      if (result.chunks && result.chunks.length > 0) {
        await streamingHandler.streamResponse(clientId, result.chunks);
      }

      analyticsEngine.recordRequest(provider, model, true, 500);
      if (userId) analyticsEngine.recordUserUsage(userId, platform, effectiveTone);

      return { success: true, provider, model, chunks: result.chunks };

    } catch (primaryError) {
      logger.warn(`Stream primary failed: ${primaryError.message}, trying fallback...`);

      // Fallback to OpenRouter
      provider = strategy.fallbackProvider;
      model = strategy.fallbackModel;
      genOptions.model = model;

      try {
        streamingHandler.sendProgress(clientId, { status: 'fallback', provider, model });

        const result = await this.providers[provider].provider.generateReply(messages, genOptions);

        if (result.chunks && result.chunks.length > 0) {
          await streamingHandler.streamResponse(clientId, result.chunks);
        }

        analyticsEngine.recordRequest(provider, model, true, 500);
        if (userId) analyticsEngine.recordUserUsage(userId, platform, effectiveTone);

        return { success: true, provider, model, chunks: result.chunks, fallbackUsed: true };

      } catch (fallbackError) {
        logger.error(`Stream fallback also failed: ${fallbackError.message}`);
        streamingHandler.sendError(clientId, fallbackError.message);
        return { success: false, error: { code: fallbackError.code || 'STREAM_ERROR', message: fallbackError.message } };
      }
    }
  }

  /**
   * Prepare context analysis, personality, and effective tone
   * @private
   */
  _prepareContext(messages, platform, tone, personality) {
    let contextAnalysis = null;
    try {
      contextAnalysis = contextAnalyzer.analyzeConversation(messages, platform);
      logger.info(`Context analysis: intent=${contextAnalysis.intent}, emotion=${contextAnalysis.emotion}`);
    } catch (ctxError) {
      logger.warn(`Context analysis failed: ${ctxError.message}`);
    }

    const personalityPrompt = personality ? personalityEngine.getPersonalityPrompt(personality) : null;
    const effectiveTone = contextAnalysis?.suggestedTone || tone;

    return { contextAnalysis, personalityPrompt, effectiveTone };
  }

  /**
   * Check cache for existing response
   * @private
   */
  async _checkCache(messages, effectiveTone, platform, priority, personality, startTime, contextAnalysis) {
    const cacheKey = cacheService.generateKey(messages, effectiveTone, platform, { priority, personality });
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      logger.info('Cache hit for request');
      return { ...cached, fromCache: true, latency: Date.now() - startTime, contextAnalysis };
    }
    return null;
  }

  /**
   * Record analytics and cache response
   * @private
   */
  _recordAnalytics({ provider, model, success, latency, error, userId, platform, effectiveTone, stream, messages, priority, personality, response }) {
    if (provider && model) {
      analyticsEngine.recordRequest(provider, model, success, latency, error?.code ?? null);
    }
    if (userId) {
      analyticsEngine.recordUserUsage(userId, platform, effectiveTone);
    }
    if (success && !stream) {
      const cacheKey = cacheService.generateKey(messages, effectiveTone, platform, { priority, personality });
      cacheService.set(cacheKey, {
        replies: response.replies, provider, model,
        tone: effectiveTone, platform, generatedAt: Date.now()
      });
    }
  }

  /**
   * Try a single provider with circuit breaker
   * @private
   */
  async _tryProvider(providerKey, modelKey, messages, genOptions) {
    try {
      genOptions.model = modelKey;
      const breaker = circuitBreakerManager.getBreaker(providerKey);

      if (!breaker?.isAvailable()) {
        return { success: false, error: `Circuit breaker open for ${providerKey}` };
      }

      const response = await breaker.execute(async () => {
        return await this.providers[providerKey].provider.generateReply(messages, genOptions);
      });

      return { success: true, response };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Analyze context only (for suggestion mode)
   */
  analyzeContext(messages, platform) {
    return contextAnalyzer.analyzeConversation(messages, platform);
  }

  /**
   * Get available models
   */
  getModels() {
    return Object.entries(this.providers).map(([key, provider]) => ({
      provider: key,
      name: provider.name,
      models: provider.models,
      available: provider.provider.getModels(),
      isPrimary: provider.priority === 1
    }));
  }

  /**
   * Get system health status
   */
  getHealth() {
    return {
      circuitBreakers: circuitBreakerManager.getAllStates(),
      analytics: analyticsEngine.getSummary(),
      cache: cacheService.getStats(),
      primaryProvider: 'bytez',
      fallbackProvider: 'openrouter'
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
