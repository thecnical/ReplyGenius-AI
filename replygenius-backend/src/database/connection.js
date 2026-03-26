/**
 * ReplyGenius AI - Database Connection Manager
 * Handles MongoDB connection with connection pooling and event handling
 */

const mongoose = require('mongoose');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Database');

// Connection options
const connectionOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
  bufferCommands: false
};

// Event handlers for MongoDB connection
const setupConnectionHandlers = (connection) => {
  connection.on('connected', () => {
    logger.info('MongoDB connected successfully');
  });

  connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err.message);
  });

  connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  connection.on('close', () => {
    logger.info('MongoDB connection closed');
  });
};

// In-memory store fallback for development
class MemoryStore {
  constructor() {
    this.data = new Map();
    this.collections = {
      users: new Map(),
      history: new Map(),
      analyticsLogs: new Map()
    };
    logger.info('In-memory store initialized');
  }

  // User operations
  user = {
    async create(data) {
      const id = new mongoose.Types.ObjectId().toString();
      const user = { _id: id, ...data, createdAt: new Date(), updatedAt: new Date() };
      this.collections.users.set(id, user);
      return user;
    },
    async findById(id) {
      return this.collections.users.get(id) || null;
    },
    async findOne(query) {
      for (const user of this.collections.users.values()) {
        let match = true;
        for (const [key, value] of Object.entries(query)) {
          if (user[key] !== value) { match = false; break; }
        }
        if (match) return user;
      }
      return null;
    },
    async findByIdAndUpdate(id, data) {
      const user = this.collections.users.get(id);
      if (user) {
        const updated = { ...user, ...data, updatedAt: new Date() };
        this.collections.users.set(id, updated);
        return updated;
      }
      return null;
    },
    async find(query, options = {}) {
      let results = Array.from(this.collections.users.values());
      for (const [key, value] of Object.entries(query)) {
        results = results.filter(r => r[key] === value);
      }
      if (options.sort) {
        const sortKey = Object.keys(options.sort)[0];
        const sortOrder = options.sort[sortKey];
        results.sort((a, b) => sortOrder === -1 ? 
          (b[sortKey] > a[sortKey] ? 1 : -1) : 
          (a[sortKey] > b[sortKey] ? 1 : -1));
      }
      if (options.limit) results = results.slice(0, options.limit);
      return results;
    },
    async countDocuments(query) {
      let results = Array.from(this.collections.users.values());
      for (const [key, value] of Object.entries(query)) {
        results = results.filter(r => r[key] === value);
      }
      return results.length;
    },
    async findOneAndUpdate(query, data, options = {}) {
      const user = await this.findOne(query);
      if (user) {
        return this.findByIdAndUpdate(user._id, data);
      }
      return null;
    }
  };

