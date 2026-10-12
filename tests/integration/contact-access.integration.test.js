// Opt in with CONTACT_ACCESS_TEST_DATABASE_URL. Tables are connection-local;
// every write is rolled back and public application rows are untouched.
jest.mock('../../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));

const { Client } = require('pg');
const express = require('express');
const session = require('express-session');
const supertest = require('supertest');
const path = require('path');
const db = require('../../src/config/database');
const requestsRoutes = require('../../src/modules/requests/requests.routes');
const reportingRoutes = require('../../src/modules/reporting/reporting.routes');
const auditModule = require('../../src/modules/audit');
const describeDatabase = process.env.CONTACT_ACCESS_TEST_DATABASE_URL ? describe : describe.skip;
jest.setTimeout(60000);

const ids = Array.from(
  { length: 10 },
  (_, i) => `00000000-0000-4000-9000-${String(i + 1).padStart(12, '0')}`
);
const [
  staff,
  colleague,
  foreignStaff,
  citizen,
  manager,
  foreignManager,
  department,
  foreignDepartment,
  category,
  requestId,
] = ids;
const staffPath = `/staff/requests/${requestId}`;
const managerPath = `/manager/requests/${requestId}`;
const inboxPath = '/manager/contact-access-requests';

describeDatabase('Contact access HTTP journeys against PostgreSQL', () => {
  let client;
  let failAudit = false;
  let failedAuditWrites = 0;
  let unregisterAudit;
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', [
    path.resolve(__dirname, '../../src/modules'),
    path.resolve(__dirname, '../../src/shared/views'),
  ]);
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({ secret: 'contact-access-test-secret', resave: false, saveUninitialized: false })
  );
  app.use((req, res, next) => {
    req.session.csrfToken = req.session.csrfToken || 'a'.repeat(64);
    const userId = req.headers['x-test-user'] || staff;
    req.session.user = {
      id: userId,
      role: [manager, foreignManager].includes(userId) ? 'management' : 'staff',
      email: 'test@example.com',
      name: 'Test User',
      avatarInitials: 'TU',
    };
    next();
  });
  app.use(requestsRoutes);
  app.use(reportingRoutes);
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => res.status(500).send('Unable to complete the action.'));

  const get = (agent, userId, url) => agent.get(url).set('x-test-user', userId);
  const post = (agent, userId, url, token) =>
    agent.post(url).set('x-test-user', userId).type('form').send({ _csrf: token });
  const tokenFor = async (agent, userId, url) => {
    const response = await get(agent, userId, url);
    expect(response.status).toBe(200);
    return response.text.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || 'a'.repeat(64);
  };
  const pendingId = async () =>
    (
      await client.query(
        'SELECT contact_access_request_id FROM request_contact_access_requests LIMIT 1'
      )
    ).rows[0].contact_access_request_id;
  const waitForAuditActions = async (expectedActions) => {
    const sortedExpected = [...expectedActions].sort();
    for (let attempt = 0; attempt < 50; attempt++) {
      const rows = (
        await client.query('SELECT action_type FROM admin_audit_log ORDER BY created_at')
      ).rows;
      if (
        JSON.stringify(rows.map((row) => row.action_type).sort()) === JSON.stringify(sortedExpected)
      ) {
        return rows;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for audit actions: ${expectedActions.join(', ')}`);
  };
  const waitForFailedAuditWrite = async () => {
    for (let attempt = 0; attempt < 50 && failedAuditWrites === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(failedAuditWrites).toBeGreaterThan(0);
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.CONTACT_ACCESS_TEST_DATABASE_URL });
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
    ]) {
      await client.query(`CREATE TEMP TABLE ${table} AS SELECT * FROM public.${table} WHERE false`);
    }
    await client.query(`CREATE TEMP TABLE request_contact_access_requests
      (LIKE public.request_contact_access_requests INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
    await client.query(
      'CREATE TEMP TABLE admin_audit_log (LIKE public.admin_audit_log INCLUDING DEFAULTS INCLUDING CONSTRAINTS)'
    );
    for (const [userId, role, first, last] of [
      [staff, 'STAFF', 'Assigned', 'Staff'],
      [colleague, 'STAFF', 'Other', 'Staff'],
      [foreignStaff, 'STAFF', 'Foreign', 'Staff'],
      [citizen, 'REQUESTER', 'Private', 'Citizen'],
      [manager, 'MANAGER', 'Water', 'Manager'],
      [foreignManager, 'MANAGER', 'Roads', 'Manager'],
    ]) {
      await client.query(
        `INSERT INTO users (user_id, user_type, is_active, first_name, last_name, email, phone)
        VALUES ($1, $2::user_type, true, $3, $4, $5, '0123456789')`,
        [
          userId,
          role,
          first,
          last,
          userId === citizen ? 'private@example.com' : `${first}@example.com`,
        ]
      );
    }
    await client.query(
      `INSERT INTO departments (department_id, manager_id, name, is_active)
      VALUES ($1, $3, 'Water', true), ($2, $4, 'Roads', true)`,
      [department, foreignDepartment, manager, foreignManager]
    );
    await client.query(
      `INSERT INTO staff_assignments (staff_id, department_id, is_active)
      VALUES ($1, $4, true), ($2, $4, true), ($3, $5, true)`,
      [staff, colleague, foreignStaff, department, foreignDepartment]
    );
    await client.query(
      `INSERT INTO request_categories (category_id, department_id, name, is_active)
      VALUES ($1, $2, 'Leaks', true)`,
      [category, department]
    );
    await client.query(
      `INSERT INTO service_requests (request_id, request_number, category_id, requester_id,
      created_by, assigned_staff_id, contact_information_approved, title, description, status, priority, created_at, updated_at)
      VALUES ($1, 'CC-TEST-1', $2, $3, $3, $4, false, 'Broken pipe', 'Repair required', 'ASSIGNED', 'MEDIUM', LOCALTIMESTAMP, LOCALTIMESTAMP)`,
      [requestId, category, citizen, staff]
    );
    db.query.mockImplementation((sql, params) => client.query(sql, params));
    db.pool.connect.mockResolvedValue({
      query: (sql, params) => {
        if (failAudit && sql.includes('INSERT INTO admin_audit_log')) {
          failedAuditWrites++;
          throw new Error('Audit write failed');
        }
        const commands = {
          BEGIN: 'SAVEPOINT contact_write',
          COMMIT: 'RELEASE SAVEPOINT contact_write',
          ROLLBACK: 'ROLLBACK TO SAVEPOINT contact_write',
        };
        return client.query(commands[sql] || sql, params);
      },
      release: () => {},
    });
    unregisterAudit = auditModule.initialize();
  });

  afterAll(async () => {
    if (unregisterAudit) unregisterAudit();
    if (client) {
      try {
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    }
  });
  beforeEach(async () => {
    failAudit = false;
    failedAuditWrites = 0;
    await client.query('TRUNCATE pg_temp.request_contact_access_requests, pg_temp.admin_audit_log');
    await client.query(
      `UPDATE service_requests SET assigned_staff_id = $1, contact_information_approved = false,
      contact_approved_by = NULL, contact_approved_at = NULL`,
      [staff]
    );
  });

  it('requests once, loads the manager inbox, approves, and reveals contacts only to the assignee', async () => {
    const staffAgent = supertest.agent(app);
    const managerAgent = supertest.agent(app);
    const token = await tokenFor(staffAgent, staff, staffPath);
    expect((await post(staffAgent, staff, `${staffPath}/contact-access`, token)).status).toBe(302);
    expect((await post(staffAgent, staff, `${staffPath}/contact-access`, token)).status).toBe(302);
    const pending = await get(staffAgent, staff, staffPath);
    expect(pending.text).toContain('awaiting management approval');
    expect(pending.text).not.toContain('Request contact access');
    const managerToken = await tokenFor(managerAgent, manager, inboxPath);
    const inbox = await get(managerAgent, manager, inboxPath);
    expect(inbox.text).toContain('Assigned Staff');
    expect(inbox.text).toContain('CC-TEST-1');
    const accessId = await pendingId();
    expect(
      (await post(managerAgent, manager, `${inboxPath}/${accessId}/approve`, managerToken)).status
    ).toBe(302);
    const approved = await get(staffAgent, staff, staffPath);
    expect(approved.text).toContain('private@example.com');
    expect(approved.text).toContain('Private Citizen');
    expect((await get(supertest.agent(app), colleague, staffPath)).text).not.toContain(
      'private@example.com'
    );
    expect(
      (await post(managerAgent, manager, `${inboxPath}/${accessId}/approve`, managerToken)).status
    ).toBe(409);
    const saved = await client.query(
      'SELECT contact_information_approved, contact_approved_by, contact_approved_at FROM service_requests'
    );
    expect(saved.rows[0]).toMatchObject({
      contact_information_approved: true,
      contact_approved_by: manager,
    });
    expect(saved.rows[0].contact_approved_at).not.toBeNull();
    expect(
      (await client.query('SELECT count(*)::int AS count FROM request_contact_access_requests'))
        .rows[0].count
    ).toBe(1);
    await waitForAuditActions(['CONTACT_ACCESS_REQUESTED', 'CONTACT_ACCESS_APPROVED']);
  });

  it('records request lifecycle transitions for manager review', async () => {
    const staffAgent = supertest.agent(app);
    const token = await tokenFor(staffAgent, staff, staffPath);
    expect((await post(staffAgent, staff, `${staffPath}/start-progress`, token)).status).toBe(302);

    await waitForAuditActions(['STATUS_CHANGED']);
    const statusAudit = await client.query(
      `SELECT changed_data FROM admin_audit_log WHERE action_type = 'STATUS_CHANGED'`
    );
    expect(statusAudit.rows[0].changed_data).toMatchObject({
      oldStatus: 'ASSIGNED',
      newStatus: 'IN_PROGRESS',
    });
    const history = await client.query('SELECT new_status FROM request_status_history');
    expect(history.rows.map((row) => row.new_status)).toContain('IN_PROGRESS');
  });

  it('rejects access, shows the denial message, removes the button, and blocks resubmission', async () => {
    const staffAgent = supertest.agent(app);
    const managerAgent = supertest.agent(app);
    const token = await tokenFor(staffAgent, staff, staffPath);
    await post(staffAgent, staff, `${staffPath}/contact-access`, token);
    const foreignAgent = supertest.agent(app);
    const foreignToken = await tokenFor(foreignAgent, foreignManager, inboxPath);
    expect(
      (
        await post(
          foreignAgent,
          foreignManager,
          `${inboxPath}/${await pendingId()}/reject`,
          foreignToken
        )
      ).status
    ).toBe(403);
    const managerToken = await tokenFor(managerAgent, manager, inboxPath);
    expect(
      (await post(managerAgent, manager, `${inboxPath}/${await pendingId()}/reject`, managerToken))
        .status
    ).toBe(302);
    const denied = await get(staffAgent, staff, staffPath);
    expect(denied.text).toContain('denied by management');
    expect(denied.text).not.toMatch(/Request contact access|private@example.com|Private Citizen/);
    expect((await post(staffAgent, staff, `${staffPath}/contact-access`, token)).status).toBe(403);
    await waitForAuditActions(['CONTACT_ACCESS_REQUESTED', 'CONTACT_ACCESS_REJECTED']);
    const saved = await client.query(
      'SELECT contact_information_approved, contact_approved_by, contact_approved_at FROM service_requests'
    );
    expect(saved.rows[0]).toEqual({
      contact_information_approved: false,
      contact_approved_by: null,
      contact_approved_at: null,
    });
  });

  it('allows a direct manager grant and revocation without a staff request', async () => {
    const agent = supertest.agent(app);
    const token = await tokenFor(agent, manager, managerPath);
    expect(
      (await post(agent, manager, `${managerPath}/contact-access/authorise`, token)).status
    ).toBe(302);
    expect((await get(supertest.agent(app), staff, staffPath)).text).toContain(
      'private@example.com'
    );
    expect((await post(agent, manager, `${managerPath}/contact-access/revoke`, token)).status).toBe(
      302
    );
    expect((await get(supertest.agent(app), staff, staffPath)).text).not.toContain(
      'private@example.com'
    );
    const events = await waitForAuditActions(['CONTACT_ACCESS_APPROVED', 'CONTACT_ACCESS_REVOKED']);
    expect(events.map((row) => row.action_type).sort()).toEqual([
      'CONTACT_ACCESS_APPROVED',
      'CONTACT_ACCESS_REVOKED',
    ]);
  });

  it('blocks cross-department managers, other staff, role spoofing and missing CSRF tokens', async () => {
    const other = supertest.agent(app);
    const otherToken = await tokenFor(other, foreignManager, inboxPath);
    expect((await get(other, foreignManager, managerPath)).status).toBe(403);
    expect(
      (await post(other, foreignManager, `${managerPath}/contact-access/authorise`, otherToken))
        .status
    ).toBe(403);
    const colleagueAgent = supertest.agent(app);
    // Obtain a real token from another same-department request view.
    await get(colleagueAgent, colleague, staffPath);
    expect(
      (await post(colleagueAgent, colleague, `${staffPath}/contact-access`, 'a'.repeat(64))).status
    ).toBe(403);
    expect(
      (await post(colleagueAgent, colleague, `${managerPath}/contact-access/authorise`, 'invalid'))
        .status
    ).toBe(403);
    expect(
      (await post(supertest.agent(app), staff, `${staffPath}/contact-access`, undefined)).status
    ).toBe(403);
    expect(
      (await client.query('SELECT count(*)::int AS count FROM admin_audit_log')).rows[0].count
    ).toBe(0);
  });

  it('refuses approval after assignment changes', async () => {
    const staffAgent = supertest.agent(app);
    const token = await tokenFor(staffAgent, staff, staffPath);
    await post(staffAgent, staff, `${staffPath}/contact-access`, token);
    await client.query('UPDATE service_requests SET assigned_staff_id = $1', [colleague]);
    const agent = supertest.agent(app);
    const managerToken = await tokenFor(agent, manager, managerPath);
    expect(
      (await post(agent, manager, `${inboxPath}/${await pendingId()}/approve`, managerToken)).status
    ).toBe(409);
    await waitForAuditActions(['CONTACT_ACCESS_REQUESTED']);
    expect((await get(staffAgent, staff, staffPath)).text).not.toContain('private@example.com');
  });

  it('completes contact authorisation when the asynchronous audit write fails', async () => {
    const agent = supertest.agent(app);
    const token = await tokenFor(agent, manager, managerPath);
    failAudit = true;
    expect(
      (await post(agent, manager, `${managerPath}/contact-access/authorise`, token)).status
    ).toBe(302);
    await waitForFailedAuditWrite();
    expect(
      (await client.query('SELECT contact_information_approved FROM service_requests')).rows[0]
        .contact_information_approved
    ).toBe(true);
    expect(
      (await client.query('SELECT count(*)::int AS count FROM admin_audit_log')).rows[0].count
    ).toBe(0);
  });

  it('completes a contact review when the asynchronous audit write fails', async () => {
    const staffAgent = supertest.agent(app);
    const staffToken = await tokenFor(staffAgent, staff, staffPath);
    await post(staffAgent, staff, `${staffPath}/contact-access`, staffToken);
    await waitForAuditActions(['CONTACT_ACCESS_REQUESTED']);
    const agent = supertest.agent(app);
    const token = await tokenFor(agent, manager, inboxPath);
    failAudit = true;
    expect(
      (await post(agent, manager, `${inboxPath}/${await pendingId()}/approve`, token)).status
    ).toBe(302);
    await waitForFailedAuditWrite();
    const request = await client.query(
      'SELECT status, reviewed_by, reviewed_at FROM request_contact_access_requests'
    );
    expect(request.rows[0]).toMatchObject({ status: 'APPROVED', reviewed_by: manager });
    expect(request.rows[0].reviewed_at).not.toBeNull();
    expect(
      (await client.query('SELECT contact_information_approved FROM service_requests')).rows[0]
        .contact_information_approved
    ).toBe(true);
    expect(
      (await client.query('SELECT action_type FROM admin_audit_log')).rows.map(
        (row) => row.action_type
      )
    ).toEqual(['CONTACT_ACCESS_REQUESTED']);
  });
});
