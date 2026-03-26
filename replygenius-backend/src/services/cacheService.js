/**
 * ReplyGenius AI - Hybrid Cache Service
 * L1: In-memory cache (fast)
 * L2: Redis cache (distributed)
 */

const NodeCache = require('node-cache');
const { createHash } = require('crypto');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CacheService');

class CacheService {
  constructor() {
    // L1: In-memory cache
    this.memoryCache = new NodeCache({
      stdTTL: config.cache.memory.ttl,
      checkperiod: config.cache.memory.checkPeriod,
      useClones: false
    });

    // L2: Redis client (optional)
    this.redisClient = null;
    this.useRedis = !!config.cache.redis.url;
    
    if (this.useRedis) {
      this._initializeRedis();
    }
  }

  /**
   * Initialize Redis connection
   */
  async _initializeRedis() {
    try {
      const Redis = require('ioredis');
      
      this.redisClient = new Redis(config.cache.redis.url, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableReadyCheck: true,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.warn('Redis max retries reached, disabling Redis');
            this.useRedis = false;
            return null;
          }
          return Math.min(times * 100, 2000);
        }
      });

      this.redisClient.on('error', (err) => {
        logger.error('Redis error:', err.message);
        this.useRedis = false;
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis connected successfully');
        this.useRedis = true;
      });

      await this.redisClient.connect();
    } catch (error) {
      logger.warn('Redis initialization failed, using memory cache only:', error.message);
      this.useRedis = false;
    }
  }

  /**
   * Generate consistent cache key
   */
  generateKey(messages, tone, platform, options = {}) {
    const normalizedMessages = messages
      .slice(-10)
      .map(m => ({
        role: m.role,
        content: m.content.substring(0, 150)
      }));

    const keyData = {
      messages: normalizedMessages,
      tone: tone || 'professional',
      platform: platform || 'linkedin',
      priority: options.priority || 'balanced'
    };

    const str = JSON.stringify(keyData);
    const hash = createHash('sha256').update(str).digest('hex');
    
    return `reply:${hash.substring(0, 32)}`;
  }

  /**
   * Get value from cache (L1 first, then L2)
   */
  async get(key) {
    const memResult = this.memoryCache.get(key);
    if (memResult) {
      logger.debug(`Cache HIT (memory): ${key.substring(0, 16)}...`);
      return memResult;
    }

    if (this.useRedis && this.redisClient) {
      try {
        const redisResult = await this.redisClient.get(key);
        if (redisResult) {
          const parsed = JSON.parse(redisResult);
          this.memoryCache.set(key, parsed, config.cache.redis.ttl);
          logger.debug(`Cache HIT (redis): ${key.substring(0, 16)}...`);
          return parsed;
        }
      } catch (error) {
        logger.error('Redis get error:', error.message);
      }
    }

    logger.debug(`Cache MISS: ${key.substring(0, 16)}...`);
    return null;
  }

  /**
   * Set value in cache (both L1 and L2)
   */
  async set(key, value, ttl = null) {
    const memTTL = ttl || config.cache.memory.ttl;
    this.memoryCache.set(key, value, memTTL);

    if (this.useRedis && this.redisClient) {
      try {
        const redisTTL = ttl || config.cache.redis.ttl;
        await this.redisClient.setex(key, redisTTL, JSON.stringify(value));
        logger.debug(`Cache SET (both): ${key.substring(0, 16)}..., TTL: ${redisTTL}s`);
      } catch (error) {
        logger.error('Redis set error:', error.message);
      }
    }
  }

  /**
   * Invalidate specific cache entry
   */
  async invalidate(key) {
    this.memoryCache.del(key);

    if (this.useRedis && this.redisClient) {
      try {
        await this.redisClient.del(key);
        logger.debug(`Cache invalidated: ${key.substring(0, 16)}...`);
      } catch (error) {
        logger.error('Redis delete error:', error.message);
      }
    }
  }

  /**
   * Invalidate all entries for a user
   */
  async invalidateUser(userId) {
    const memKeys = this.memoryCache.keys();
    const userMemKeys = memKeys.filter(k => k.includes(userId));
    userMemKeys.forEach(k => this.memoryCache.del(k));

    if (this.useRedis && this.redisClient) {
      try {
        const pattern = `*${userId}*`;
        const redisKeys = await this.redisClient.keys(pattern);
        if (redisKeys.length > 0) {
          await this.redisClient.del(...redisKeys);
          logger.debug(`Invalidated ${redisKeys.length} Redis keys for user ${userId}`);
        }
      } catch (error) {
        logger.error('Redis user invalidate error:', error.message);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const memStats = this.memoryCache.getStats();
    
    return {
      memory: {
        keys: memStats.keys,
        hits: memStats.hits,
        misses: memStats.misses,
        hitRate: memStats.hits / (memStats.hits + memStats.misses) || 0,
        size: this.memoryCache.keys().length
      },
      redis: {
        connected: this.useRedis && this.redisClient?.status === 'ready'
      }
    };
  }

  /**
   * Clear all cache
   */
  async clear() {
    this.memoryCache.flushAll();
    
    if (this.useRedis && this.redisClient) {
      try {
        await this.redisClient.flushdb();
        logger.info('All cache cleared');
      } catch (error) {
        logger.error('Redis clear error:', error.message);
      }
    }
  }

  /**
   * Cleanup resources
   */
  async destroy() {
    this.memoryCache.flushAll();
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

module.exports = new CacheService();
