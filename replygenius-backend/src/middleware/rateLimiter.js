/**
 * ReplyGenius AI V2 - Rate Limiter Middleware
 * Tier-aware rate limiting for API and auth endpoints
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('RateLimiter');

/**
 * General API rate limiter (per-IP)
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    error: 'RATE_LIMIT',
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Auth endpoint rate limiter
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    error: 'RATE_LIMIT',
    message: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Tier-aware rate limiter middleware
 * Checks user plan and enforces daily limits
 */
const tierRateLimiter = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      // Anonymous users get free tier limits
      next();
      return;
    }

    // Lazy-load User model to avoid circular deps
    const User = require('../models/User');
    const user = await User.findById(userId);

    if (!user) {
      next();
      return;
    }

    // Check if user can generate (handles daily reset internally)
    if (!user.canGenerateReply()) {
      const limit = user.getDailyLimit();
      return res.status(429).json({
        success: false,
        error: 'DAILY_LIMIT_EXCEEDED',
        message: `You've reached your daily limit of ${limit} requests. Upgrade your plan for higher limits.`,
        limit,
        plan: user.plan,
        resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString()
      });
    }

    // Attach user for downstream use
    req.userDoc = user;
    next();
  } catch (error) {
    logger.error('Tier rate limit error:', error.message);
    next(); // Don't block on error
  }
};

module.exports = {
  apiLimiter,
  authLimiter,
  tierRateLimiter
};
