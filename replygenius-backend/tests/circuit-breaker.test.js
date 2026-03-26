/**
 * Circuit Breaker Tests
 */

const { CircuitBreaker, STATES } = require('../src/services/circuitBreaker');

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-provider', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      halfOpenRetries: 2
    });
  });

  afterEach(() => {
    breaker.destroy();
  });

  test('should start in CLOSED state', () => {
    expect(breaker.getState().state).toBe(STATES.CLOSED);
  });

  test('should execute function in CLOSED state', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await breaker.execute(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should open after threshold failures', async () => {
    const failFn = jest.fn().mockRejectedValue(new Error('Fail'));
    
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failFn);
      } catch (e) {
        // Expected
      }
    }

    expect(breaker.getState().state).toBe(STATES.OPEN);
  });

  test('should reject requests when OPEN', async () => {
    const failFn = jest.fn().mockRejectedValue(new Error('Fail'));
    
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failFn);
      } catch (e) {
        // Expected
      }
    }

    const fn = jest.fn().mockResolvedValue('success');
    
    await expect(breaker.execute(fn)).rejects.toThrow('CIRCUIT_OPEN');
  });

  test('should transition to HALF_OPEN after timeout', async () => {
    const failFn = jest.fn().mockRejectedValue(new Error('Fail'));
    
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failFn);
      } catch (e) {
        // Expected
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1100));

    const fn = jest.fn().mockResolvedValue('success');
    const result = await breaker.execute(fn);
    
    expect(result).toBe('success');
    expect(breaker.getState().state).toBe(STATES.HALF_OPEN);
  });

  test('should close after success threshold in HALF_OPEN', async () => {
    breaker.transitionToHalfOpen();

    const successFn = jest.fn().mockResolvedValue('success');
    await breaker.execute(successFn);
    await breaker.execute(successFn);

    expect(breaker.getState().state).toBe(STATES.CLOSED);
  });

  test('should reopen after failures in HALF_OPEN', async () => {
    breaker.transitionToHalfOpen();

    const failFn = jest.fn().mockRejectedValue(new Error('Fail'));
    await expect(breaker.execute(failFn)).rejects.toThrow();
    await expect(breaker.execute(failFn)).rejects.toThrow();

    expect(breaker.getState().state).toBe(STATES.OPEN);
  });
});
