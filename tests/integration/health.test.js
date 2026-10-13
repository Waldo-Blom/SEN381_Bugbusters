jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const app = require('../../src/app');
const { query } = require('../../src/config/database');

describe('Health endpoint', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 when the database responds to the health query', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'connected' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns 503 when the database is unavailable', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    const response = await request(app).get('/health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', database: 'unavailable' });
  });
});
