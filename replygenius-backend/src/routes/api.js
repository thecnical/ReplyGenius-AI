/**
 * ReplyGenius AI V2 - Main API Routes
 * Core endpoints: reply generation, templates, personalities, analytics dashboard, context analysis, memory
 */

const express = require('express');
const router = express.Router();
const aiRouter = require('../services/ai-router');
const cacheService = require('../services/cacheService');
const analyticsEngine = require('../services/analyticsEngine');
const HistoryService = require('../services/historyService');
const streamingHandler = require('../services/streamingHandler');
const personalityEngine = require('../services/personalityEngine');
const memoryService = require('../services/memoryService');
const Template = require('../models/Template');
const User = require('../models/User');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { tierRateLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const { generateReplyValidation, validate } = require('../middleware/validator');

let history;

/**
 * Set history service after DB is initialized
 */
const initRoutes = async (db) => {
  history = new HistoryService(db);

  // Seed builtin templates on startup
  try {
    await Template.seedBuiltins();
  } catch (e) {
    console.log('Template seeding skipped or failed:', e.message);
  }
};

// =============================================
// REPLY GENERATION
// =============================================

/**
 * POST /api/generate-reply
 * Generate AI reply with V2 features (context, personality, template, memory)
 */
router.post('/generate-reply',
  optionalAuth,
  tierRateLimiter,
  generateReplyValidation,
  validate,
  asyncHandler(async (req, res) => {
    const {
      messages,
      tone = 'professional',
      platform = 'linkedin',
      priority = 'balanced',
      stream = false,
      personality = null,
      templateId = null
    } = req.body;

    const userId = req.user?.id;

    // Get template content if specified
    let templateContent = null;
    if (templateId) {
      const template = await Template.findById(templateId);
      if (template) {
        templateContent = template.content;
        template.usageCount += 1;
        await template.save();
      }
    }

    // Get user style from memory if authenticated
    let userStyle = null;
    if (userId) {
      userStyle = await memoryService.getStylePrompt(userId);
    }

    const result = await aiRouter.route({
      messages,
      tone,
      platform,
      priority,
      userId,
      stream,
      personality,
      templateContent,
      userStyle
    });

    // Save to history + update usage if authenticated
    if (result.success && result.replies && userId) {
      if (history) {
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

      // Record in memory system
      await memoryService.recordReply(userId, {
        originalContext: messages.map(m => m.content).join(' ').substring(0, 500),
        generatedReply: result.replies[0],
        platform,
        tone,
        accepted: true
      });

      // Increment usage counters
      if (req.userDoc) {
        req.userDoc.incrementUsage(tone, platform);
        await req.userDoc.save();
      }
    }

    res.json({
      success: result.success,
      replies: result.replies,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      latency: result.latency,
      fromCache: result.fromCache,
      contextAnalysis: result.contextAnalysis,
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
  tierRateLimiter,
  generateReplyValidation,
  validate,
  asyncHandler(async (req, res) => {
    const { messages, tone = 'professional', platform = 'linkedin', priority = 'balanced', personality = null } = req.body;
    const userId = req.user?.id;

    const clientId = streamingHandler.addClient(userId || 'anonymous', res);

    await aiRouter.routeStream({
      messages,
      tone,
      platform,
      priority,
      userId,
      personality
    }, clientId);
  })
);

/**
 * POST /api/analyze-context
 * Analyze conversation context (for real-time suggestion mode)
 */
router.post('/analyze-context',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { messages, platform = 'general' } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Messages array is required'
      });
    }

    const analysis = aiRouter.analyzeContext(messages, platform);

    res.json({
      success: true,
      analysis
    });
  })
);

// =============================================
// TEMPLATES
// =============================================

/**
 * GET /api/templates
 * List all templates (builtin + user custom)
 */
router.get('/templates',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { category, platform } = req.query;
    const userId = req.user?.id;

    let query = {};

    if (userId) {
      query = { $or: [{ isBuiltin: true }, { userId }] };
    } else {
      query = { isBuiltin: true };
    }

    if (category) query.category = category;
    if (platform) query.platform = platform;

    const templates = await Template.find(query).sort({ category: 1, usageCount: -1 });

    // Group by category
    const grouped = {};
    templates.forEach(t => {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t);
    });

    res.json({
      success: true,
      templates,
      grouped,
      total: templates.length
    });
  })
);

/**
 * POST /api/templates
 * Create custom template (auth required)
 */
router.post('/templates',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { name, category, content, platform, tone, tags } = req.body;

    if (!name || !category || !content) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Name, category, and content are required'
      });
    }

    const template = await Template.create({
      name,
      category,
      content,
      platform: platform || 'general',
      tone: tone || 'professional',
      tags: tags || [],
      isBuiltin: false,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      template
    });
  })
);

/**
 * DELETE /api/templates/:id
 * Delete custom template (auth required, can't delete builtins)
 */
