/**
 * ReplyGenius AI V2 - Template Model
 * MongoDB schema for professional message templates
 */

const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  category: {
    type: String,
    required: true,
    enum: ['job_reply', 'freelance', 'cold_outreach', 'follow_up', 'thank_you', 'introduction', 'networking', 'custom'],
    index: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  platform: {
    type: String,
    enum: ['linkedin', 'whatsapp', 'gmail', 'twitter', 'instagram', 'telegram', 'general'],
    default: 'general'
  },
  tone: {
    type: String,
    enum: ['professional', 'casual', 'friendly', 'funny', 'flirty', 'formal'],
    default: 'professional'
  },
  tags: [{
    type: String,
    trim: true
  }],
  isBuiltin: {
    type: Boolean,
    default: false,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
templateSchema.index({ category: 1, isBuiltin: 1 });
templateSchema.index({ userId: 1, category: 1 });

// Static method to get builtin templates
templateSchema.statics.getBuiltins = function() {
  return this.find({ isBuiltin: true }).sort({ category: 1, name: 1 });
};

// Static method to get user templates
templateSchema.statics.getForUser = function(userId) {
  return this.find({
    $or: [
      { isBuiltin: true },
      { userId: userId }
    ]
  }).sort({ category: 1, usageCount: -1 });
};

// Static method to seed builtin templates
templateSchema.statics.seedBuiltins = async function() {
  const count = await this.countDocuments({ isBuiltin: true });
  if (count > 0) return; // Already seeded

  const builtins = [
    // Job Reply Templates
    {
      name: 'Job Application Follow-Up',
      category: 'job_reply',
      content: 'Thank you for considering my application for the [Position] role. I\'m very excited about this opportunity and believe my experience in [Skill/Area] aligns well with what you\'re looking for. I\'d love to discuss how I can contribute to your team. Would you be available for a brief conversation this week?',
      platform: 'linkedin',
      tone: 'professional',
      tags: ['job', 'follow-up', 'application'],
      isBuiltin: true
    },
    {
      name: 'Interview Thank You',
      category: 'job_reply',
      content: 'Thank you so much for taking the time to interview me today. I really enjoyed learning more about the [Position] role and your team. Our conversation about [Topic] particularly resonated with me. I\'m even more enthusiastic about the opportunity and look forward to the next steps.',
      platform: 'gmail',
      tone: 'professional',
      tags: ['interview', 'thank-you'],
      isBuiltin: true
    },
    {
      name: 'Salary Negotiation',
      category: 'job_reply',
      content: 'Thank you for the offer — I\'m thrilled about the opportunity to join [Company]. After careful consideration, given my experience and the market rate for this role, I was hoping we could discuss a base salary of [Amount]. I\'m confident I can deliver exceptional value and am very committed to making this work.',
      platform: 'gmail',
      tone: 'professional',
      tags: ['salary', 'negotiation', 'offer'],
      isBuiltin: true
    },
    // Freelance Templates
    {
      name: 'Project Proposal',
      category: 'freelance',
      content: 'Hi [Name], I reviewed your project requirements and I\'d love to help. I have [X years] of experience in [Skill], and I believe I can deliver exactly what you need. Here\'s my proposed approach:\n\n1. [Phase 1]\n2. [Phase 2]\n3. [Phase 3]\n\nTimeline: [Duration]\nBudget: [Amount]\n\nWould you like to discuss this further?',
      platform: 'general',
      tone: 'professional',
      tags: ['freelance', 'proposal', 'client'],
      isBuiltin: true
    },
    {
      name: 'Client Follow-Up',
      category: 'freelance',
      content: 'Hi [Name], just checking in on [Project Name]. I wanted to share a quick update — I\'ve completed [Milestone] and things are progressing well. The next phase involves [Next Steps]. Let me know if you have any feedback or adjustments. Looking forward to delivering a great result!',
      platform: 'general',
      tone: 'friendly',
      tags: ['freelance', 'follow-up', 'update'],
      isBuiltin: true
    },
    // Cold Outreach Templates
    {
      name: 'LinkedIn Connection Request',
      category: 'cold_outreach',
      content: 'Hi [Name], I came across your profile and was impressed by your work in [Industry/Area]. I\'m currently working on [Brief Description] and think there could be great synergy between us. Would love to connect and explore potential collaboration opportunities!',
      platform: 'linkedin',
      tone: 'professional',
      tags: ['cold-outreach', 'networking', 'connection'],
      isBuiltin: true
    },
    {
      name: 'Sales Outreach Email',
      category: 'cold_outreach',
      content: 'Hi [Name],\n\nI noticed [Company] is [Observation about their business]. We\'ve helped similar companies achieve [Specific Result] using our [Solution].\n\nWould you be open to a 15-minute call this week to explore if this could benefit your team?\n\nBest,\n[Your Name]',
      platform: 'gmail',
      tone: 'professional',
      tags: ['sales', 'outreach', 'cold-email'],
      isBuiltin: true
    },
    // Follow-Up Templates
    {
      name: 'Meeting Follow-Up',
      category: 'follow_up',
      content: 'Hi [Name], thanks for the great conversation today! Here\'s a quick recap of what we discussed:\n\n• [Key Point 1]\n• [Key Point 2]\n• [Action Item]\n\nI\'ll get started on [Next Step] and will send an update by [Date]. Let me know if I missed anything!',
      platform: 'gmail',
      tone: 'professional',
      tags: ['follow-up', 'meeting', 'recap'],
      isBuiltin: true
    },
    {
      name: 'Gentle Nudge',
      category: 'follow_up',
      content: 'Hi [Name], hope you\'re having a great week! Just wanted to circle back on my previous message about [Topic]. I understand things get busy — whenever you have a moment, I\'d love to hear your thoughts. No rush at all!',
      platform: 'general',
      tone: 'friendly',
      tags: ['follow-up', 'reminder', 'gentle'],
      isBuiltin: true
    },
    // Thank You Templates
    {
      name: 'Thank You for Help',
      category: 'thank_you',
      content: 'Hi [Name], I just wanted to take a moment to sincerely thank you for [Specific Help]. Your support made a real difference, and I truly appreciate you taking the time. If there\'s ever anything I can do to return the favor, please don\'t hesitate to ask!',
      platform: 'general',
      tone: 'friendly',
      tags: ['thank-you', 'gratitude'],
      isBuiltin: true
    },
    // Introduction Templates
    {
      name: 'Professional Self-Introduction',
      category: 'introduction',
      content: 'Hi [Name], great to connect! I\'m [Your Name], a [Your Role] specializing in [Area]. I\'ve been working in [Industry] for [X years] and I\'m passionate about [Topic]. I\'d love to learn more about your work at [Company] and explore any potential ways we could collaborate.',
      platform: 'linkedin',
      tone: 'professional',
      tags: ['introduction', 'networking'],
      isBuiltin: true
    },
    // Networking Templates
    {
      name: 'Event Follow-Up',
      category: 'networking',
      content: 'Hi [Name], it was wonderful meeting you at [Event]! I really enjoyed our conversation about [Topic]. As mentioned, I\'d love to continue the discussion over coffee or a virtual call. Would [Day/Time] work for you?',
      platform: 'linkedin',
      tone: 'friendly',
      tags: ['networking', 'event', 'follow-up'],
      isBuiltin: true
    }
  ];

  await this.insertMany(builtins);
  console.log(`Seeded ${builtins.length} builtin templates`);
};

module.exports = mongoose.model('Template', templateSchema);
