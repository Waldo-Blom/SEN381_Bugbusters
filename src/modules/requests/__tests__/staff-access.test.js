jest.mock('../../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));

const express = require('express');
const supertest = require('supertest');
const path = require('path');
const ejs = require('ejs');
const db = require('../../../config/database');
const model = require('../requests.model');
const service = require('../requests.service');
const routes = require('../requests.routes');

const requestId = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const context = {
  staff_allowed: true,
  assigned_staff_id: staffId,
  contact_information_approved: false,
};
const row = {
  request_id: requestId,
  request_number: 'CC-2026-0001',
  title: 'Broken pipe',
  description: 'Repair required',
  status: 'ASSIGNED',
  priority: 'MEDIUM',
  department_name: 'Water',
  category_name: 'Leaks',
  assigned_to_name: 'Assigned Staff',
  requester_name: 'Private Citizen',
  requester_email: 'private@example.com',
  requester_phone: '0123456789',
  ...context,
};

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.session = { user: { id: staffId, email: 'staff@example.com', role: 'staff' } };
  next();
});
app.use(routes);

beforeEach(() => jest.resetAllMocks());

it('returns HTTP 403 for cross-department request IDs without fetching comments or history', async () => {
  db.query.mockResolvedValue({ rows: [{ ...context, staff_allowed: false }] });
  const response = await supertest(app).get(`/staff/requests/${requestId}`);
  expect(response.status).toBe(403);
  expect(db.query).toHaveBeenCalledTimes(1);
  expect(db.query.mock.calls[0][0]).toContain('WHERE r.request_id = $1');
  expect(db.query.mock.calls[0][0]).toContain('sa.department_id = c.department_id');
});

it('returns HTTP 404 for a missing request and HTTP 400 for malformed IDs', async () => {
  db.query.mockResolvedValue({ rows: [] });
  expect((await supertest(app).get(`/staff/requests/${requestId}`)).status).toBe(404);
  expect((await supertest(app).get('/staff/requests/invalid')).status).toBe(400);
  expect(db.query).toHaveBeenCalledTimes(2);
});

it.each([
  [false, staffId, false],
  [true, otherId, false],
  [true, staffId, true],
])(
  'requires approval=%s and matching assignee=%s for contact visibility',
  async (approved, assignee, visible) => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ ...row, assigned_staff_id: assignee, contact_information_approved: approved }],
      })
      .mockResolvedValue({ rows: [] });
    const result = await service.getForStaff(requestId, staffId);
    expect(result.canViewContact).toBe(visible);
    expect(result.canManageStatus).toBe(assignee === staffId);
    if (!visible)
      expect(JSON.stringify(result)).not.toMatch(/Private Citizen|private@example.com|0123456789/);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('r.contact_information_approved = true AND r.assigned_staff_id = $2');
    expect(sql).toContain('viewer.is_active = true');
    expect(db.query.mock.calls[0][1]).toEqual([requestId, staffId]);
  }
);

it('rejects a status POST by a colleague in the same department', async () => {
  db.query.mockResolvedValue({ rows: [{ ...context, assigned_staff_id: otherId }] });
  const response = await supertest(app).post(`/staff/requests/${requestId}/start-progress`);
  expect(response.status).toBe(403);
  expect(db.pool.connect).not.toHaveBeenCalled();
});

it('checks ownership again under the request lock and rolls back without writing', async () => {
  const client = { query: jest.fn(), release: jest.fn() };
  db.pool.connect.mockResolvedValue(client);
  client.query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ status: 'ASSIGNED' }] })
    .mockResolvedValueOnce({ rows: [{ ...context, assigned_staff_id: otherId }] })
    .mockResolvedValue({ rows: [] });
  await expect(
    model.updateStatus(requestId, 'In Progress', null, staffId, true)
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  expect(client.release).toHaveBeenCalled();
});

it('never selects requester contact fields for staff lists', async () => {
  db.query.mockResolvedValue({ rows: [] });
  await service.listForStaff(staffId);
  const sql = db.query.mock.calls[0][0];
  expect(sql).toContain('CASE WHEN false THEN u.email ELSE NULL END as requester_email');
  expect(sql).toContain('CASE WHEN false THEN ext.phone ELSE NULL END as ext_requester_phone');
  expect(sql).toContain('sa.department_id = c.department_id');
});

it.each([
  ['Submitted', false, false, 'Assign to me'],
  ['Assigned', false, false, 'Start Progress'],
  ['In Progress', true, false, 'Mark as Resolved'],
  ['Assigned', true, true, 'Start Progress'],
])(
  'preserves the original %s UI around the contact panel',
  async (status, assigned, approved, control) => {
    const html = await ejs.renderFile(
      path.join(__dirname, '../views/staff/request-detail.ejs'),
      {
        title: 'Details',
        user: { name: 'Staff', email: 'staff@example.com' },
        navItems: [],
        activeHref: '',
        roleLabel: 'Staff',
        pageTitle: 'Details',
        pageSubtitle: '',
        request: {
          id: requestId,
          title: 'Broken pipe',
          reference: 'CC-1',
          description: 'Repair required',
          status,
          priority: 'Medium',
          department: 'Water',
          category: 'Leaks',
          location: '',
          submittedAt: '',
          updatedAt: '',
          comments: [],
          timeline: [],
          canManageStatus: assigned,
          canViewContact: approved,
          canAssign: false,
          requesterName: approved ? 'Private Citizen' : 'Restricted',
          requesterEmail: 'private@example.com',
          requesterPhone: '0123456789',
          createdBy: '',
        },
      },
      { views: [path.resolve(__dirname, '../../../shared/views')] }
    );
    if (approved) {
      expect(html).toContain('Private Citizen');
      expect(html).toContain('private@example.com');
      expect(html).toContain('0123456789');
    } else {
      expect(html).not.toMatch(/Private Citizen|private@example.com|0123456789/);
    }
    if (assigned && !approved) {
      expect(html).toMatch(/<button type="submit"[^>]*>Request contact access<\/button>/);
    } else {
      expect(html).not.toContain('Request contact access');
    }
    expect(html).toContain(control);
    expect(html).toContain('Created by');
    expect(html).toMatch(/<button class="[^"]*">Post comment<\/button>/);
    if (status === 'Submitted') expect(html).toContain('Reject Request');
  }
);
