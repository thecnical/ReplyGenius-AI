/**
 * ReplyGenius AI - User Model
 * MongoDB schema for user data
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  provider: {
    type: String,
    enum: ['extension', 'google', 'github'],
    default: 'extension'
  },
  providerId: {
    type: String,
    sparse: true
  },
  password: {
    type: String,
    select: false
  },
  name: {
    type: String,
    trim: true
  },
  plan: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },
  apiKeys: {
    openrouter: {
      type: String,
      encrypted: true
    },
    bytez: {
      type: String,
      encrypted: true
    }
  },
  usage: {
    daily: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    },
    lastReset: {
      type: Date,
      default: Date.now
    }
  },
  settings: {
    defaultTone: {
      type: String,
      enum: ['professional', 'casual', 'friendly', 'funny', 'flirty', 'formal'],
      default: 'professional'
    },
    defaultPriority: {
      type: String,
      enum: ['fast', 'balanced', 'premium'],
      default: 'balanced'
    },
    autoSend: {
      type: Boolean,
      default: false
    },
    autoTone: {
      type: Boolean,
      default: false
    }
  },
  preferences: {
    darkMode: {
      type: Boolean,
      default: true
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  stats: {
    repliesGenerated: {
      type: Number,
      default: 0
    },
    charactersSaved: {
      type: Number,
      default: 0
    },
    lastActive: {
      type: Date
    }
  },
  stripeCustomerId: {
    type: String,
    select: false
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'cancelled', 'past_due', 'trialing'],
    default: 'free'
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
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
userSchema.index({ email: 1 });
userSchema.index({ provider: 1, providerId: 1 });
userSchema.index({ referralCode: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'usage.daily': 1, 'usage.lastReset': 1 });

// Virtual for full name
userSchema.virtual('displayName').get(function() {
  return this.name || this.email?.split('@')[0] || 'User';
});

// Pre-save middleware to update timestamp
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Method to check if user can generate replies
userSchema.methods.canGenerateReply = function() {
  // Reset daily usage if it's a new day
  const now = new Date();
  const lastReset = new Date(this.usage.lastReset);
  
  if (now.toDateString() !== lastReset.toDateString()) {
    this.usage.daily = 0;
    this.usage.lastReset = now;
  }
  
  const dailyLimit = this.plan === 'premium' ? 1000 : 20;
  return this.usage.daily < dailyLimit;
};

// Method to increment usage
userSchema.methods.incrementUsage = function() {
  this.usage.daily += 1;
  this.usage.total += 1;
  this.stats.repliesGenerated += 1;
  this.stats.lastActive = new Date();
};

// Static method to find or create user
userSchema.statics.findOrCreate = async function(profile) {
  let user = await this.findOne({ 
    provider: profile.provider, 
    providerId: profile.providerId 
  });
  
  if (!user) {
    user = await this.create(profile);
  }
  
  return user;
};

module.exports = mongoose.model('User', userSchema);
