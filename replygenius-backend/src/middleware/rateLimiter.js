/**
 * ReplyGenius AI - Rate Limiter Middleware
 * Tier-based rate limiting for API endpoints
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('RateLimiter');

// Standard rate limiter for API routes
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.free.windowMs,
  max: config.rateLimit.free.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT',
    message: 'Daily rate limit exceeded. Please try again tomorrow.',
    retryAfter: 86400
  },
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    return req.path === '/health';
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for ${req.ip} or user ${req.user?.id}`);
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT',
      message: 'Daily rate limit exceeded. Please upgrade to premium for more requests.',
      limit: config.rateLimit.free.max,
      resetIn: '24 hours'
    });
  }
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT',
    message: 'Too many authentication attempts. Please try again later.'
  }
});

// Lighter limiter for streaming
const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT',
    message: 'Too many streaming connections. Please wait.'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  streamLimiter
};
