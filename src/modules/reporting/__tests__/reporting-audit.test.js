jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const path = require('path');
const express = require('express');
const request = require('supertest');
const { query } = require('../../../config/database');
const routes = require('../reporting.routes');

const managerId = '11111111-1111-4111-8111-111111111111';
const departmentId = '22222222-2222-4222-8222-222222222222';
const manager = {
  id: managerId,
  role: 'management',
  name: 'Test Manager',
  email: 'manager@example.com',
  avatarInitials: 'TM',
};

const createApp = (user) => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', [
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../../shared/views'),
  ]);
  app.use((req, res, next) => {
    req.session = { user };
    next();
  });
  app.use(routes);
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => res.status(500).send('Unable to load report'));
  return app;
};

beforeEach(() => query.mockReset());

it('requires management access before reading audit data', async () => {
  const response = await request(createApp({ ...manager, role: 'staff' })).get(
    '/manager/reporting'
  );
  expect(response.status).toBe(403);
  expect(query).not.toHaveBeenCalled();
});

it('renders department-scoped lifecycle events without exposing raw audit details', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: departmentId, name: 'Water' }] });
  query.mockResolvedValueOnce({ rows: [{ count: 201 }] });
  query.mockResolvedValueOnce({
    rows: [
      {
        action_type: 'STATUS_CHANGED',
        changed_data: {
          oldStatus: 'IN_PROGRESS',
          newStatus: 'RESOLVED',
          comment: 'private comment text',
        },
        timestamp: '2026-10-11 14:30',
        actor_name: 'Assigned Staff',
        request_number: 'CC-0001',
      },
    ],
  });
  const response = await request(createApp(manager)).get('/manager/reporting?page=2');

  expect(response.status).toBe(200);
  expect(response.text).toContain('Page 2 of 3');
  expect(response.text).toContain('/manager/reporting?page=1');
  expect(response.text).toContain('/manager/reporting?page=3');
  expect(response.text).toContain('Status changed from In Progress to Resolved');
  expect(response.text).toContain('2026-10-11 14:30');
  expect(response.text).toContain('Assigned Staff');
  expect(response.text).toContain('CC-0001');
  expect(response.text).not.toContain('private comment text');
  expect(query).toHaveBeenCalledTimes(3);
  expect(query.mock.calls[1][1]).toEqual([managerId, departmentId, null]);
  expect(query.mock.calls[2][1]).toEqual([null, managerId, departmentId, null, 100, 100]);
});
