/**
 * ReplyGenius AI V2 - User Model
 * MongoDB schema for user data with V2 tier system, auth, and memory
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
    enum: ['free', 'pro', 'business'],
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
    defaultPersonality: {
      type: String,
      enum: ['corporate_pro', 'friendly_buddy', 'sales_closer', 'casual_genz', 'flirty_mode', null],
      default: null
    },
    autoMode: {
      type: String,
      enum: ['manual', 'suggestion', 'auto_reply'],
      default: 'manual'
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
    },
    voiceEnabled: {
      type: Boolean,
      default: false
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
    },
    toneBreakdown: {
      type: Map,
      of: Number,
      default: {}
    },
    platformBreakdown: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  stripeCustomerId: {
    type: String,
    select: false
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'cancelled', 'past_due', 'trialing', 'free'],
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

// Virtual for display name
userSchema.virtual('displayName').get(function() {
  return this.name || this.email?.split('@')[0] || 'User';
});

// Pre-save: hash password if modified
userSchema.pre('save', async function(next) {
  this.updatedAt = new Date();

  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Instance method: compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Instance method: check if user can generate replies
userSchema.methods.canGenerateReply = function() {
  const now = new Date();
  const lastReset = new Date(this.usage.lastReset);

  if (now.toDateString() !== lastReset.toDateString()) {
    this.usage.daily = 0;
    this.usage.lastReset = now;
  }

  const limits = {
    free: 20,
    pro: 200,
    business: 1000
  };
  const dailyLimit = limits[this.plan] || 20;
  return this.usage.daily < dailyLimit;
};

// Instance method: get daily limit for plan
userSchema.methods.getDailyLimit = function() {
  const limits = { free: 20, pro: 200, business: 1000 };
  return limits[this.plan] || 20;
};

// Instance method: increment usage
userSchema.methods.incrementUsage = function(tone, platform) {
  this.usage.daily += 1;
  this.usage.total += 1;
  this.stats.repliesGenerated += 1;
  this.stats.lastActive = new Date();

  // Track tone breakdown
  if (tone) {
    const current = this.stats.toneBreakdown?.get(tone) || 0;
    this.stats.toneBreakdown.set(tone, current + 1);
  }

  // Track platform breakdown
  if (platform) {
    const current = this.stats.platformBreakdown?.get(platform) || 0;
    this.stats.platformBreakdown.set(platform, current + 1);
  }
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
