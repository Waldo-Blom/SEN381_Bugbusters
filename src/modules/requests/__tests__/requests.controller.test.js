jest.mock('../requests.service', () => ({
  workflow: {
    transitionRequest: jest.fn(),
  },
}));

const express = require('express');
const request = require('supertest');
const requestsService = require('../requests.service');
const requestsRoutes = require('../requests.routes');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/', requestsRoutes);

describe('Requests controller workflow routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects after successfully resolving a request', async () => {
    requestsService.workflow.transitionRequest.mockResolvedValue(true);

    const response = await request(app)
      .post('/staff/requests/request-1/resolve')
      .send({ comment: 'The issue has been fixed.' });

    expect(requestsService.workflow.transitionRequest).toHaveBeenCalledWith(
      'request-1',
      'Resolved',
      'staff-1',
      'The issue has been fixed.'
    );
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/staff/requests/request-1');
  });

  it('returns a bad request when the workflow rejects a transition', async () => {
    requestsService.workflow.transitionRequest.mockRejectedValue(
      new Error('A resolution comment is required to resolve a request.')
    );

    const response = await request(app).post('/staff/requests/request-1/resolve').send({});

    expect(response.status).toBe(400);
    expect(response.text).toBe('A resolution comment is required to resolve a request.');
  });
});
