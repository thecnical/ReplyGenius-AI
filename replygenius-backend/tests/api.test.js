/**
 * API Endpoint Tests
 */

const request = require('supertest');
const { app } = require('../src/app');

describe('API Endpoints', () => {
  describe('GET /health', () => {
    test('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('GET /api/models', () => {
    test('should return available models', async () => {
      const response = await request(app).get('/api/models');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.models).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/health', () => {
    test('should return system health', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.health).toHaveProperty('circuitBreakers');
    });
  });

  describe('POST /api/generate-reply', () => {
    test('should reject invalid request', async () => {
      const response = await request(app)
        .post('/api/generate-reply')
        .send({ messages: [] });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should accept valid request without auth', async () => {
      const response = await request(app)
        .post('/api/generate-reply')
        .send({
          messages: [
            { role: 'user', content: 'Hello, how are you?' }
          ],
          tone: 'professional',
          platform: 'linkedin'
        });
      
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('POST /auth/login', () => {
    test('should accept login request', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
    });
  });
});
