/**
 * ReplyGenius AI - Error Handler Middleware
 * Unified error handling across the application
 */

const { createLogger } = require('../utils/logger');

const logger = createLogger('ErrorHandler');

// Error type classification
const ErrorTypes = {
  TIMEOUT: { code: 'TIMEOUT', status: 504, retry: true, backoff: false },
  RATE_LIMIT: { code: 'RATE_LIMIT', status: 429, retry: true, backoff: true },
  AUTH_ERROR: { code: 'AUTH_ERROR', status: 401, retry: false, backoff: false },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400, retry: false, backoff: false },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404, retry: false, backoff: false },
  SERVER_ERROR: { code: 'SERVER_ERROR', status: 500, retry: true, backoff: false },
  NETWORK_ERROR: { code: 'NETWORK_ERROR', status: 502, retry: true, backoff: true },
  PROVIDER_ERROR: { code: 'PROVIDER_ERROR', status: 502, retry: true, backoff: true },
  CIRCUIT_OPEN: { code: 'CIRCUIT_OPEN', status: 503, retry: true, backoff: false },
  UNKNOWN_ERROR: { code: 'UNKNOWN_ERROR', status: 500, retry: true, backoff: false }
};

/**
 * Custom error class with type classification
 */
class AppError extends Error {
  constructor(message, type = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.errorType = ErrorTypes[type] || ErrorTypes.UNKNOWN_ERROR;
  }
}

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  const errorLog = {
    message: err.message,
    type: err.type || 'UNKNOWN',
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  if (err.stack) {
    errorLog.stack = err.stack;
  }

  if (err.type === 'validation' || err.name === 'ValidationError') {
    logger.warn(`Validation error: ${err.message}`, errorLog);
  } else {
    // Log all non-validation errors as errors to see them in production
    logger.error(`[INTERNAL_ERROR] ${err.message}`, errorLog);
    if (err.stack) logger.debug(`Stack Trace: ${err.stack}`);
  }

  const errorInfo = err.errorType || ErrorTypes.UNKNOWN_ERROR;
  
  const message = process.env.NODE_ENV === 'production' 
    ? 'An error occurred while processing your request' 
    : err.message;

  const response = {
    success: false,
    error: errorInfo.code,
    message,
    timestamp: Date.now()
  };

  if (errorInfo.retry) {
    response.retryable = true;
    if (err.retryAfter) {
      response.retryAfter = err.retryAfter;
    }
  }

  res.status(errorInfo.status).json(response);
};

/**
 * Async handler wrapper
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: Date.now()
  });
};

/**
 * Classify error based on message
 */
const classifyError = (error) => {
  const message = error.message.toLowerCase();
  
  if (message.includes('timeout') || message.includes('etimedout') || message.includes('esockettimeout')) {
    return 'TIMEOUT';
  }
  if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
    return 'RATE_LIMIT';
  }
  if (message.includes('unauthorized') || message.includes('401') || message.includes('forbidden') || message.includes('403')) {
    return 'AUTH_ERROR';
  }
  if (message.includes('validation') || message.includes('400') || message.includes('invalid')) {
    return 'VALIDATION_ERROR';
  }
  if (message.includes('not found') || message.includes('404')) {
    return 'NOT_FOUND';
  }
  if (message.includes('500') || message.includes('internal server')) {
    return 'SERVER_ERROR';
  }
  if (message.includes('network') || message.includes('econnrefused') || message.includes('ECONNREFUSED')) {
    return 'NETWORK_ERROR';
  }
  if (message.includes('circuit') || message.includes('unavailable')) {
    return 'CIRCUIT_OPEN';
  }
  
  return 'UNKNOWN_ERROR';
};

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  classifyError,
  ErrorTypes
};
