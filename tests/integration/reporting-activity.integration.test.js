// Opt in with REPORTING_TEST_DATABASE_URL. Fixtures are temporary and rolled back.
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const { Client } = require('pg');
const db = require('../../src/config/database');
const model = require('../../src/modules/reporting/reporting.model');
const describeDatabase = process.env.REPORTING_TEST_DATABASE_URL ? describe : describe.skip;
const manager = '11111111-1111-4111-8111-111111111111';
const staff = '22222222-2222-4222-8222-222222222222';

describeDatabase('Reporting activity against PostgreSQL', () => {
  let client;
  beforeAll(async () => {
    client = new Client({ connectionString: process.env.REPORTING_TEST_DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE users (user_id uuid, user_type text, is_active boolean, first_name text, last_name text);
      CREATE TEMP TABLE departments (department_id text, manager_id uuid, is_active boolean);
      CREATE TEMP TABLE request_categories (category_id text, department_id text, name text);
      CREATE TEMP TABLE service_requests (request_id uuid, category_id text, request_number text, title text,
        status text, priority text, created_at timestamp, created_by uuid);
      CREATE TEMP TABLE request_status_history (request_id uuid, status_history_id uuid, changed_at timestamp,
        changed_by uuid, new_status text);
      CREATE TEMP TABLE request_assignment_history (request_id uuid, assignment_history_id uuid,
        assigned_at timestamp, assigned_by_id uuid, assigned_to_staff_id uuid);
      CREATE TEMP TABLE request_comments (request_id uuid, comment_id uuid, created_at timestamp,
        commented_by uuid, comment_type text, is_deleted boolean);
      INSERT INTO users VALUES
        ('${manager}', 'MANAGER', true, 'Test', 'Manager'), ('${staff}', 'STAFF', true, 'Test', 'Staff');
      INSERT INTO departments VALUES ('department', '${manager}', true), ('foreign', '${staff}', true);
      INSERT INTO request_categories VALUES ('category', 'department', 'Water'), ('foreign', 'foreign', 'Roads');
      INSERT INTO service_requests VALUES
        ('33333333-3333-4333-8333-333333333333', 'category', 'CC-1', 'Water leak', 'IN_PROGRESS', 'HIGH', '2026-01-01', '${manager}'),
        ('44444444-4444-4444-8444-444444444444', 'foreign', 'CC-2', 'Foreign request', 'SUBMITTED', 'LOW', '2026-01-10', '${staff}');
      INSERT INTO request_status_history VALUES
        ('33333333-3333-4333-8333-333333333333', gen_random_uuid(), '2026-01-02', '${staff}', 'IN_PROGRESS');
      INSERT INTO request_assignment_history VALUES
        ('33333333-3333-4333-8333-333333333333', gen_random_uuid(), '2026-01-03', '${manager}', '${staff}');
      INSERT INTO request_comments VALUES
        ('33333333-3333-4333-8333-333333333333', gen_random_uuid(), '2026-01-04', '${staff}', 'NOTE', false),
        ('33333333-3333-4333-8333-333333333333', gen_random_uuid(), '2026-01-09', '${staff}', 'RESOLUTION', true);
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

  it('combines all four event sources, excludes deleted comments and foreign requests', async () => {
    const events = await model.findRecentActivity(manager, 'department');
    expect(events.map((event) => event.event_type)).toEqual([
      'comment',
      'assignment',
      'status',
      'submission',
    ]);
    expect(events[0].timestamp).toBe('2026-01-04 02:00');
    expect(events[0].actor).toBe('Test Staff');
    expect(events[1].assignee).toBe('Test Staff');
    expect(events.every((event) => event.reference === 'CC-1')).toBe(true);
    expect(await model.findRecentActivity(manager, 'foreign')).toEqual([]);
  });

  it('limits the feed to ten events and orders timestamp ties deterministically', async () => {
    await client.query(`INSERT INTO request_comments
      SELECT '33333333-3333-4333-8333-333333333333'::uuid, gen_random_uuid(),
        '2026-02-01'::timestamp, '${staff}'::uuid, 'NOTE', false FROM generate_series(1, 12)`);
    const first = await model.findRecentActivity(manager, 'department');
    const second = await model.findRecentActivity(manager, 'department');
    expect(first).toHaveLength(10);
    expect(first.every((event) => event.timestamp === '2026-02-01 02:00')).toBe(true);
    expect(first).toEqual(second);
  });
});
