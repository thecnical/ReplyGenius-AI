/**
 * ReplyGenius AI V2 - User Memory Model
 * MongoDB schema for AI memory system - stores user writing patterns and preferences
 */

const mongoose = require('mongoose');

const userMemorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  writingPatterns: {
    averageLength: { type: Number, default: 0 },
    usesEmojis: { type: Boolean, default: false },
    formalityLevel: { type: Number, default: 5, min: 1, max: 10 }, // 1=very informal, 10=very formal
    usesGreetings: { type: Boolean, default: true },
    usesClosings: { type: Boolean, default: true },
    commonPhrases: [{ type: String }],
    sentenceComplexity: { type: String, enum: ['simple', 'moderate', 'complex'], default: 'moderate' }
  },
  preferredTones: {
    linkedin: { type: String, default: 'professional' },
    whatsapp: { type: String, default: 'casual' },
    gmail: { type: String, default: 'professional' },
    twitter: { type: String, default: 'casual' },
    instagram: { type: String, default: 'casual' },
    telegram: { type: String, default: 'casual' },
    general: { type: String, default: 'professional' }
  },
  vocabularyProfile: {
    industryTerms: [{ type: String }],
    avoidedWords: [{ type: String }],
    signatureExpressions: [{ type: String }],
    languageStyle: { type: String, enum: ['concise', 'descriptive', 'technical', 'conversational'], default: 'concise' }
  },
  replyHistory: [{
    originalContext: { type: String, maxlength: 500 },
    generatedReply: { type: String, maxlength: 1000 },
    userEdited: { type: Boolean, default: false },
    editedVersion: { type: String, maxlength: 1000 },
    platform: { type: String },
    tone: { type: String },
    accepted: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now }
  }],
  adaptationScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  totalInteractions: {
    type: Number,
    default: 0
  },
  lastLearned: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Keep only last 100 reply history entries
userMemorySchema.pre('save', function(next) {
  if (this.replyHistory && this.replyHistory.length > 100) {
    this.replyHistory = this.replyHistory.slice(-100);
  }
  next();
});

// Static method to get or create memory for user
userMemorySchema.statics.getOrCreate = async function(userId) {
  let memory = await this.findOne({ userId });
  if (!memory) {
    memory = await this.create({ userId });
  }
  return memory;
};

module.exports = mongoose.model('UserMemory', userMemorySchema);
