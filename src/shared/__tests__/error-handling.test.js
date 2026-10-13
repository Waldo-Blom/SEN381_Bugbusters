const express = require('express');
const request = require('supertest');
const HttpError = require('../errors/httpError');
const { validate, sanitizeRequest } = require('../middleware/validate.middleware');
const { notFoundHandler, errorHandler } = require('../middleware/error.middleware');
const { withTransaction } = require('../database/transaction');

function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '../views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(sanitizeRequest);
  app.post(
    '/validated',
    validate((body) => ({
      errors: body.name ? {} : { name: 'Enter a name.' },
      value: { name: body.name },
    })),
    (req, res) => res.json(req.validated)
  );
  app.get('/failure', () => {
    throw new Error('database password leaked');
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('shared error and validation middleware', () => {
  it('normalizes safe form strings and exposes the validated value', async () => {
    const response = await request(createApp())
      .post('/validated')
      .send({ name: '  Sam\u0000  ' })
      .expect(200);
    expect(response.body).toEqual({ name: 'Sam' });
  });

  it('routes schema failures to a human-readable 400 response', async () => {
    const response = await request(createApp())
      .post('/validated')
      .send({})
      .set('Accept', 'application/json')
      .expect(400);
    expect(response.body.error).toEqual({ status: 400, message: 'Enter a name.' });
  });

  it('renders a 404 page for unknown routes', async () => {
    const response = await request(createApp()).get('/missing').expect(404);
    expect(response.text).toContain('404');
    expect(response.text).toContain('could not be found');
  });

  it('hides unexpected error details and logs request context', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(createApp())
        .get('/failure')
        .set('Accept', 'application/json')
        .expect(500);
      expect(response.body.error.message).not.toContain('database password');
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('GET /failure (500)'),
        expect.any(Error)
      );
    } finally {
      log.mockRestore();
    }
  });

  it('allows intentional HTTP errors to expose their safe message', async () => {
    const app = express();
    app.get('/denied', (req, res, next) => next(new HttpError(403, 'Access denied.')));
    app.use(errorHandler);
    const response = await request(app)
      .get('/denied')
      .set('Accept', 'application/json')
      .expect(403);
    expect(response.body.error.message).toBe('Access denied.');
  });

  it('rolls back failed transactions, releases the client, and preserves the original error', async () => {
    const failure = new Error('write failed');
    const client = {
      query: jest.fn().mockResolvedValue({}),
      release: jest.fn(),
    };
    const pool = { connect: jest.fn().mockResolvedValue(client) };

    await expect(
      withTransaction(pool, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(client.query.mock.calls).toEqual([['BEGIN'], ['ROLLBACK']]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
