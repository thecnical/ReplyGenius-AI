/**
 * ReplyGenius AI - Analytics Log Model
 * MongoDB schema for analytics and usage tracking
 */

const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  event: {
    type: String,
    required: true,
    enum: [
      'request',
      'cache_hit',
      'cache_miss',
      'fallback_triggered',
      'circuit_opened',
      'circuit_closed',
      'error',
      'user_login',
      'user_register',
      'reply_used',
      'reply_edited',
      'reply_favorited',
      'settings_changed',
      'api_key_added',
      'subscription_upgraded',
      'subscription_cancelled'
    ]
  },
  provider: {
    type: String,
    enum: ['openrouter', 'bytez', 'system']
  },
  model: {
    type: String
  },
  platform: {
    type: String,
    enum: ['linkedin', 'whatsapp', 'gmail', 'twitter', 'instagram', 'facebook', 'other']
  },
  tone: {
    type: String
  },
  priority: {
    type: String,
    enum: ['fast', 'balanced', 'premium']
  },
  metrics: {
    latency: Number,
    tokensUsed: Number,
    cost: Number,
    cacheHit: Boolean,
    fallbackUsed: Boolean,
    errorCode: String,
    errorMessage: String
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    extensionVersion: String,
    country: String,
    region: String,
    city: String
  },
  sessionId: {
    type: String,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  capped: { size: 1073741824, max: 1000000 } // 1GB cap, max 1M documents
});

// Compound indexes for common queries
analyticsSchema.index({ userId: 1, timestamp: -1 });
analyticsSchema.index({ event: 1, timestamp: -1 });
analyticsSchema.index({ provider: 1, timestamp: -1 });
analyticsSchema.index({ sessionId: 1, timestamp: -1 });
analyticsSchema.index({ timestamp: -1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // Auto-delete after 90 days

// Static method to log an event
analyticsSchema.statics.logEvent = async function(data) {
  try {
    return await this.create(data);
  } catch (error) {
    console.error('Failed to log analytics event:', error.message);
    return null;
  }
};

// Static method to get provider stats
analyticsSchema.statics.getProviderStats = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        event: 'request',
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          provider: '$provider',
          model: '$model'
        },
        totalRequests: { $sum: 1 },
        avgLatency: { $avg: '$metrics.latency' },
        totalTokens: { $sum: '$metrics.tokensUsed' },
        totalCost: { $sum: '$metrics.cost' },
        cacheHits: {
          $sum: { $cond: ['$metrics.cacheHit', 1, 0] }
        },
        fallbackUsed: {
          $sum: { $cond: ['$metrics.fallbackUsed', 1, 0] }
        }
      }
    },
    { $sort: { totalRequests: -1 } }
  ]);
};

// Static method to get user activity
analyticsSchema.statics.getUserActivity = async function(userId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          event: '$event'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': -1 } }
  ]);
};

// Static method to get error stats
analyticsSchema.statics.getErrorStats = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        event: 'error',
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          provider: '$provider',
          errorCode: '$metrics.errorCode'
        },
        count: { $sum: 1 },
        lastOccurrence: { $max: '$timestamp' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
};

// Static method to get daily stats
analyticsSchema.statics.getDailyStats = async function(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const result = await this.aggregate([
    {
      $match: {
        timestamp: { $gte: startOfDay, $lte: endOfDay }
      }
    },
    {
      $group: {
        _id: null,
        totalRequests: {
          $sum: { $cond: [{ $eq: ['$event', 'request'] }, 1, 0] }
        },
        uniqueUsers: { $addToSet: '$userId' },
        totalErrors: {
          $sum: { $cond: [{ $eq: ['$event', 'error'] }, 1, 0] }
        },
        avgLatency: { $avg: '$metrics.latency' },
        cacheHits: {
          $sum: { $cond: ['$metrics.cacheHit', 1, 0] }
        }
      }
    }
  ]);
  
  if (result.length > 0) {
    return {
      date: date.toISOString().split('T')[0],
      ...result[0],
      uniqueUsers: result[0].uniqueUsers.length
    };
  }
  
  return {
    date: date.toISOString().split('T')[0],
    totalRequests: 0,
    uniqueUsers: 0,
    totalErrors: 0,
    avgLatency: 0,
    cacheHits: 0
  };
};

// Method to add context
analyticsSchema.methods.addContext = function(context) {
  this.metadata = {
    ...this.metadata,
    ...context
  };
  return this;
};

module.exports = mongoose.model('AnalyticsLog', analyticsSchema);
