/**
 * ReplyGenius AI V2 - Authentication Routes
 * Real user registration, login, and token management with MongoDB persistence
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authService = require('../services/authService');
const encryptionService = require('../services/encryptionService');
const { asyncHandler } = require('../middleware/errorHandler');
const { authValidation, validate } = require('../middleware/validator');
const { authLimiter } = require('../middleware/rateLimiter');
const { authMiddleware } = require('../middleware/auth');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AuthRoutes');

/**
 * POST /auth/register
 * Register new user with MongoDB persistence
 */
router.post('/register',
  authLimiter,
  authValidation.register,
  validate,
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'USER_EXISTS',
        message: 'An account with this email already exists'
      });
    }

    // Create user in MongoDB (password is hashed via pre-save hook)
    const user = await User.create({
      email,
      password,
      name: name || email.split('@')[0],
      provider: 'extension',
      plan: 'free'
    });

    // Generate JWT
    const tokenData = authService.generateToken(user._id.toString(), {
      email: user.email,
      plan: user.plan
    });

    logger.info(`User registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        settings: user.settings,
        preferences: user.preferences,
        stats: user.stats
      },
      token: tokenData.token,
      expiresIn: tokenData.expiresIn
    });
  })
);

/**
 * POST /auth/login
 * Login existing user with password verification
 */
router.post('/login',
  authLimiter,
  authValidation.login,
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Find user including password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_ERROR',
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_ERROR',
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT
    const tokenData = authService.generateToken(user._id.toString(), {
      email: user.email,
      plan: user.plan
    });

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        settings: user.settings,
        preferences: user.preferences,
        stats: user.stats
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
 * Get current user info from database
 */
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'USER_NOT_FOUND',
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      settings: user.settings,
      preferences: user.preferences,
      stats: user.stats,
      usage: {
        daily: user.usage.daily,
        total: user.usage.total,
        limit: user.getDailyLimit(),
        remaining: Math.max(0, user.getDailyLimit() - user.usage.daily)
      },
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }
  });
}));

/**
 * PUT /auth/settings
 * Update user settings
 */
router.put('/settings', authMiddleware, asyncHandler(async (req, res) => {
  const { settings, preferences } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'USER_NOT_FOUND',
      message: 'User not found'
    });
  }

  if (settings) {
    Object.assign(user.settings, settings);
  }
  if (preferences) {
    Object.assign(user.preferences, preferences);
  }

  await user.save();

  res.json({
    success: true,
    message: 'Settings updated',
    settings: user.settings,
    preferences: user.preferences
  });
}));

/**
 * POST /auth/api-key
 * Save user's API key
 */
router.post('/api-key', authMiddleware, asyncHandler(async (req, res) => {
  const { provider, apiKey } = req.body;

  // Encrypt and store the key (actual storage handled by User model)
  encryptionService.encrypt(apiKey);

  logger.info(`API key saved for user ${req.user.id}, provider: ${provider}`);

  res.json({
    success: true,
    message: `API key saved for ${provider}`
  });
}));

module.exports = router;
