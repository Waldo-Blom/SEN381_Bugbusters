// Opt in with REPORTING_TEST_DATABASE_URL. Only connection-local temporary
// tables are written; the transaction is rolled back and public tables untouched.
jest.mock('../../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));

const { Client } = require('pg');
const db = require('../../src/config/database');
const model = require('../../src/modules/reporting/reporting.model');
const requestsModel = require('../../src/modules/requests/requests.model');

jest.setTimeout(30000);

const describeDatabase = process.env.REPORTING_TEST_DATABASE_URL ? describe : describe.skip;

describeDatabase('Reporting aggregates against PostgreSQL', () => {
  let client;
  beforeAll(async () => {
    client = new Client({ connectionString: process.env.REPORTING_TEST_DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE users (user_id text, user_type text, is_active boolean);
      CREATE TEMP TABLE departments (department_id text, manager_id text, is_active boolean);
      CREATE TEMP TABLE request_categories (category_id text, department_id text, target_resolution_time interval);
      CREATE TEMP TABLE service_requests (
        request_id text, category_id text, status text, created_at timestamp,
        assigned_at timestamp, resolved_at timestamp, expected_completion_at timestamp);
      CREATE TEMP TABLE request_assignment_history (request_id text, assigned_to_staff_id text, assigned_at timestamp);
      CREATE TEMP TABLE request_status_history (request_id text, new_status text, changed_at timestamp);
      INSERT INTO users VALUES ('manager', 'MANAGER', true), ('other', 'MANAGER', true);
      INSERT INTO departments VALUES ('department', 'manager', true), ('foreign', 'other', true);
      INSERT INTO request_categories VALUES ('category', 'department', interval '1 day'), ('foreign', 'foreign', NULL);
      INSERT INTO service_requests VALUES
        ('open', 'category', 'SUBMITTED', LOCALTIMESTAMP - interval '10 days', NULL, NULL, NULL),
        ('boundary', 'category', 'ASSIGNED', LOCALTIMESTAMP - interval '1 day', NULL, NULL, LOCALTIMESTAMP),
        ('resolved', 'category', 'RESOLVED', LOCALTIMESTAMP - interval '10 days', NULL, LOCALTIMESTAMP - interval '9 days', NULL),
        ('closed', 'category', 'CLOSED', LOCALTIMESTAMP - interval '10 days', NULL, NULL, NULL),
        ('missing', 'category', 'CLOSED', LOCALTIMESTAMP - interval '10 days', NULL, NULL, NULL),
        ('rejected', 'category', 'REJECTED', LOCALTIMESTAMP - interval '10 days', NULL, NULL, NULL),
        ('foreign', 'foreign', 'SUBMITTED', LOCALTIMESTAMP - interval '10 days', NULL, NULL, LOCALTIMESTAMP - interval '1 day');
      INSERT INTO request_assignment_history VALUES
        ('resolved', 'staff', LOCALTIMESTAMP - interval '10 days' + interval '2 hours'),
        ('resolved', 'replacement', LOCALTIMESTAMP - interval '10 days' + interval '8 hours');
      INSERT INTO request_status_history VALUES
        ('closed', 'ASSIGNED', LOCALTIMESTAMP - interval '10 days' + interval '4 hours'),
        ('closed', 'RESOLVED', LOCALTIMESTAMP - interval '8 days');
    `);
    db.query.mockImplementation((sql, params) => client.query(sql, params));
  }, 30000);

  afterAll(async () => {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    }
  });

  it('handles deadlines, first assignment, history fallback and missing completion data', async () => {
    const stats = await model.findDashboardStats('manager', 'department');
    expect(Number(stats.open)).toBe(2);
    expect(Number(stats.overdue)).toBe(1);
    expect(Number(stats.resolved)).toBe(1);
    expect(Number(stats.closed)).toBe(2);
    expect(Number(stats.eligible_total)).toBe(5);
    expect(Number(stats.avg_response_hours)).toBe(3);
    expect(Number(stats.sla_total)).toBe(2);
    expect(Number(stats.sla_met)).toBe(1);
  });

  it('does not aggregate another manager department', async () => {
    const stats = await model.findDashboardStats('manager', 'foreign');
    expect(Number(stats.open)).toBe(0);
    expect(stats.avg_response_hours).toBeNull();
    expect(Number(stats.sla_total)).toBe(0);
  });

  it('counts completed legacy timestamps immediately rather than hiding them as future events', async () => {
    await client.query(`INSERT INTO service_requests VALUES
      ('legacy', 'category', 'RESOLVED', LOCALTIMESTAMP - interval '10 days', NULL,
       LOCALTIMESTAMP + interval '2 hours', NULL)`);
    const stats = await model.findDashboardStats('manager', 'department');
    expect(Number(stats.sla_total)).toBe(3);
    expect(Number(stats.sla_met)).toBe(1);
  });

  it('updates counts, SLA and completion times when an overdue request resolves, closes and reopens', async () => {
    await client.query(`ALTER TABLE service_requests ADD COLUMN updated_at timestamp,
      ADD COLUMN closed_at timestamp, ADD COLUMN overdue_flag boolean;
      ALTER TABLE request_status_history ADD COLUMN old_status text, ADD COLUMN changed_by text;
      CREATE TEMP TABLE request_comments (request_id text, commented_by text, content text, created_at timestamp);
      INSERT INTO users VALUES ('staff', 'STAFF', true)`);
    // Keep model writes inside the fixture transaction so all changes roll back.
    db.pool.connect.mockResolvedValue({
      query: (sql, params) =>
        ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)
          ? Promise.resolve({ rows: [] })
          : client.query(sql, params),
      release: jest.fn(),
    });
    const detail = jest.spyOn(requestsModel, 'findById').mockResolvedValue({ id: 'open' });
    try {
      const before = await model.findDashboardStats('manager', 'department');
      await requestsModel.updateStatus('open', 'Resolved', 'Fixed');
      const resolved = await model.findDashboardStats('manager', 'department');
      expect(Number(resolved.open)).toBe(Number(before.open) - 1);
      expect(Number(resolved.overdue)).toBe(Number(before.overdue) - 1);
      expect(Number(resolved.resolved)).toBe(Number(before.resolved) + 1);
      expect(Number(resolved.sla_total)).toBe(Number(before.sla_total) + 1);
      expect(Number(resolved.sla_met)).toBe(Number(before.sla_met));
      const times = await client.query(`SELECT r.resolved_at = LOCALTIMESTAMP AS correct,
        r.overdue_flag, h.changed_at = r.resolved_at AS matching_history
        FROM service_requests r JOIN request_status_history h USING (request_id)
        WHERE r.request_id = 'open' AND h.new_status = 'RESOLVED'`);
      expect(times.rows[0]).toEqual({ correct: true, overdue_flag: false, matching_history: true });
      await requestsModel.updateStatus('open', 'Closed');
      const closed = await model.findDashboardStats('manager', 'department');
      expect(Number(closed.closed)).toBe(Number(resolved.closed) + 1);
      expect(closed.sla_total).toBe(resolved.sla_total);
      await requestsModel.updateStatus('open', 'In Progress');
      const reopened = await model.findDashboardStats('manager', 'department');
      expect(reopened.open).toBe(before.open);
      const cleared = await client.query(
        "SELECT resolved_at, closed_at FROM service_requests WHERE request_id = 'open'"
      );
      expect(cleared.rows[0]).toEqual({ resolved_at: null, closed_at: null });
    } finally {
      detail.mockRestore();
    }
  });
});
