/**
 * ReplyGenius AI - Request Validator Middleware
 * Input validation and sanitization
 */

const { body, validationResult } = require('express-validator');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Validator');

/**
 * Validation rules for generate-reply endpoint
 */
const generateReplyValidation = [
  body('messages')
    .isArray({ min: 1, max: 20 })
    .withMessage('Messages must be an array with 1-20 items'),
  
  body('messages.*.role')
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Message role must be user, assistant, or system'),
  
  body('messages.*.content')
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message content must be 1-2000 characters'),
  
  body('tone')
    .optional()
    .isIn(['professional', 'casual', 'friendly', 'funny', 'flirty', 'formal'])
    .withMessage('Invalid tone'),
  
  body('platform')
    .optional()
    .isIn(['linkedin', 'whatsapp', 'gmail', 'twitter', 'general'])
    .withMessage('Invalid platform'),
  
  body('priority')
    .optional()
    .isIn(['fast', 'balanced', 'premium'])
    .withMessage('Invalid priority'),
  
  body('stream')
    .optional()
    .isBoolean()
    .withMessage('Stream must be boolean')
];

/**
 * Validation rules for auth endpoints
 */
const authValidation = {
  register: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
  ],
  
  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ]
};

/**
 * Validation rules for API key endpoints
 */
const apiKeyValidation = [
  body('provider')
    .isIn(['openrouter', 'bytez'])
    .withMessage('Invalid provider'),
  
  body('apiKey')
    .isString()
    .isLength({ min: 10 })
    .withMessage('API key must be at least 10 characters')
];

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation errors:', errors.array());
    
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  
  next();
};

/**
 * Sanitize input to prevent injection
 */
const sanitize = (req, res, next) => {
  const dangerousFields = ['__proto__', 'constructor', 'prototype'];
  
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    
    dangerousFields.forEach(field => delete obj[field]);
    
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      } else if (typeof obj[key] === 'string') {
        obj[key] = obj[key].replace(/<script/i, '');
      }
    }
  };
  
  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);
  
  next();
};

module.exports = {
  generateReplyValidation,
  authValidation,
  apiKeyValidation,
  validate,
  sanitize
};
