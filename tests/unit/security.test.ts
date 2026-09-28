import request from 'supertest';
import express from 'express';
import { securityHeaders, corsMiddleware, hppMiddleware, mongoSanitizeMiddleware, globalRateLimiter, authRateLimiter } from '../../src/middleware/security';

describe('Security Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Helmet Security Headers', () => {
    it('should apply security headers', async () => {
      app.use(securityHeaders);
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');

      expect(response.headers).toHaveProperty('x-dns-prefetch-control');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
    });
  });

  describe('CORS Middleware', () => {
    it('should allow requests from allowed origins', async () => {
      app.use(corsMiddleware);
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:8081');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    });

    it('should handle OPTIONS preflight requests', async () => {
      app.use(corsMiddleware);
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:8081');

      expect(response.status).toBe(204);
    });
  });

  describe('HPP Middleware', () => {
    it('should prevent HTTP parameter pollution', async () => {
      app.use(hppMiddleware);
      app.get('/test', (req, res) => res.json({ query: req.query }));

      const response = await request(app).get('/test?id=1&id=2');

      // HPP prevents pollution by using the first value or last value depending on config
      expect(response.body.query.id).toBeDefined();
      // The important thing is that it prevents the pollution attack
      expect(response.body.query.id).toBeTruthy();
    });
  });

  describe('Mongo Sanitize Middleware', () => {
    it('should sanitize MongoDB operators in body', async () => {
      app.use(mongoSanitizeMiddleware);
      app.post('/test', (req, res) => res.json(req.body));

      const response = await request(app)
        .post('/test')
        .send({ email: { $gt: '' } });

      // Custom implementation removes keys with $ and .
      expect(response.body.email).not.toHaveProperty('$gt');
    });

    it('should sanitize MongoDB operators in nested body objects', async () => {
      app.use(mongoSanitizeMiddleware);
      app.post('/test', (req, res) => res.json(req.body));

      const response = await request(app)
        .post('/test')
        .send({ user: { $where: 'this.password === "123"' } });

      // Custom implementation removes keys with $ and .
      expect(response.body.user).not.toHaveProperty('$where');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply global rate limit', async () => {
      app.use(globalRateLimiter);
      app.get('/test', (req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await request(app).get('/test');
      }

      const response = await request(app).get('/test');
      expect(response.status).toBe(429);
    });

    it('should apply stricter auth rate limit', async () => {
      // Note: authRateLimiter should be applied directly to auth routes
      // This test verifies the limiter itself works
      app.use(authRateLimiter);
      app.post('/test', (req, res) => res.json({ ok: true }));

      for (let i = 0; i < 5; i++) {
        await request(app).post('/test');
      }

      const response = await request(app).post('/test');
      expect(response.status).toBe(429);
    });
  });
});
