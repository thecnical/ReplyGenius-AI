/**
 * ReplyGenius AI V2 - Memory Service
 * Learns from user's writing patterns and adapts AI responses over time
 */

const UserMemory = require('../models/UserMemory');
const { createLogger } = require('../utils/logger');

const logger = createLogger('MemoryService');

class MemoryService {
  /**
   * Record a reply interaction for learning
   */
  async recordReply(userId, { originalContext, generatedReply, editedVersion, platform, tone, accepted }) {
    try {
      const memory = await UserMemory.getOrCreate(userId);

      memory.replyHistory.push({
        originalContext: originalContext?.substring(0, 500),
        generatedReply: generatedReply?.substring(0, 1000),
        userEdited: !!editedVersion,
        editedVersion: editedVersion?.substring(0, 1000),
        platform,
        tone,
        accepted: accepted !== false,
        timestamp: new Date()
      });

      memory.totalInteractions += 1;
      memory.lastLearned = new Date();

      if (memory.totalInteractions % 10 === 0) {
        this._updatePatterns(memory);
      }

      if (platform && tone) {
        memory.preferredTones[platform] = tone;
      }

      await memory.save();
      logger.info(`Recorded reply for user ${userId}, total: ${memory.totalInteractions}`);
      return memory;
    } catch (error) {
      logger.error(`Failed to record reply: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user's learned writing style as a prompt segment
   */
  async getStylePrompt(userId) {
    try {
      const memory = await UserMemory.findOne({ userId });
      if (!memory || memory.totalInteractions < 5) {
        return null;
      }

      const parts = [];

      if (memory.writingPatterns.averageLength > 0) {
        let lengthHint;
        if (memory.writingPatterns.averageLength < 100) {
          lengthHint = 'brief and concise';
        } else if (memory.writingPatterns.averageLength < 250) {
          lengthHint = 'moderate length';
        } else {
          lengthHint = 'detailed and thorough';
        }
        parts.push(`The user prefers ${lengthHint} replies.`);
      }

      if (memory.writingPatterns.usesEmojis) {
        parts.push('The user appreciates emojis in messages.');
      }

      if (memory.writingPatterns.formalityLevel > 7) {
        parts.push('The user prefers very formal language.');
      } else if (memory.writingPatterns.formalityLevel < 4) {
        parts.push('The user prefers casual, relaxed language.');
      }

      if (memory.writingPatterns.commonPhrases?.length > 0) {
        const phrases = memory.writingPatterns.commonPhrases.slice(0, 5).join('", "');
        parts.push(`The user commonly uses phrases like: "${phrases}".`);
      }

      if (memory.vocabularyProfile.languageStyle) {
        parts.push(`The user's language style is ${memory.vocabularyProfile.languageStyle}.`);
      }

      if (memory.vocabularyProfile.industryTerms?.length > 0) {
        const terms = memory.vocabularyProfile.industryTerms.slice(0, 5).join(', ');
        parts.push(`The user works in an industry that uses terms like: ${terms}.`);
      }

      if (parts.length === 0) return null;

      return `\n\n[User Style Preferences - adapt your response accordingly]\n${parts.join('\n')}`;
    } catch (error) {
      logger.error(`Failed to get style prompt: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user's preferred tone for a platform
   */
  async getPreferredTone(userId, platform) {
    try {
      const memory = await UserMemory.findOne({ userId });
      if (!memory) return null;
      return memory.preferredTones[platform] || null;
    } catch (error) {
      logger.warn(`Failed to get preferred tone: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user's memory stats
   */
  async getStats(userId) {
    try {
      const memory = await UserMemory.findOne({ userId });
      if (!memory) return { exists: false };

      return {
        exists: true,
        totalInteractions: memory.totalInteractions,
        adaptationScore: memory.adaptationScore,
        lastLearned: memory.lastLearned,
        writingPatterns: memory.writingPatterns,
        preferredTones: memory.preferredTones
      };
    } catch (error) {
      logger.warn(`Failed to get memory stats: ${error.message}`);
      return { exists: false };
    }
  }

  /**
   * Update writing patterns based on reply history
   * @private
   */
  _updatePatterns(memory) {
    const recentReplies = memory.replyHistory.slice(-50);
    if (recentReplies.length === 0) return;

    const lengths = recentReplies
      .filter(r => r.accepted)
      .map(r => (r.editedVersion || r.generatedReply || '').length);

    if (lengths.length > 0) {
      memory.writingPatterns.averageLength = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
    }

    const emojiPattern = /[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const emojiCount = recentReplies.filter(r => {
      const text = r.editedVersion || r.generatedReply || '';
      return emojiPattern.test(text);
    }).length;
    memory.writingPatterns.usesEmojis = emojiCount > recentReplies.length * 0.3;

    const acceptedCount = recentReplies.filter(r => r.accepted && !r.userEdited).length;
    memory.adaptationScore = Math.round((acceptedCount / recentReplies.length) * 100);

    logger.info(`Updated patterns for user, adaptation score: ${memory.adaptationScore}%`);
  }

  /**
   * Reset user's memory
   */
  async resetMemory(userId) {
    try {
      await UserMemory.deleteOne({ userId });
      logger.info(`Reset memory for user ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to reset memory: ${error.message}`);
      return false;
    }
  }
}

module.exports = new MemoryService();
