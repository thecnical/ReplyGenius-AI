/**
 * ReplyGenius AI - Database Configuration
 * Routes to the main database connection manager
 */

const { connectDB, disconnectDB, checkDBHealth } = require('../database/connection');

module.exports = {
  connectDB,
  disconnectDB,
  checkDBHealth
};
