// Opt in with STAFF_ACCESS_TEST_DATABASE_URL. All writes use connection-local
// temporary tables copied from the real schema; public request data is untouched.
jest.mock('../../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));

const { Client } = require('pg');
const express = require('express');
const supertest = require('supertest');
const path = require('path');
const db = require('../../src/config/database');
const service = require('../../src/modules/requests/requests.service');
const workflow = require('../../src/modules/workflow/workflow.service');
const routes = require('../../src/modules/requests/requests.routes');

jest.setTimeout(30000);
const databaseTests = process.env.STAFF_ACCESS_TEST_DATABASE_URL ? describe : describe.skip;
const ids = Array.from(
  { length: 8 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
);
const [
  staff,
  colleague,
  foreignStaff,
  citizen,
  department,
  foreignDepartment,
  category,
  requestId,
] = ids;

databaseTests('Staff request access against PostgreSQL', () => {
  let client;
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', [
    path.resolve(__dirname, '../../src/modules'),
    path.resolve(__dirname, '../../src/shared/views'),
  ]);
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = {
      user: {
        id: req.headers['x-test-staff'] || staff,
        name: 'Test Staff',
        email: 'staff@example.com',
        role: 'staff',
      },
    };
    next();
  });
  app.use(routes);
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => res.status(error.statusCode || 500).send(error.message));

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.STAFF_ACCESS_TEST_DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    for (const table of [
      'users',
      'departments',
      'staff_assignments',
      'request_categories',
      'service_requests',
      'external_requesters',
      'request_attachments',
      'request_comments',
      'request_status_history',
      'request_assignment_history',
    ]) {
      await client.query(`CREATE TEMP TABLE ${table} AS SELECT * FROM public.${table} WHERE false`);
    }
    await client.query(
      `INSERT INTO users (user_id, user_type, is_active, first_name, last_name, email, phone)
      VALUES ($1, 'STAFF', true, 'Assigned', 'Staff', 'staff@example.com', NULL),
             ($2, 'STAFF', true, 'Other', 'Staff', 'other@example.com', NULL),
             ($3, 'STAFF', true, 'Foreign', 'Staff', 'foreign@example.com', NULL),
             ($4, 'REQUESTER', true, 'Private', 'Citizen', 'private@example.com', '0123456789')`,
      [staff, colleague, foreignStaff, citizen]
    );
    await client.query(
      `INSERT INTO departments (department_id, name, is_active) VALUES ($1, 'Water', true), ($2, 'Roads', true)`,
      [department, foreignDepartment]
    );
    await client.query(
      `INSERT INTO staff_assignments (staff_id, department_id, is_active) VALUES ($1, $4, true), ($2, $4, true), ($3, $5, true)`,
      [staff, colleague, foreignStaff, department, foreignDepartment]
    );
    await client.query(
      `INSERT INTO request_categories (category_id, department_id, name, is_active) VALUES ($1, $2, 'Leaks', true)`,
      [category, department]
    );
    await client.query(
      `INSERT INTO service_requests (request_id, request_number, category_id, requester_id, created_by, title, description,
      status, priority, assigned_staff_id, contact_information_approved, created_at, updated_at)
      VALUES ($1, 'CC-TEST-0001', $2, $3, $3, 'Broken pipe', 'Repair required', 'ASSIGNED', 'MEDIUM', $4, false, LOCALTIMESTAMP, LOCALTIMESTAMP)`,
      [requestId, category, citizen, staff]
    );
    await client.query(
      `INSERT INTO request_comments (request_id, commented_by, content, is_deleted, created_at)
      VALUES ($1, $2, 'Visible note', false, LOCALTIMESTAMP), ($1, $2, 'Deleted note', true, LOCALTIMESTAMP)`,
      [requestId, staff]
    );
    db.query.mockImplementation((sql, params) => client.query(sql, params));
    db.pool.connect.mockResolvedValue({
      query: (sql, params) => {
        const transaction = {
          BEGIN: 'SAVEPOINT staff_write',
          COMMIT: 'RELEASE SAVEPOINT staff_write',
          ROLLBACK: 'ROLLBACK TO SAVEPOINT staff_write',
        };
        return client.query(transaction[sql] || sql, params);
      },
      release: () => {},
    });
  });

  afterAll(async () => {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    }
  });

  beforeEach(async () => {
    await client.query(
      `UPDATE service_requests SET status = 'ASSIGNED', assigned_staff_id = $1, contact_information_approved = false`,
      [staff]
    );
    await client.query('UPDATE users SET is_active = true');
    await client.query('UPDATE staff_assignments SET is_active = true');
  });

  it('renders real details and comments without unapproved contact information', async () => {
    const response = await supertest(app).get(`/staff/requests/${requestId}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain('Broken pipe');
    expect(response.text).toContain('Visible note');
    expect(response.text).not.toMatch(
      /Private Citizen|private@example.com|0123456789|Deleted note/
    );
  });

  it('returns HTTP 403 for cross-department GET and status POST', async () => {
    expect(
      (await supertest(app).get(`/staff/requests/${requestId}`).set('x-test-staff', foreignStaff))
        .status
    ).toBe(403);
    expect(
      (
        await supertest(app)
          .post(`/staff/requests/${requestId}/start-progress`)
          .set('x-test-staff', foreignStaff)
          .send({})
      ).status
    ).toBe(403);
  });

  it('allows approved contacts only to the assigned staff member', async () => {
    await client.query('UPDATE service_requests SET contact_information_approved = true');
    const owner = await service.getForStaff(requestId, staff);
    const other = await service.getForStaff(requestId, colleague);
    expect(owner.requesterEmail).toBe('private@example.com');
    expect(owner.requesterName).toBe('Private Citizen');
    expect(other.requesterEmail).toBe('');
    expect(other.canManageStatus).toBe(false);
  });

  it('denies inactive staff and removed department membership', async () => {
    await client.query('UPDATE users SET is_active = false WHERE user_id = $1', [staff]);
    await expect(service.getForStaff(requestId, staff)).rejects.toMatchObject({ statusCode: 403 });
    await client.query('UPDATE users SET is_active = true');
    await client.query('UPDATE staff_assignments SET is_active = false WHERE staff_id = $1', [
      staff,
    ]);
    await expect(service.getForStaff(requestId, staff)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('starts progress, resolves with a comment, and records real history', async () => {
    expect(
      (await supertest(app).post(`/staff/requests/${requestId}/start-progress`).send({})).status
    ).toBe(302);
    expect(
      (
        await supertest(app)
          .post(`/staff/requests/${requestId}/resolve`)
          .send({ comment: 'Repaired the pipe.' })
      ).status
    ).toBe(302);
    const result = await service.getForStaff(requestId, staff);
    expect(result.status).toBe('Resolved');
    expect(result.comments.some((comment) => comment.text === 'Repaired the pipe.')).toBe(true);
    expect(result.timeline.some((event) => event.status === 'Resolved')).toBe(true);
    const saved = await client.query(
      'SELECT resolved_at FROM service_requests WHERE request_id = $1',
      [requestId]
    );
    expect(saved.rows[0].resolved_at).not.toBeNull();
  });

  it('records self-assignment and prevents a colleague from taking over', async () => {
    await client.query(
      "UPDATE service_requests SET status = 'SUBMITTED', assigned_staff_id = NULL"
    );
    expect((await supertest(app).post(`/staff/requests/${requestId}/assign`).send({})).status).toBe(
      302
    );
    await expect(workflow.assignToSelf(requestId, colleague)).rejects.toMatchObject({
      statusCode: 403,
    });
    const saved = await client.query(
      'SELECT assigned_to_staff_id FROM request_assignment_history WHERE request_id = $1',
      [requestId]
    );
    expect(saved.rows).toEqual([{ assigned_to_staff_id: staff }]);
  });
});