router.delete('/templates/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    if (template.isBuiltin) {
      return res.status(403).json({ success: false, message: 'Cannot delete builtin templates' });
    }

    if (template.userId?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await Template.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: 'Template deleted' });
  })
);

// =============================================
// PERSONALITIES
// =============================================

/**
 * GET /api/personalities
 * List all available AI personalities
 */
router.get('/personalities', asyncHandler(async (req, res) => {
  const personalities = personalityEngine.getAll();
  res.json({
    success: true,
    personalities
  });
}));

// =============================================
// ANALYTICS DASHBOARD
// =============================================

/**
 * GET /api/analytics/dashboard
 * Get comprehensive analytics dashboard data
 */
router.get('/analytics/dashboard',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // System analytics
    const systemSummary = analyticsEngine.getSummary();

    // User-specific stats
    const toneBreakdown = {};
    if (user.stats.toneBreakdown) {
      for (const [key, value] of user.stats.toneBreakdown) {
        toneBreakdown[key] = value;
      }
    }

    const platformBreakdown = {};
    if (user.stats.platformBreakdown) {
      for (const [key, value] of user.stats.platformBreakdown) {
        platformBreakdown[key] = value;
      }
    }

    // Memory stats
    const memoryStats = await memoryService.getStats(req.user.id);

    res.json({
      success: true,
      dashboard: {
        user: {
          plan: user.plan,
          repliesGenerated: user.stats.repliesGenerated,
          charactersSaved: user.stats.charactersSaved,
          dailyUsage: user.usage.daily,
          dailyLimit: user.getDailyLimit(),
          totalUsage: user.usage.total,
          memberSince: user.createdAt,
          lastActive: user.stats.lastActive
        },
        breakdown: {
          tones: toneBreakdown,
          platforms: platformBreakdown
        },
        system: {
          ...systemSummary,
          primaryProvider: 'Bytez AI',
          fallbackProvider: 'OpenRouter'
        },
        memory: memoryStats
      }
    });
  })
);

/**
 * GET /api/analytics
 * Get analytics summary (backward-compatible)
 */
router.get('/analytics', authMiddleware, asyncHandler(async (req, res) => {
  const summary = analyticsEngine.getSummary();
  res.json({
    success: true,
    analytics: summary
  });
}));

// =============================================
// MEMORY
// =============================================

/**
 * GET /api/memory/stats
 * Get user's AI memory stats
 */
router.get('/memory/stats',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const stats = await memoryService.getStats(req.user.id);
    res.json({ success: true, memory: stats });
  })
);

/**
 * DELETE /api/memory
 * Reset user's AI memory
 */
router.delete('/memory',
  authMiddleware,
  asyncHandler(async (req, res) => {
    await memoryService.resetMemory(req.user.id);
    res.json({ success: true, message: 'AI memory reset' });
  })
);

// =============================================
// HISTORY
// =============================================

router.get('/history', authMiddleware, asyncHandler(async (req, res) => {
  const { platform, limit = 20, offset = 0, favorite } = req.query;

  const records = await history.getHistory(req.user.id, {
    platform,
    limit: Number.parseInt(limit, 10),
    offset: Number.parseInt(offset, 10),
    favorite: favorite === 'true' ? true : (favorite === 'false' ? false : undefined)
  });

  res.json({
    success: true,
    history: records,
    count: records.length
  });
}));

router.post('/history/:id/favorite', authMiddleware, asyncHandler(async (req, res) => {
  const { favorite = true } = req.body;
  const record = await history.toggleFavorite(req.params.id, favorite);
  res.json({ success: true, record });
}));

router.delete('/history/:id', authMiddleware, asyncHandler(async (req, res) => {
  await history.delete(req.params.id);
  res.json({ success: true, message: 'History deleted' });
}));

// =============================================
// SYSTEM
// =============================================

router.get('/models', asyncHandler(async (req, res) => {
  const models = aiRouter.getModels();
  res.json({ success: true, models });
}));

router.get('/health', asyncHandler(async (req, res) => {
  const health = aiRouter.getHealth();
  res.json({
    success: true,
    status: 'ok',
    version: '2.0.0',
    health: {
      ...health,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: Date.now()
    }
  });
}));

router.post('/cache/invalidate', authMiddleware, asyncHandler(async (req, res) => {
  await cacheService.invalidateUser(req.user.id);
  res.json({ success: true, message: 'Cache invalidated' });
}));

router.get('/cache/stats', authMiddleware, asyncHandler(async (req, res) => {
  const stats = cacheService.getStats();
  res.json({ success: true, cache: stats });
}));

router.get('/rate-limit', optionalAuth, asyncHandler(async (req, res) => {
  let limit = 20;
  let remaining = 20;

  if (req.user?.id) {
    const user = await User.findById(req.user.id);
    if (user) {
      limit = user.getDailyLimit();
      remaining = Math.max(0, limit - user.usage.daily);
    }
  }

  res.json({
    success: true,
    limit,
    remaining,
    reset: Date.now() + 86400000
  });
}));

module.exports = { router, initRoutes };
