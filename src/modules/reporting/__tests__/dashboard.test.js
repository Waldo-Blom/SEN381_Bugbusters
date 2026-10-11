jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const path = require('path');
const express = require('express');
const request = require('supertest');
const { query } = require('../../../config/database');
const routes = require('../reporting.routes');

const managerId = '11111111-1111-4111-8111-111111111111';
const departmentId = '22222222-2222-4222-8222-222222222222';

const createApp = (user) => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', [path.join(__dirname, '../..'), path.join(__dirname, '../../../shared/views')]);
  app.use((req, res, next) => {
    req.session = { user };
    next();
  });
  app.use(routes);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).send('Database unavailable'));
  return app;
};

const manager = {
  id: managerId,
  role: 'management',
  name: 'Test Manager',
  email: 'manager@example.com',
  avatarInitials: 'TM',
  departmentId: 'stale-session-department',
};

describe('Management dashboard department access', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({
      rows: [
        {
          open: '1',
          overdue: '0',
          resolved: '0',
          closed: '0',
          eligible_total: '1',
          avg_response_hours: null,
          sla_total: '0',
          sla_met: '0',
        },
      ],
    });
  });

  it('rejects signed-out users without querying the database', async () => {
    expect((await request(createApp(null)).get('/manager/dashboard')).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['staff', 'requester', 'admin', 'operator'])(
    'rejects the %s role without querying the database',
    async (role) => {
      expect(
        (await request(createApp({ ...manager, role })).get('/manager/dashboard')).status
      ).toBe(403);
      expect(query).not.toHaveBeenCalled();
    }
  );

  it('denies a manager without an active managed department', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp(manager)).get('/manager/dashboard');
    expect(response.status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('renders the database department and scopes reads using verified ownership', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: departmentId, name: 'Utilities' }] });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'request-1',
          reference: 'CC-0001',
          title: 'Water leak',
          category: 'Water',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          overdue_flag: false,
          updated_at: '2026-10-11T08:00:00Z',
        },
      ],
    });
    const response = await request(createApp(manager)).get('/manager/dashboard');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Utilities');
    expect(response.text).toContain('Water leak');
    expect(response.text).toContain('In Progress');
    expect(response.text).toContain('Not available');
    expect(response.text).not.toContain('15% faster');
    expect(query.mock.calls[2][1]).toEqual([departmentId, managerId]);
    expect(response.text).not.toContain('stale-session-department');
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("u.user_type = 'MANAGER'"), [
      managerId,
    ]);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('d.department_id = $1 AND d.manager_id = $2');
    expect(sql).toContain('d.is_active = true AND u.is_active = true');
    expect(params).toEqual([departmentId, managerId]);
    expect(sql).not.toContain('requester_email');
  });

  it('renders an empty department without errors', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: departmentId, name: 'Utilities' }] });
    query.mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp(manager)).get('/manager/dashboard');
    expect(response.status).toBe(200);
    expect(response.text).toContain('No recent activity.');
  });

  it('passes database failures to error handling', async () => {
    query.mockRejectedValueOnce(new Error('connection failed'));
    const response = await request(createApp(manager)).get('/manager/dashboard');
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('connection failed');
  });
});
