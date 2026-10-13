const workflowModel = require('../workflow.model');
const workflowRules = require('../workflow.rules');
const workflowService = require('../workflow.service');
const db = require('../../../config/database');

jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

describe('FR-201 Staff Ticket Assignment (assignToSelf)', () => {
  const dummyRequestId = '4caa19cd-a58f-a322-5079-4943dc088673';
  const dummyStaffId = 'deead837-fbf7-718c-e039-a59989ed9ccc';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('workflowRules.canAssignToSelf', () => {
    test('rejects when request ID is missing', async () => {
      const res = await workflowRules.canAssignToSelf(null, dummyStaffId);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Request ID is required');
    });

    test('rejects when staff user ID is missing', async () => {
      const res = await workflowRules.canAssignToSelf(dummyRequestId, null);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Staff User ID is required');
    });

    test('rejects when request is in terminal status (e.g. RESOLVED)', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            status: 'RESOLVED',
            request_department_id: 'dept-roads',
            request_department_name: 'Roads and Transport',
            staff_department_id: 'dept-roads',
          },
        ],
      });

      const res = await workflowRules.canAssignToSelf(dummyRequestId, dummyStaffId);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Cannot assign request in terminal status');
    });

    test('approves when staff member is in the same department and request is active', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            status: 'SUBMITTED',
            request_department_id: 'dept-roads',
            request_department_name: 'Roads and Transport',
            staff_department_id: 'dept-roads',
          },
        ],
      });

      const res = await workflowRules.canAssignToSelf(dummyRequestId, dummyStaffId);
      expect(res.allowed).toBe(true);
    });
  });

  describe('workflowModel.assignToStaff', () => {
    test('updates service_requests, inserts into assignment_history and status_history on SUBMITTED', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      db.pool.connect.mockResolvedValue(mockClient);

      // 1. SELECT request
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        rows: [{ status: 'SUBMITTED', assigned_staff_id: null }],
      }); // SELECT FOR UPDATE
      mockClient.query.mockResolvedValueOnce({ rows: [{ staff_allowed: true }] }); // Active department membership
      mockClient.query.mockResolvedValueOnce({}); // UPDATE service_requests
      mockClient.query.mockResolvedValueOnce({}); // INSERT request_assignment_history
      mockClient.query.mockResolvedValueOnce({}); // INSERT request_status_history
      mockClient.query.mockResolvedValueOnce({}); // COMMIT

      const res = await workflowModel.assignToStaff(dummyRequestId, dummyStaffId);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(res.status).toBe('ASSIGNED');
      expect(res.assignedStaffId).toBe(dummyStaffId);
      expect(mockClient.release).toHaveBeenCalled();

      // Check UPDATE service_requests
      const updateCall = mockClient.query.mock.calls.find(
        (c) => c[0] && c[0].includes('UPDATE service_requests')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toContain(dummyStaffId);
      expect(updateCall[1]).toContain('ASSIGNED');

      // Check request_assignment_history
      const historyCall = mockClient.query.mock.calls.find(
        (c) => c[0] && c[0].includes('INSERT INTO request_assignment_history')
      );
      expect(historyCall).toBeDefined();
      expect(historyCall[1]).toContain(dummyRequestId);
      expect(historyCall[1]).toContain(dummyStaffId);
    });
  });

  describe('workflowService.assignToSelf', () => {
    test('throws AssignmentAuthorizationError when department check fails', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              status: 'SUBMITTED',
              request_department_id: 'dept-roads',
              request_department_name: 'Roads and Transport',
              staff_department_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ name: 'Waste Management' }],
        });

      await expect(workflowService.assignToSelf(dummyRequestId, dummyStaffId)).rejects.toThrow(
        workflowService.AssignmentAuthorizationError
      );
    });

    test('successfully executes assignment when valid', async () => {
      // 1. Validation query
      db.query.mockResolvedValueOnce({
        rows: [
          {
            status: 'SUBMITTED',
            request_department_id: 'dept-roads',
            request_department_name: 'Roads and Transport',
            staff_department_id: 'dept-roads',
          },
        ],
      });

      // 2. Transaction queries
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      db.pool.connect.mockResolvedValue(mockClient);
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        rows: [{ status: 'SUBMITTED', assigned_staff_id: null }],
      }); // SELECT
      mockClient.query.mockResolvedValueOnce({ rows: [{ staff_allowed: true }] }); // Active department membership
      mockClient.query.mockResolvedValueOnce({}); // UPDATE
      mockClient.query.mockResolvedValueOnce({}); // INSERT history
      mockClient.query.mockResolvedValueOnce({}); // INSERT status history
      mockClient.query.mockResolvedValueOnce({}); // COMMIT

      const res = await workflowService.assignToSelf(dummyRequestId, dummyStaffId);
      expect(res.status).toBe('ASSIGNED');
      expect(res.assignedStaffId).toBe(dummyStaffId);
    });
  });
});
