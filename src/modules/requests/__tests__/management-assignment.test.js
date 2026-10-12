jest.mock('../../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../requests.contact-access.model', () => ({ findContext: jest.fn() }));
const { pool } = require('../../../config/database');
const contextModel = require('../requests.contact-access.model');
const assignment = require('../requests.assignment');
const requestId = '11111111-1111-4111-8111-111111111111';
const managerId = '22222222-2222-4222-8222-222222222222';
const staffId = '33333333-3333-4333-8333-333333333333';
let client;
beforeEach(() => {
  jest.clearAllMocks();
  client = {
    query: jest.fn(async (sql) => {
      if (sql.startsWith('SELECT status')) return { rows: [{ status: 'SUBMITTED' }] };
      if (sql.includes('SELECT u.user_id')) return { rows: [{ user_id: staffId }] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  contextModel.findContext.mockResolvedValue({
    manager_allowed: true,
    department_id: 'department',
    assigned_staff_id: null,
  });
});

test.each([null, managerId])(
  'assigns and replaces previous assignee %s atomically',
  async (previous) => {
    contextModel.findContext.mockResolvedValue({
      manager_allowed: true,
      department_id: 'department',
      assigned_staff_id: previous,
    });
    await assignment.assign(requestId, managerId, staffId, 'Urgent');
    const calls = client.query.mock.calls;
    expect(calls.find(([sql]) => sql.startsWith('UPDATE service_requests'))[1]).toEqual([
      requestId,
      staffId,
      managerId,
      'ASSIGNED',
      'URGENT',
    ]);
    expect(calls.some(([sql]) => sql.includes('UPDATE request_assignment_history'))).toBe(true);
    expect(
      calls.find(([sql]) => sql.includes('INSERT INTO request_assignment_history'))[1]
    ).toEqual([requestId, staffId, managerId]);
    expect(calls.some(([sql]) => sql.includes('INSERT INTO request_status_history'))).toBe(true);
    expect(calls.find(([sql]) => sql.includes('INSERT INTO admin_audit_log'))[1][4]).toContain(
      staffId
    );
    expect(calls.at(-1)[0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  }
);

test.each(['unauthorised', 'ineligible', 'terminal', 'same assignee', 'write failure'])(
  'rolls back %s without committing',
  async (reason) => {
    if (reason === 'unauthorised')
      contextModel.findContext.mockResolvedValue({ manager_allowed: false });
    if (reason === 'same assignee')
      contextModel.findContext.mockResolvedValue({
        manager_allowed: true,
        assigned_staff_id: staffId,
      });
    const original = client.query.getMockImplementation();
    client.query.mockImplementation(async (sql) => {
      if (reason === 'ineligible' && sql.includes('SELECT u.user_id')) return { rows: [] };
      if (reason === 'terminal' && sql.startsWith('SELECT status'))
        return { rows: [{ status: 'CLOSED' }] };
      if (reason === 'write failure' && sql.includes('INSERT INTO request_assignment_history'))
        throw new Error('Database failure');
      return original(sql);
    });
    await expect(assignment.assign(requestId, managerId, staffId)).rejects.toThrow();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  }
);

test('rejects malformed selections before opening a transaction', async () => {
  await expect(assignment.assign(requestId, managerId, 'bad')).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(pool.connect).not.toHaveBeenCalled();
});

test('keeps an in-progress request in progress on reassignment', async () => {
  const original = client.query.getMockImplementation();
  client.query.mockImplementation(async (sql) =>
    sql.startsWith('SELECT status') ? { rows: [{ status: 'IN_PROGRESS' }] } : original(sql)
  );
  await assignment.assign(requestId, managerId, staffId);
  expect(
    client.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE service_requests'))[1][3]
  ).toBe('IN_PROGRESS');
  expect(
    client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO request_status_history'))
  ).toBe(false);
});
