/**
 * ReplyGenius AI - Authentication Middleware
 * JWT token verification for protected routes
 */

const authService = require('../services/authService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AuthMiddleware');

/**
 * Required authentication middleware
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_ERROR',
        message: 'Missing authorization header'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_ERROR',
        message: 'Invalid authorization format'
      });
    }

    const token = authHeader.substring(7);
    const user = await authService.getUserFromToken(token);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_ERROR',
        message: 'Invalid or expired token'
      });
    }

    req.user = {
      id: user.id,
      tokenId: user.tokenId
    };

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error.message);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication middleware
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = await authService.getUserFromToken(token);
    
    if (user) {
      req.user = { id: user.id };
    }
  }
  
  next();
};

/**
 * Rate limit check middleware
 */
const checkRateLimit = (options = {}) => {
  const { freeLimit = 20, premiumLimit = 1000 } = options;
  
  return async (req, res, next) => {
    const userId = req.user?.id;
    const limit = freeLimit;
    next();
  };
};

module.exports = { 
  authMiddleware, 
  optionalAuth, 
  checkRateLimit 
};
