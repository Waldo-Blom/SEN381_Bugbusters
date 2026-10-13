// Exercise workflow services with the transaction/model boundary connected to
// a transaction-aware in-memory PostgreSQL client. Real PostgreSQL coverage is
// provided by staff-access.integration.test.js when its test DB is configured.
jest.mock('../../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));

const db = require('../../src/config/database');
const requestsModel = require('../../src/modules/requests/requests.model');
const requestsService = require('../../src/modules/requests/requests.service');
const workflowService = require('../../src/modules/workflow/workflow.service');
const requestId = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';

const useTransaction = (status, assignedStaffId = null) => {
  const stored = { status, assignedStaffId };
  const history = [];
  const assignmentHistory = [];
  const client = {
    query: jest.fn(async (sql, params = []) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT status, assigned_staff_id')) {
        return { rows: [{ status: stored.status, assigned_staff_id: stored.assignedStaffId }] };
      }
      if (sql.includes('SELECT status FROM service_requests')) return { rows: [{ status: stored.status }] };
      if (sql.includes('UPDATE service_requests') && sql.includes('assigned_staff_id')) {
        stored.assignedStaffId = params[0];
        stored.status = params[2];
      } else if (sql.includes('UPDATE service_requests')) {
        stored.status = params[0];
      }
      if (sql.includes('INSERT INTO request_assignment_history')) assignmentHistory.push(params);
      if (sql.includes('INSERT INTO request_status_history')) history.push(params);
      if (sql.includes('SELECT r.assigned_staff_id')) {
        return { rows: [{ assigned_staff_id: stored.assignedStaffId, status: stored.status,
          contact_information_approved: false, staff_allowed: true }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  db.pool.connect.mockResolvedValue(client);
  return { client, stored, history, assignmentHistory };
};

describe('Request workflow integration', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('FR-201 assigns an unassigned request and persists assignment and status history', async () => {
    const { client, stored, history, assignmentHistory } = useTransaction('SUBMITTED');
    db.query.mockResolvedValue({ rows: [{ status: 'SUBMITTED', request_department_id: 'roads',
      request_department_name: 'Roads', staff_department_id: 'roads' }] });
    jest.spyOn(requestsService, 'checkStaffAccess').mockResolvedValue({ allowed: true });
    const result = await workflowService.assignToSelf(requestId, staffId);
    expect(result).toMatchObject({ status: 'ASSIGNED', assignedStaffId: staffId });
    expect(stored).toEqual({ status: 'ASSIGNED', assignedStaffId: staffId });
    expect(assignmentHistory).toHaveLength(1);
    expect(history).toHaveLength(1);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('FR-202 persists an allowed transition and its lifecycle history', async () => {
    const { client, stored, history } = useTransaction('ASSIGNED', staffId);
    jest.spyOn(requestsModel, 'findById').mockResolvedValue({ id: requestId, status: 'In Progress' });
    db.query.mockResolvedValue({ rows: [{ request_id: requestId }] });
    const result = await requestsModel.updateStatus(requestId, 'In Progress', null, staffId);
    expect(stored.status).toBe('IN_PROGRESS');
    expect(history).toHaveLength(1);
    expect(history[0].slice(0, 4)).toEqual([requestId, 'ASSIGNED', 'IN_PROGRESS', staffId]);
    expect(result).toMatchObject({ id: requestId, status: 'In Progress' });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('FR-204 rejects resolution without a comment before persistence or history writes', async () => {
    const service = requestsService.workflow;
    jest.spyOn(requestsModel, 'findById').mockResolvedValue({ id: requestId, status: 'In Progress' });
    const update = jest.spyOn(requestsModel, 'updateStatus');
    await expect(service.transitionRequest(requestId, 'Resolved', staffId, '')).rejects.toMatchObject({
      statusCode: 400,
      message: 'A resolution comment is required to resolve a request.',
    });
    expect(update).not.toHaveBeenCalled();
    expect(db.pool.connect).not.toHaveBeenCalled();
  });
});
