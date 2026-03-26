/**
 * ReplyGenius AI - History Model
 * MongoDB schema for reply history
 */

const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  platform: {
    type: String,
    enum: ['linkedin', 'whatsapp', 'gmail', 'twitter', 'instagram', 'facebook', 'other'],
    required: true
  },
  tone: {
    type: String,
    enum: ['professional', 'casual', 'friendly', 'funny', 'flirty', 'formal'],
    default: 'professional'
  },
  context: {
    conversationId: {
      type: String,
      index: true
    },
    previousMessages: [{
      role: String,
      content: String,
      timestamp: Date
    }],
    detectedLanguage: {
      type: String,
      default: 'en'
    },
    detectedIntent: {
      type: String
    }
  },
  originalMessage: {
    content: String,
    sender: String,
    timestamp: Date
  },
  generatedReply: {
    type: String,
    required: true
  },
  selectedReply: {
    type: String
  },
  provider: {
    type: String,
    enum: ['openrouter', 'bytez'],
    required: true
  },
  model: {
    type: String,
    required: true
  },
  latency: {
    type: Number
  },
  tokensUsed: {
    type: Number
  },
  feedback: {
    type: String,
    enum: ['positive', 'negative', 'neutral', null],
    default: null
  },
  editedReply: {
    type: String
  },
  favorite: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String
  }],
  metadata: {
    userAgent: String,
    ipAddress: String,
    extensionVersion: String,
    platformVersion: String
  },
  status: {
    type: String,
    enum: ['generated', 'used', 'edited', 'discarded'],
    default: 'generated'
  },
  usedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true
  },
  toObject: {
    virtuals: true
  }
});

// Indexes for performance
historySchema.index({ userId: 1, createdAt: -1 });
historySchema.index({ userId: 1, platform: 1, createdAt: -1 });
historySchema.index({ userId: 1, favorite: 1 });
historySchema.index({ userId: 1, 'context.conversationId': 1 });
historySchema.index({ createdAt: -1 });

// Virtual for response time display
historySchema.virtual('responseTime').get(function() {
  return this.latency ? `${this.latency}ms` : 'N/A';
});

// Pre-save middleware
historySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get user history with pagination
historySchema.statics.getUserHistory = async function(userId, options = {}) {
  const { platform, limit = 20, offset = 0, favorite, startDate, endDate } = options;
  
  const query = { userId };
  
  if (platform) query.platform = platform;
  if (favorite !== undefined) query.favorite = favorite;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const [records, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);
  
  return { records, total, limit, offset };
};

// Static method to get popular tones for user
historySchema.statics.getPopularTones = async function(userId) {
  return this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: '$tone', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);
};

// Static method to get usage stats
historySchema.statics.getUsageStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { 
      $match: { 
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      } 
    },
    {
      $group: {
        _id: {
          platform: '$platform',
          tone: '$tone'
        },
        count: { $sum: 1 },
        avgLatency: { $avg: '$latency' },
        totalTokens: { $sum: '$tokensUsed' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Method to mark as used
historySchema.methods.markAsUsed = async function(selectedReply) {
  this.status = 'used';
  this.selectedReply = selectedReply;
  this.usedAt = new Date();
  return this.save();
};

// Method to add feedback
historySchema.methods.addFeedback = async function(feedback) {
  this.feedback = feedback;
  return this.save();
};

module.exports = mongoose.model('History', historySchema);
