jest.mock('../../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));

const path = require('path');
const express = require('express');
const request = require('supertest');
const { query } = require('../../../config/database');
const routes = require('../requests.routes');
const service = require('../requests.service');

const manager = {
  id: 'manager-id',
  email: 'manager@example.com',
  role: 'management',
  name: 'Manager',
  avatarInitials: 'TM',
  departmentId: 'stale',
};
const appFor = (user) => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', [path.join(__dirname, '../..'), path.join(__dirname, '../../../shared/views')]);
  app.use((req, res, next) => {
    req.session = { user };
    next();
  });
  app.use(routes);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).send('Unable to load requests.'));
  return app;
};

describe('Manager department request list', () => {
  beforeEach(() => query.mockReset());

  it.each([
    [null, 401],
    [{ ...manager, role: 'staff' }, 403],
    [{ ...manager, role: 'requester' }, 403],
  ])('denies unauthorised access', async (user, status) => {
    expect((await request(appFor(user)).get('/manager/requests')).status).toBe(status);
    expect(query).not.toHaveBeenCalled();
  });

  it('denies managers without an active department', async () => {
    query.mockResolvedValue({ rows: [] });
    expect((await request(appFor(manager)).get('/manager/requests')).status).toBe(403);
  });

  it('renders the database department and requests despite a stale session department', async () => {
    query.mockResolvedValue({
      rows: [
        {
          department_id: 'department-id',
          department_name: 'Water and Sanitation',
          request_id: 'request-id',
          request_number: 'CC-001',
          title: '<script>Leak</script>',
          category_name: 'Water',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          requester_name: 'Citizen',
          created_at: '2026-10-11T10:00:00Z',
        },
      ],
    });
    const response = await request(appFor(manager)).get('/manager/requests');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Water and Sanitation');
    expect(response.text).toContain('Showing <span class="font-semibold text-slate-900">1</span>');
    expect(response.text).toContain('In Progress');
    expect(response.text).toContain('&lt;script&gt;Leak&lt;/script&gt;');
    expect(response.text).not.toContain('>stale<');
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([manager.id]);
    expect(sql).toContain('c.department_id = d.department_id');
    expect(sql).toContain('d.manager_id = $1');
    expect(sql).toContain("manager.user_type = 'MANAGER'");
    expect(sql).not.toContain('citizen.email');
  });

  it('preserves an empty department without counting null request rows', async () => {
    query.mockResolvedValue({
      rows: [{ department_id: 'department-id', department_name: 'Water', request_id: null }],
    });
    const response = await request(appFor(manager)).get('/manager/requests');
    expect(response.status).toBe(200);
    expect(response.text).toContain('No requests for your department yet.');
    expect(response.text).toContain('>0</span>');
  });

  it('does not query without an authenticated ID', async () => {
    expect(await service.listForManager(null)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('handles database failures without exposing internal errors', async () => {
    query.mockRejectedValue(new Error('private database details'));
    const response = await request(appFor(manager)).get('/manager/requests');
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('private database details');
  });
});
