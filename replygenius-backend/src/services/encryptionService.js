/**
 * ReplyGenius AI - Encryption Service
 * AES-256 encryption for user API keys and sensitive data
 */

const CryptoJS = require('crypto-js');
const config = require('../config');
const { createLogger } = require('../utils/logger');

const logger = createLogger('EncryptionService');

class EncryptionService {
  constructor() {
    this.key = config.encryption.key;
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(text) {
    if (!text) return null;
    try {
      return CryptoJS.AES.encrypt(text, this.key).toString();
    } catch (error) {
      logger.error('Encryption error:', error.message);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt encrypted data
   */
  decrypt(ciphertext) {
    if (!ciphertext) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, this.key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      logger.error('Decryption error:', error.message);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Create one-way hash
   */
  hash(str) {
    return CryptoJS.SHA256(str).toString();
  }

  /**
   * Encrypt object
   */
  encryptObject(obj) {
    const json = JSON.stringify(obj);
    return this.encrypt(json);
  }

  /**
   * Decrypt object
   */
  decryptObject(ciphertext) {
    const json = this.decrypt(ciphertext);
    return json ? JSON.parse(json) : null;
  }

  /**
   * Validate encrypted data
   */
  validate(ciphertext) {
    try {
      const decrypted = this.decrypt(ciphertext);
      return decrypted && decrypted.length > 0;
    } catch {
      return false;
    }
  }
}

module.exports = new EncryptionService();
