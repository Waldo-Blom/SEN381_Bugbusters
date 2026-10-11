// Opt in with REPORTING_TEST_DATABASE_URL; only temporary fixtures are written.
jest.mock('../../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
const { Client } = require('pg');
const db = require('../../src/config/database');
const model = require('../../src/modules/requests/requests.model');
const describeDatabase = process.env.REPORTING_TEST_DATABASE_URL ? describe : describe.skip;

describeDatabase('Manager request list PostgreSQL scoping', () => {
  let client;
  beforeAll(async () => {
    client = new Client({ connectionString: process.env.REPORTING_TEST_DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE users (user_id text, user_type text, is_active boolean, first_name text, last_name text);
      CREATE TEMP TABLE departments (department_id text, name text, manager_id text, is_active boolean);
      CREATE TEMP TABLE request_categories (category_id text, department_id text, name text);
      CREATE TEMP TABLE external_requesters (external_requester_id text, first_name text, last_name text);
      CREATE TEMP TABLE service_requests (request_id text, category_id text, request_number text,
        title text, status text, priority text, created_at timestamp, requester_id text, external_requester_id text);
      INSERT INTO users VALUES ('manager', 'MANAGER', true, 'Test', 'Manager'),
        ('other', 'MANAGER', true, 'Other', 'Manager'), ('citizen', 'REQUESTER', true, 'Test', 'Citizen'),
        ('empty', 'MANAGER', true, 'Empty', 'Manager'), ('inactive', 'MANAGER', false, 'Inactive', 'Manager');
      INSERT INTO departments VALUES ('own', 'Water', 'manager', true), ('foreign', 'Roads', 'other', true),
        ('empty', 'Empty department', 'empty', true), ('inactive', 'Inactive', 'inactive', true);
      INSERT INTO request_categories VALUES ('own', 'own', 'Leaks'), ('foreign', 'foreign', 'Roads');
      INSERT INTO external_requesters VALUES ('external', 'External', 'Citizen');
      INSERT INTO service_requests VALUES
        ('registered', 'own', 'CC-1', 'Leak', 'SUBMITTED', 'HIGH', '2026-01-01', 'citizen', NULL),
        ('external', 'own', 'CC-2', 'Pipe', 'IN_PROGRESS', 'MEDIUM', '2026-01-02', NULL, 'external'),
        ('foreign', 'foreign', 'CC-3', 'Road', 'CLOSED', 'LOW', '2026-01-03', 'citizen', NULL);
      ALTER TABLE request_categories ADD COLUMN is_active boolean DEFAULT true;
      INSERT INTO request_categories VALUES ('unused', 'own', 'Unused inactive', false);
      UPDATE request_categories SET is_active = false WHERE category_id = 'own';
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
  it('returns only owned requests, including registered and external requester names', async () => {
    const data = await model.findForManager('manager');
    expect(data.department).toEqual({ id: 'own', name: 'Water' });
    expect(data.requests.map((r) => r.id)).toEqual(['external', 'registered']);
    expect(data.requests.map((r) => r.requesterName)).toEqual(['External Citizen', 'Test Citizen']);
    expect(await model.findForManager('inactive')).toBeNull();
    expect(await model.findForManager('citizen')).toBeNull();
  });
  it('returns an empty list for a department with no categories or requests', async () => {
    expect(await model.findForManager('empty')).toEqual({
      department: { id: 'empty', name: 'Empty department' },
      statuses: expect.any(Array),
      categories: [],
      requests: [],
    });
  });

  it('loads enum statuses and departmental categories including historical categories', async () => {
    const data = await model.findForManager('manager');
    expect(data.statuses).toContainEqual({ value: 'REJECTED', label: 'Rejected' });
    expect(data.categories).toEqual([{ id: 'own', name: 'Leaks' }]);
  });

  it('combines status, category and search filters without losing the department', async () => {
    const data = await model.findForManager('manager', {
      status: 'IN_PROGRESS',
      category: 'own',
      q: 'CC-2',
    });
    expect(data.requests.map((r) => r.id)).toEqual(['external']);
    expect((await model.findForManager('manager', { status: 'CLOSED' })).requests).toEqual([]);
    expect((await model.findForManager('manager', { category: 'foreign' })).requests).toEqual([]);
    expect((await model.findForManager('manager', { q: '%' })).requests).toEqual([]);
    expect((await model.findForManager('manager', { q: "' OR 1=1 --" })).requests).toEqual([]);
    expect(
      (await model.findForManager('manager', { q: 'pipe' })).requests.map((r) => r.id)
    ).toEqual(['external']);
  });
});
