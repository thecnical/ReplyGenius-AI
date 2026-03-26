/**
 * AI Provider Tests
 */

const openRouterProvider = require('../src/providers/openrouter');
const bytezProvider = require('../src/providers/bytez');

describe('Providers', () => {
  describe('OpenRouter Provider', () => {
    test('should have correct configuration', () => {
      expect(openRouterProvider.name).toBe('OpenRouter');
      expect(openRouterProvider.baseUrl).toContain('openrouter.ai');
    });

    test('should have models configured', () => {
      expect(openRouterProvider.models).toHaveProperty('fast');
      expect(openRouterProvider.models).toHaveProperty('balanced');
      expect(openRouterProvider.models).toHaveProperty('premium');
    });

    test('should have timeout configured', () => {
      expect(openRouterProvider.timeout).toBeGreaterThan(0);
    });
  });

  describe('Bytez Provider', () => {
    test('should have correct configuration', () => {
      expect(bytezProvider.name).toBe('Bytez AI');
      expect(bytezProvider.baseUrl).toContain('bytez.com');
    });

    test('should have models configured', () => {
      expect(bytezProvider.models).toHaveProperty('fast');
      expect(bytezProvider.models).toHaveProperty('balanced');
    });
  });
});
