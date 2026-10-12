jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

// Updated by Waldo on 2026-10-12: service tests now use valid UUIDs and expect staff-scoped detail reads; earlier fixtures predated those access checks.
const db = require('../../../config/database');
const usersModel = require('../../users/users.model');
const usersService = require('../../users/users.service');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');

describe('FR-207 Department-relevant Access', () => {
  const staffUserId = '22222222-2222-4222-8222-222222222222';
  const requestId = '11111111-1111-4111-8111-111111111111';
  const departmentId = 'dept-water';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('usersModel.verifyStaffRequestAccess', () => {
    it('approves access when staff belongs to the active assigned department of the request', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            request_id: requestId,
            request_department_id: departmentId,
            request_department_name: 'Water and Sanitation',
            staff_department_id: departmentId,
          },
        ],
      });

      const result = await usersModel.verifyStaffRequestAccess(staffUserId, requestId);

      expect(result.allowed).toBe(true);
      expect(result.departmentId).toBe(departmentId);
      expect(result.departmentName).toBe('Water and Sanitation');
    });

    it('denies access with clear reason when staff does not belong to the request department', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            request_id: requestId,
            request_department_id: departmentId,
            request_department_name: 'Water and Sanitation',
            staff_department_id: null,
          },
        ],
      });

      const result = await usersModel.verifyStaffRequestAccess(staffUserId, requestId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Water and Sanitation');
    });

    it('returns not found when request does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await usersModel.verifyStaffRequestAccess(staffUserId, requestId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Request not found.');
    });
  });

  describe('usersModel.findStaffDepartment', () => {
    it('returns the active assigned department for the staff member', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ departmentId, departmentName: 'Water and Sanitation' }],
      });

      const result = await usersModel.findStaffDepartment(staffUserId);

      expect(result).toEqual({ departmentId, departmentName: 'Water and Sanitation' });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE sa.staff_id = $1 AND sa.is_active = true'),
        [staffUserId]
      );
    });

    it('returns null if staff member has no active assignment', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await usersModel.findStaffDepartment(staffUserId);

      expect(result).toBeNull();
    });
  });

  describe('requestsService.getForStaff', () => {
    it('returns the request when staff member is authorized for that department', async () => {
      const mockRequest = { id: requestId, title: 'Burst Pipe' };
      jest.spyOn(usersService, 'verifyStaffRequestAccess').mockResolvedValueOnce({ allowed: true });
      jest.spyOn(requestsModel, 'findById').mockResolvedValueOnce(mockRequest);

      const result = await requestsService.getForStaff(requestId, staffUserId);

      expect(result).toBe(mockRequest);
      expect(requestsModel.findById).toHaveBeenCalledWith(requestId, undefined, staffUserId);
    });

    it('throws StaffDepartmentAccessError with 403 when staff is unauthorized', async () => {
      jest.spyOn(usersService, 'verifyStaffRequestAccess').mockResolvedValue({
        allowed: false,
        reason: 'You do not have permission to access requests for the Water department.',
      });

      await expect(requestsService.getForStaff(requestId, staffUserId)).rejects.toThrow(
        requestsService.StaffDepartmentAccessError
      );
      await expect(requestsService.getForStaff(requestId, staffUserId)).rejects.toThrow(
        'You do not have permission to access requests for the Water department.'
      );
    });
  });
});
