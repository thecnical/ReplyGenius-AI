/**
 * ReplyGenius AI - Main API Routes
 * Core endpoints for reply generation
 */

const express = require('express');
const router = express.Router();
const aiRouter = require('../services/ai-router');
const cacheService = require('../services/cacheService');
const analyticsEngine = require('../services/analyticsEngine');
const HistoryService = require('../services/historyService');
const streamingHandler = require('../services/streamingHandler');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { generateReplyValidation, validate } = require('../middleware/validator');

let history;

/**
 * Set history service after DB is initialized
 */
const initRoutes = (db) => {
  history = new HistoryService(db);
};

/**
 * POST /api/generate-reply
 * Generate AI reply for messages
 */
router.post('/generate-reply', 
  optionalAuth, 
  generateReplyValidation, 
  validate,
  asyncHandler(async (req, res) => {
    const { 
      messages, 
      tone = 'professional', 
      platform = 'linkedin', 
      priority = 'balanced',
      stream = false 
    } = req.body;
    
    const userId = req.user?.id;

    const result = await aiRouter.route({
      messages,
      tone,
      platform,
      priority,
      userId,
      stream
    });

    if (result.success && result.replies && userId && history) {
      await history.save({
        userId,
        platform,
        tone,
        originalMessages: messages,
        generatedReply: result.replies[0],
        provider: result.provider,
        model: result.model
      });
    }

    res.json({
      success: result.success,
      replies: result.replies,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      latency: result.latency,
      fromCache: result.fromCache,
      error: result.error
    });
  })
);

/**
 * POST /api/generate-reply/stream
 * Generate streaming AI reply
 */
router.post('/generate-reply/stream',
  optionalAuth,
  generateReplyValidation,
  validate,
  asyncHandler(async (req, res) => {
    const { messages, tone = 'professional', platform = 'linkedin', priority = 'balanced' } = req.body;
    const userId = req.user?.id;

    const clientId = streamingHandler.addClient(userId || 'anonymous', res);

    await aiRouter.routeStream({
      messages,
      tone,
      platform,
      priority,
      userId
    }, clientId);
  })
);

/**
 * GET /api/models
 * List available AI models
 */
router.get('/models', asyncHandler(async (req, res) => {
  const models = aiRouter.getModels();
  res.json({
    success: true,
    models
  });
}));

/**
 * GET /api/health
 * System health check
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = aiRouter.getHealth();
  res.json({
    success: true,
    status: 'ok',
    health: {
      ...health,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: Date.now()
    }
  });
}));

/**
 * GET /api/analytics
 * Get analytics summary
 */
router.get('/analytics', authMiddleware, asyncHandler(async (req, res) => {
  const summary = analyticsEngine.getSummary();
  res.json({ 
    success: true, 
    analytics: summary 
  });
}));

/**
 * GET /api/history
 * Get reply history
 */
router.get('/history', authMiddleware, asyncHandler(async (req, res) => {
  const { platform, limit = 20, offset = 0, favorite } = req.query;
  
  const records = await history.getHistory(req.user.id, {
    platform,
    limit: parseInt(limit),
    offset: parseInt(offset),
    favorite: favorite === 'true' ? true : favorite === 'false' ? false : undefined
  });

  res.json({
    success: true,
    history: records,
    count: records.length
  });
}));

/**
 * POST /api/history/:id/favorite
 * Toggle favorite status
 */
router.post('/history/:id/favorite', authMiddleware, asyncHandler(async (req, res) => {
  const { favorite = true } = req.body;
  const record = await history.toggleFavorite(req.params.id, favorite);
  
  res.json({
    success: true,
    record
  });
}));

/**
 * DELETE /api/history/:id
 * Delete history record
 */
router.delete('/history/:id', authMiddleware, asyncHandler(async (req, res) => {
  await history.delete(req.params.id);
  
  res.json({
    success: true,
    message: 'History deleted'
  });
}));

/**
 * POST /api/cache/invalidate
 * Invalidate user cache
 */
router.post('/cache/invalidate', authMiddleware, asyncHandler(async (req, res) => {
  await cacheService.invalidateUser(req.user.id);
  
  res.json({ 
    success: true, 
    message: 'Cache invalidated' 
  });
}));

/**
 * GET /api/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', authMiddleware, asyncHandler(async (req, res) => {
  const stats = cacheService.getStats();
  
  res.json({
    success: true,
    cache: stats
  });
}));

/**
 * GET /api/rate-limit
 * Get rate limit status
 */
router.get('/rate-limit', optionalAuth, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    limit: 20,
    remaining: 20,
    reset: Date.now() + 86400000
  });
}));

module.exports = { router, initRoutes };
