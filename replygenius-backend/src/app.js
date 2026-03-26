/**
 * ReplyGenius AI - Express Application Entry Point
 * Production-ready backend server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { logger, createLogger } = require('./utils/logger');
const { connectDB } = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const { router: apiRoutes, initRoutes: initApiRoutes } = require('./routes/api');
const authRoutes = require('./routes/auth');

const app = express();
const log = createLogger('App');

// ===========================================
// Security Middleware
// ===========================================

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: config.server.allowedOrigins === true ? '*' : config.server.allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===========================================
// Body Parsing
// ===========================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===========================================
// Request Logging
// ===========================================

app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel](`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  
  next();
});

// ===========================================
// Health Check
// ===========================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    uptime: process.uptime(),
    environment: config.server.nodeEnv
  });
});

// ===========================================
// API Routes with Rate Limiting
// ===========================================

app.use('/api', apiLimiter);
app.use('/api', apiRoutes);
app.use('/auth', authRoutes);

// ===========================================
// Error Handling
// ===========================================

app.use(notFoundHandler);
app.use(errorHandler);

// ===========================================
// Graceful Shutdown
// ===========================================

const shutdown = async (signal) => {
  log.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    const circuitBreakerManager = require('./services/circuitBreakerManager');
    const cacheService = require('./services/cacheService');
    const analyticsEngine = require('./services/analyticsEngine');
    const streamingHandler = require('./services/streamingHandler');
    const authService = require('./services/authService');
    
    circuitBreakerManager.destroy();
    await cacheService.destroy();
    analyticsEngine.destroy();
    streamingHandler.destroy();
    authService.destroy();
    
    log.info('All services cleaned up');
    process.exit(0);
  } catch (error) {
    log.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ===========================================
// Start Server
// ===========================================

const startServer = async () => {
  try {
    const db = await connectDB();
    initApiRoutes(db);
    
    log.info('Database connected and routes initialized');
    
    app.listen(config.server.port, () => {
      logger.info(`🚀 ReplyGenius AI API server running on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      const origins = Array.isArray(config.server.allowedOrigins) 
        ? config.server.allowedOrigins.join(', ') 
        : (config.server.allowedOrigins === true ? '*' : config.server.allowedOrigins);
      logger.info(`Allowed origins: ${origins}`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

module.exports = { app, startServer };

if (require.main === module) {
  startServer();
}