  // History operations
  history = {
    async create(data) {
      const id = new mongoose.Types.ObjectId().toString();
      const record = { _id: id, ...data, createdAt: new Date(), updatedAt: new Date() };
      this.collections.history.set(id, record);
      return record;
    },
    async find(query, options = {}) {
      let results = Array.from(this.collections.history.values());
      for (const [key, value] of Object.entries(query)) {
        results = results.filter(r => r[key] === value);
      }
      if (options.sort) {
        const sortKey = Object.keys(options.sort)[0];
        const sortOrder = options.sort[sortKey];
        results.sort((a, b) => sortOrder === -1 ? 
          (b[sortKey] > a[sortKey] ? 1 : -1) : 
          (a[sortKey] > b[sortKey] ? 1 : -1));
      }
      if (options.skip) results = results.slice(options.skip);
      if (options.limit) results = results.slice(0, options.limit);
      return results;
    },
    async findById(id) {
      return this.collections.history.get(id) || null;
    },
    async findByIdAndUpdate(id, data) {
      const record = this.collections.history.get(id);
      if (record) {
        const updated = { ...record, ...data, updatedAt: new Date() };
        this.collections.history.set(id, updated);
        return updated;
      }
      return null;
    },
    async deleteOne(query) {
      for (const [id, record] of this.collections.history.entries()) {
        let match = true;
        for (const [key, value] of Object.entries(query)) {
          if (record[key] !== value) { match = false; break; }
        }
        if (match) {
          this.collections.history.delete(id);
          return { deletedCount: 1 };
        }
      }
      return { deletedCount: 0 };
    },
    async countDocuments(query) {
      let results = Array.from(this.collections.history.values());
      for (const [key, value] of Object.entries(query)) {
        results = results.filter(r => r[key] === value);
      }
      return results.length;
    },
    async aggregate(pipeline) {
      // Simple aggregation for memory store
      let results = Array.from(this.collections.history.values());
      
      for (const stage of pipeline) {
        if (stage.$match) {
          const match = stage.$match;
          for (const [key, value] of Object.entries(match)) {
            if (key === 'userId') {
              results = results.filter(r => r.userId?.toString() === value.toString());
            } else if (key === 'event') {
              results = results.filter(r => r.event === value);
            } else if (key === 'timestamp') {
              if (value.$gte) {
                results = results.filter(r => new Date(r.createdAt) >= new Date(value.$gte));
              }
              if (value.$lte) {
                results = results.filter(r => new Date(r.createdAt) <= new Date(value.$lte));
              }
            }
          }
        }
        
        if (stage.$group) {
          const groupId = stage.$group._id;
          const groups = {};
          
          results.forEach(r => {
            let key;
            if (typeof groupId === 'object') {
              key = Object.values(groupId).map(k => r[k] || 'unknown').join('_');
            } else {
              key = r[groupId] || 'unknown';
            }
            
            if (!groups[key]) {
              groups[key] = { _id: typeof groupId === 'object' ? 
                Object.fromEntries(Object.keys(groupId).map(k => [k, r[k]])) : key };
            }
            
            if (stage.$group.count) {
              groups[key].count = (groups[key].count || 0) + 1;
            }
            if (stage.$group.totalRequests) {
              groups[key].totalRequests = (groups[key].totalRequests || 0) + 1;
            }
          });
          
          results = Object.values(groups);
        }
        
        if (stage.$sort) {
          const sortKey = Object.keys(stage.$sort)[0];
          const sortOrder = stage.$sort[sortKey];
          results.sort((a, b) => {
            const aVal = a[sortKey] || 0;
            const bVal = b[sortKey] || 0;
            return sortOrder === -1 ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
          });
        }
        
        if (stage.$limit) {
          results = results.slice(0, stage.$limit);
        }
      }
      
      return results;
    }
  };

  // Analytics operations
  analyticsLogs = {
    async create(data) {
      const id = new mongoose.Types.ObjectId().toString();
      const record = { _id: id, ...data, timestamp: new Date(), createdAt: new Date() };
      this.collections.analyticsLogs.set(id, record);
      // Limit stored records
      if (this.collections.analyticsLogs.size > 10000) {
        const firstKey = this.collections.analyticsLogs.keys().next().value;
        this.collections.analyticsLogs.delete(firstKey);
      }
      return record;
    },
    async find(query, options = {}) {
      let results = Array.from(this.collections.analyticsLogs.values());
      for (const [key, value] of Object.entries(query)) {
        if (key === 'userId') {
          results = results.filter(r => r.userId?.toString() === value.toString());
        } else {
          results = results.filter(r => r[key] === value);
        }
      }
      if (options.sort) {
        const sortKey = Object.keys(options.sort)[0];
        const sortOrder = options.sort[sortKey];
        results.sort((a, b) => sortOrder === -1 ? 
          (b[sortKey] > a[sortKey] ? 1 : -1) : 
          (a[sortKey] > b[sortKey] ? 1 : -1));
      }
      if (options.limit) results = results.slice(0, options.limit);
      return results;
    },
    async aggregate(pipeline) {
      // Similar to history aggregate
      let results = Array.from(this.collections.analyticsLogs.values());
      
      for (const stage of pipeline) {
        if (stage.$match) {
          const match = stage.$match;
          for (const [key, value] of Object.entries(match)) {
            if (key === 'event') {
              results = results.filter(r => r.event === value);
            } else if (key === 'timestamp') {
              if (value.$gte) {
                results = results.filter(r => new Date(r.timestamp) >= new Date(value.$gte));
              }
              if (value.$lte) {
                results = results.filter(r => new Date(r.timestamp) <= new Date(value.$lte));
              }
            }
          }
        }
        
        if (stage.$group) {
          const groupId = stage.$group._id;
          const groups = {};
          
          results.forEach(r => {
            let key;
            if (typeof groupId === 'object') {
              key = Object.values(groupId).map(k => r[k] || 'unknown').join('_');
            } else {
              key = r[groupId] || 'unknown';
            }
            
            if (!groups[key]) {
              groups[key] = { _id: typeof groupId === 'object' ? 
                Object.fromEntries(Object.keys(groupId).map(k => [k, r[k]])) : key };
            }
            
            if (stage.$group.count) {
              groups[key].count = (groups[key].count || 0) + 1;
            }
          });
          
          results = Object.values(groups);
        }
      }
      
      return results;
    }
  };

