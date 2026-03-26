/**
 * Jest Setup
 */

global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jest-testing-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters!';
process.env.USE_MEMORY_DB = 'true';
