/**
 * ReplyGenius AI - JWT Authentication Service
 * Handles token generation, verification, and refresh
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AuthService');

class AuthService {
  constructor() {
    this.issuedTokens = new Map();
    this.cleanupInterval = setInterval(() => this._cleanup(), 3600000);
  }

  /**
   * Generate JWT token for user
   */
  generateToken(userId, metadata = {}) {
    const payload = {
      userId,
      jti: uuidv4(),
      type: 'access',
      ...metadata
    };

    const token = jwt.sign(payload, config.jwt.secret, {
      algorithm: config.jwt.algorithm,
      expiresIn: config.jwt.expiresIn
    });

    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
    this.issuedTokens.set(payload.jti, {
      userId,
      issuedAt: Date.now(),
      expiresAt,
      metadata
    });

    logger.info(`Token issued for user ${userId}`);
    
    return {
      token,
      expiresIn: config.jwt.expiresIn,
      tokenId: payload.jti
    };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: [config.jwt.algorithm]
      });

      if (!this.issuedTokens.has(decoded.jti)) {
        throw new Error('Token not recognized');
      }

      const tokenData = this.issuedTokens.get(decoded.jti);
      if (tokenData.expiresAt < Date.now()) {
        this.issuedTokens.delete(decoded.jti);
        throw new Error('Token expired');
      }

      return {
        valid: true,
        userId: decoded.userId,
        tokenId: decoded.jti,
        metadata: {
          type: decoded.type,
          iat: decoded.iat,
          exp: decoded.exp
        }
      };
    } catch (error) {
      logger.warn(`Token verification failed: ${error.message}`);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(oldToken) {
    const verification = this.verifyToken(oldToken);
    
    if (!verification.valid) {
      throw new Error(verification.error || 'Invalid token');
    }

    this.issuedTokens.delete(verification.tokenId);
    return this.generateToken(verification.userId);
  }

  /**
   * Revoke a specific token
   */
  revokeToken(tokenId) {
    const result = this.issuedTokens.delete(tokenId);
    if (result) {
      logger.info(`Token revoked: ${tokenId}`);
    }
    return result;
  }

  /**
   * Revoke all tokens for a user
   */
  revokeUserTokens(userId) {
    let count = 0;
    this.issuedTokens.forEach((data, jti) => {
      if (data.userId === userId) {
        this.issuedTokens.delete(jti);
        count++;
      }
    });
    logger.info(`Revoked ${count} tokens for user ${userId}`);
    return count;
  }

  /**
   * Get user from token
   */
  async getUserFromToken(token) {
    const verification = this.verifyToken(token);
    
    if (!verification.valid) {
      return null;
    }

    return {
      id: verification.userId,
      tokenId: verification.tokenId
    };
  }

  /**
   * Cleanup expired tokens
   */
  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    this.issuedTokens.forEach((data, jti) => {
      if (data.expiresAt < now) {
        this.issuedTokens.delete(jti);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired tokens`);
    }
  }

  /**
   * Get token count for debugging
   */
  getStats() {
    return {
      activeTokens: this.issuedTokens.size
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.issuedTokens.clear();
  }
}

module.exports = new AuthService();