  async disconnect() {
    this.collections.users.clear();
    this.collections.history.clear();
    this.collections.analyticsLogs.clear();
    logger.info('In-memory store cleared');
  }
}

// Main connection function
const connectDB = async () => {
  // Check if should use memory store
  const useMemory = !process.env.MONGODB_URI || 
                   process.env.USE_MEMORY_DB === 'true' ||
                   config.server.nodeEnv === 'test';

  if (useMemory) {
    logger.info('Using in-memory database (development/test mode)');
    const memoryStore = new MemoryStore();
    
    // Make it compatible with Mongoose models
    return {
      User: memoryStore.user,
      History: memoryStore.history,
      AnalyticsLog: memoryStore.analyticsLogs,
      mongoose: {
        connect: async () => memoryStore,
        disconnect: async () => await memoryStore.disconnect(),
        connection: { readyState: 1 }
      },
      isMemory: true
    };
  }

  // MongoDB connection
  try {
    const uri = process.env.MONGODB_URI;
    
    logger.info('Connecting to MongoDB...');
    
    const connection = await mongoose.connect(uri, connectionOptions);
    
    setupConnectionHandlers(connection);
    
    logger.info(`MongoDB connected to: ${uri.split('@')[1] || 'local'}`);
    
    // Return object with models and connection
    return {
      User: require('../models/User'),
      History: require('../models/History'),
      AnalyticsLog: require('../models/AnalyticsLog'),
      mongoose: mongoose,
      isMemory: false
    };
    
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    if (error.stack) logger.debug(`Connection Error Stack: ${error.stack}`);
    logger.warn('Falling back to in-memory store');
    
    const memoryStore = new MemoryStore();
    return {
      User: memoryStore.user,
      History: memoryStore.history,
      AnalyticsLog: memoryStore.analyticsLogs,
      mongoose: {
        connect: async () => memoryStore,
        disconnect: async () => await memoryStore.disconnect(),
        connection: { readyState: 0 }
      },
      isMemory: true
    };
  }
};

// Disconnect function
const disconnectDB = async (db) => {
  if (db && db.mongoose) {
    try {
      await db.mongoose.disconnect();
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting database:', error.message);
    }
  }
};

// Health check
const checkDBHealth = async (db) => {
  if (!db) return { status: 'unknown', error: 'No database connection' };
  
  if (db.isMemory) {
    return { 
      status: 'healthy', 
      type: 'memory',
      users: db.User ? (await db.User.find({})).length : 0,
      history: db.History ? (await db.History.find({})).length : 0
    };
  }
  
  try {
    const state = db.mongoose.connection.readyState;
    return {
      status: state === 1 ? 'healthy' : 'unhealthy',
      type: 'mongodb',
      state: state === 0 ? 'disconnected' : 
            state === 1 ? 'connected' : 
            state === 2 ? 'connecting' : 'disconnecting'
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  checkDBHealth,
  MemoryStore
};
