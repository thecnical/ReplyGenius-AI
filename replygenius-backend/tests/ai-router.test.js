/**
 * AI Router Tests
 */

const aiRouter = require('../src/services/ai-router');

describe('AIRouter', () => {
  test('should have providers configured', () => {
    expect(aiRouter.providers).toHaveProperty('openrouter');
    expect(aiRouter.providers).toHaveProperty('bytez');
  });

  test('should have routing strategies', () => {
    expect(aiRouter.strategies).toHaveProperty('fast');
    expect(aiRouter.strategies).toHaveProperty('balanced');
    expect(aiRouter.strategies).toHaveProperty('premium');
  });

  test('should get models', () => {
    const models = aiRouter.getModels();
    expect(models).toBeInstanceOf(Array);
    expect(models.length).toBeGreaterThan(0);
  });

  test('should get health status', () => {
    const health = aiRouter.getHealth();
    expect(health).toHaveProperty('circuitBreakers');
    expect(health).toHaveProperty('analytics');
    expect(health).toHaveProperty('cache');
  });

  test('should get recommended provider', () => {
    const provider = aiRouter.getRecommendedProvider('balanced');
    expect(['openrouter', 'bytez']).toContain(provider);
  });

  test('should generate reply with default parameters', async () => {
    const messages = [
      { role: 'user', content: 'Hello, how are you?' }
    ];

    const result = await aiRouter.route({
      messages,
      tone: 'professional',
      platform: 'linkedin'
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('provider');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('latency');
  });

  test('should use different priorities', async () => {
    const messages = [
      { role: 'user', content: 'Test message' }
    ];

    const fastResult = await aiRouter.route({
      messages,
      priority: 'fast'
    });

    const balancedResult = await aiRouter.route({
      messages,
      priority: 'balanced'
    });

    const premiumResult = await aiRouter.route({
      messages,
      priority: 'premium'
    });

    expect(fastResult).toHaveProperty('success');
    expect(balancedResult).toHaveProperty('success');
    expect(premiumResult).toHaveProperty('success');
  });

  test('should handle errors gracefully', async () => {
    const result = await aiRouter.route({
      messages: [],
      tone: 'professional'
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('error');
  });
});
