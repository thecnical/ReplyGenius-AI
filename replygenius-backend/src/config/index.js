/**
 * ReplyGenius AI V2 - Configuration Management
 * Centralized configuration for all backend services
 */

require('dotenv').config();

module.exports = {
  // ===========================================
  // Server Configuration
  // ===========================================
  server: {
    port: Number.parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    allowedOrigins: process.env.NODE_ENV === 'production'
      ? true
      : (process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'])
  },

  // ===========================================
  // JWT Configuration
  // ===========================================
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production-minimum-32-chars',
    expiresIn: '7d',
    algorithm: 'HS256',
    issuer: 'replygenius-ai-v2'
  },

  // ===========================================
  // Encryption Configuration
  // ===========================================
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-chars!'
  },

  // ===========================================
  // Provider Configuration (V2: Bytez PRIMARY, OpenRouter FALLBACK)
  // ===========================================
  providers: {
    bytez: {
      name: 'Bytez AI (PRIMARY)',
      apiKey: process.env.BYTEZ_API_KEY,
      baseUrl: 'https://api.bytez.com/models/v2',
      timeout: Number.parseInt(process.env.BYTEZ_TIMEOUT || '12000', 10),
      maxRetries: Number.parseInt(process.env.BYTEZ_RETRIES || '3', 10),
      models: {
        fast: 'mistralai/mistral-7b-instruct',
        balanced: 'meta-llama/llama-3-8b-instruct',
        premium: 'openai/o4-mini',
        available: [
          'openai-community/gpt2',
          'mistralai/mistral-7b-instruct',
          'meta-llama/llama-3-8b-instruct',
          'openai/o4-mini'
        ]
      }
    },
    openrouter: {
      name: 'OpenRouter (FALLBACK)',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
      timeout: Number.parseInt(process.env.OPENROUTER_TIMEOUT || '8000', 10),
      maxRetries: Number.parseInt(process.env.OPENROUTER_RETRIES || '2', 10),
      models: {
        fast: 'deepseek/deepseek-chat',
        balanced: 'mistralai/mistral-large',
        premium: 'openai/gpt-4o',
        available: [
          'openai/gpt-4o',
          'openai/gpt-4o-mini',
          'deepseek/deepseek-chat',
          'mistralai/mistral-large',
          'anthropic/claude-3.5-sonnet'
        ]
      }
    }
  },

  // ===========================================
  // Cache Configuration
  // ===========================================
  cache: {
    memory: {
      ttl: Number.parseInt(process.env.CACHE_MEMORY_TTL || '300', 10),
      checkPeriod: Number.parseInt(process.env.CACHE_CHECK_PERIOD || '60', 10)
    },
    redis: {
      url: process.env.REDIS_URL,
      ttl: Number.parseInt(process.env.CACHE_REDIS_TTL || '600', 10)
    }
  },

  // ===========================================
  // Circuit Breaker Configuration
  // ===========================================
  circuitBreaker: {
    failureThreshold: Number.parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    successThreshold: Number.parseInt(process.env.CIRCUIT_BREAKER_SUCCESS || '2', 10),
    timeout: Number.parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000', 10),
    halfOpenRetries: Number.parseInt(process.env.CIRCUIT_BREAKER_HALF_OPEN || '3', 10)
  },

  // ===========================================
  // Analytics Configuration
  // ===========================================
  analytics: {
    latencyThreshold: Number.parseInt(process.env.ANALYTICS_LATENCY_THRESHOLD || '3000', 10),
    failureThreshold: Number.parseInt(process.env.ANALYTICS_FAILURE_THRESHOLD || '3', 10),
    optimizationInterval: Number.parseInt(process.env.ANALYTICS_INTERVAL || '60000', 10)
  },

  // ===========================================
  // Rate Limiting Configuration (V2: 3 tiers)
  // ===========================================
  rateLimit: {
    free: {
      windowMs: 24 * 60 * 60 * 1000,
      max: Number.parseInt(process.env.RATE_LIMIT_FREE || '20', 10)
    },
    pro: {
      windowMs: 24 * 60 * 60 * 1000,
      max: Number.parseInt(process.env.RATE_LIMIT_PRO || '200', 10)
    },
    business: {
      windowMs: 24 * 60 * 60 * 1000,
      max: Number.parseInt(process.env.RATE_LIMIT_BUSINESS || '1000', 10)
    }
  }
};
