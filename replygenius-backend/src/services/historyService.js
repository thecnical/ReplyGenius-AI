/**
 * ReplyGenius AI - History Service
 * Manages reply history storage and retrieval
 */

const { createLogger } = require('../utils/logger');

const logger = createLogger('HistoryService');

class HistoryService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Save a generated reply to history
   */
  async save(data) {
    const { userId, platform, tone, originalMessages, generatedReply, provider, model } = data;
    
    try {
      const record = await this.db.history.create({
        userId,
        platform,
        tone,
        originalMessages: originalMessages?.slice(-5),
        generatedReply,
        provider,
        model,
        favorite: false,
        createdAt: new Date()
      });

      logger.debug(`History saved for user ${userId}`);
      return record;
    } catch (error) {
      logger.error('Failed to save history:', error.message);
      return null;
    }
  }

  /**
   * Get user's reply history
   */
  async getHistory(userId, options = {}) {
    const { platform, limit = 20, offset = 0, favorite } = options;
    
    try {
      const query = { userId };
      if (platform) query.platform = platform;
      if (favorite !== undefined) query.favorite = favorite;

      const records = await this.db.history.find(query, {
        sort: { createdAt: -1 },
        limit: Math.min(limit, 100),
        skip: offset
      });

      return records;
    } catch (error) {
      logger.error('Failed to get history:', error.message);
      return [];
    }
  }

  /**
   * Mark/unmark a reply as favorite
   */
  async toggleFavorite(historyId, favorite) {
    try {
      const record = await this.db.history.findByIdAndUpdate(historyId, { favorite });
      return record;
    } catch (error) {
      logger.error('Failed to toggle favorite:', error.message);
      return null;
    }
  }

  /**
   * Search history by content
   */
  async search(userId, query) {
    try {
      const records = await this.db.history.find({ userId }, { limit: 50 });
      
      const lowerQuery = query.toLowerCase();
      return records.filter(r => 
        r.generatedReply?.toLowerCase().includes(lowerQuery) ||
        r.originalMessages?.some(m => m.toLowerCase().includes(lowerQuery))
      );
    } catch (error) {
      logger.error('Failed to search history:', error.message);
      return [];
    }
  }

  /**
   * Delete a history record
   */
  async delete(historyId) {
    try {
      if (this.db.history.deleteOne) {
        await this.db.history.deleteOne({ _id: historyId });
      }
      logger.debug(`History deleted: ${historyId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete history:', error.message);
      return false;
    }
  }

  /**
   * Clear all history for a user
   */
  async clearAll(userId) {
    try {
      const records = await this.db.history.find({ userId }, { limit: 1000 });
      for (const record of records) {
        await this.delete(record._id);
      }
      logger.info(`All history cleared for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Failed to clear history:', error.message);
      return false;
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getStats(userId) {
    try {
      const records = await this.db.history.find({ userId }, { limit: 1000 });
      
      const stats = {
        total: records.length,
        byPlatform: {},
        byTone: {},
        byProvider: {},
        favorites: records.filter(r => r.favorite).length
      };

      records.forEach(r => {
        stats.byPlatform[r.platform] = (stats.byPlatform[r.platform] || 0) + 1;
        stats.byTone[r.tone] = (stats.byTone[r.tone] || 0) + 1;
        stats.byProvider[r.provider] = (stats.byProvider[r.provider] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get stats:', error.message);
      return null;
    }
  }
}

module.exports = HistoryService;
