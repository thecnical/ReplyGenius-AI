/**
 * ReplyGenius AI - Authentication Routes
 * User registration, login, and token management
 */

const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const encryptionService = require('../services/encryptionService');
const { asyncHandler } = require('../middleware/errorHandler');
const { authValidation, validate } = require('../middleware/validator');
const { authLimiter } = require('../middleware/rateLimiter');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AuthRoutes');

/**
 * POST /auth/register
 * Register new user
 */
router.post('/register', 
  authLimiter, 
  authValidation.register, 
  validate,
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    
    const userId = `user_${Date.now()}`;
    const tokenData = authService.generateToken(userId, { email, plan: 'free' });
    
    logger.info(`User registered: ${email}`);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: userId,
        email,
        plan: 'free'
      },
      token: tokenData.token,
      expiresIn: tokenData.expiresIn
    });
  })
);

/**
 * POST /auth/login
 * Login existing user
 */
router.post('/login', 
  authLimiter, 
  authValidation.login, 
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    const userId = `user_${Date.now()}`;
    const tokenData = authService.generateToken(userId, { email, plan: 'free' });
    
    logger.info(`User logged in: ${email}`);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: userId,
        email,
        plan: 'free'
      },
      token: tokenData.token,
      expiresIn: tokenData.expiresIn
    });
  })
);

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Token is required'
    });
  }
  
  const newTokenData = await authService.refreshToken(token);
  
  res.json({
    success: true,
    token: newTokenData.token,
    expiresIn: newTokenData.expiresIn
  });
}));

/**
 * POST /auth/logout
 * Logout (revoke token)
 */
router.post('/logout', asyncHandler(async (req, res) => {
  const { tokenId } = req.body;
  
  if (tokenId) {
    authService.revokeToken(tokenId);
  }
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

/**
 * GET /auth/me
 * Get current user info
 */
router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'No token provided'
    });
  }
  
  const token = authHeader.substring(7);
  const verification = await authService.getUserFromToken(token);
  
  if (!verification) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Invalid token'
    });
  }
  
  res.json({
    success: true,
    user: {
      id: verification.id,
      plan: 'free'
    }
  });
}));

/**
 * POST /auth/api-key
 * Save user's API key
 */
router.post('/api-key', asyncHandler(async (req, res) => {
  const { provider, apiKey } = req.body;
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Authentication required'
    });
  }
  
  const token = authHeader.substring(7);
  const verification = await authService.getUserFromToken(token);
  
  if (!verification) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Invalid token'
    });
  }
  
  const encryptedKey = encryptionService.encrypt(apiKey);
  
  logger.info(`API key saved for user ${verification.id}, provider: ${provider}`);
  
  res.json({
    success: true,
    message: `API key saved for ${provider}`
  });
}));

module.exports = router;
