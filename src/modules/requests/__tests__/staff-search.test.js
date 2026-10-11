jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const db = require('../../../config/database');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');

describe('FR-203 Staff Search, Filter and Sort', () => {
  const staffUserId = 'staff-user-1';
  const departmentId = 'dept-roads';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestsModel.searchStaffRequests', () => {
    it('scopes queries by departmentId when provided', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await requestsModel.searchStaffRequests({
        staffUserId,
        departmentId,
      });

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('c.department_id = $1'), [
        departmentId,
      ]);
    });

    it('scopes queries by active staff assignments when departmentId is omitted', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await requestsModel.searchStaffRequests({ staffUserId });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'c.department_id IN (SELECT sa.department_id FROM staff_assignments sa WHERE sa.staff_id = $1 AND sa.is_active = true)'
        ),
        [staffUserId]
      );
    });

    it('applies text search filter across title, reference, description, and location', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await requestsModel.searchStaffRequests({
        staffUserId,
        departmentId,
        q: 'Main Street',
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'r.title ILIKE $2 OR r.request_number ILIKE $2 OR r.description ILIKE $2 OR r.location ILIKE $2'
        ),
        [departmentId, '%Main Street%']
      );
    });

    it('filters by status, category, and priority', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await requestsModel.searchStaffRequests({
        staffUserId,
        departmentId,
        status: 'In Progress',
        category: 'Pothole',
        priority: 'High',
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringMatching(/r\.status::text = \$2/),
        expect.arrayContaining([departmentId, 'IN_PROGRESS', 'Pothole', 'HIGH'])
      );
    });

    it('applies tab filtering for available, mine, overdue, and resolved tabs', async () => {
      // available tab
      db.query.mockResolvedValueOnce({ rows: [] });
      await requestsModel.searchStaffRequests({ staffUserId, departmentId, tab: 'available' });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(
          "r.status = 'SUBMITTED' OR (r.status = 'ASSIGNED' AND r.assigned_staff_id IS NULL)"
        ),
        expect.any(Array)
      );

      // mine tab
      db.query.mockResolvedValueOnce({ rows: [] });
      await requestsModel.searchStaffRequests({ staffUserId, departmentId, tab: 'mine' });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('r.assigned_staff_id = $'),
        expect.arrayContaining([departmentId, staffUserId])
      );

      // overdue tab
      db.query.mockResolvedValueOnce({ rows: [] });
      await requestsModel.searchStaffRequests({ staffUserId, departmentId, tab: 'overdue' });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('r.overdue_flag = true'),
        expect.any(Array)
      );

      // resolved tab
      db.query.mockResolvedValueOnce({ rows: [] });
      await requestsModel.searchStaffRequests({ staffUserId, departmentId, tab: 'resolved' });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("r.status = 'RESOLVED'"),
        expect.any(Array)
      );
    });

    it('applies sorting options for priority, date_asc, and status', async () => {
      // sort by priority
      db.query.mockResolvedValueOnce({ rows: [] });
      await requestsModel.searchStaffRequests({ staffUserId, departmentId, sort: 'priority' });
      expect(db.query.mock.calls[0][0]).toContain('CASE r.priority');

      // sort by date ascending
      db.query.mockResolvedValueOnce({ rows: [] });
      await requestsModel.searchStaffRequests({ staffUserId, departmentId, sort: 'date_asc' });
      expect(db.query.mock.calls[1][0]).toContain('ORDER BY r.created_at ASC');

      // sort by status
      db.query.mockResolvedValueOnce({ rows: [] });
      await requestsModel.searchStaffRequests({ staffUserId, departmentId, sort: 'status' });
      expect(db.query.mock.calls[2][0]).toContain('ORDER BY r.status::text ASC');
    });
  });

  describe('requestsModel.findCategoriesByDepartment', () => {
    it('queries active categories scoped to the given department', async () => {
      const mockCategories = [{ id: 'cat-1', name: 'Roads' }];
      db.query.mockResolvedValueOnce({ rows: mockCategories });

      const result = await requestsModel.findCategoriesByDepartment('dept-roads');

      expect(result).toEqual(mockCategories);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE department_id = $1 AND is_active = true'),
        ['dept-roads']
      );
    });
  });

  describe('requestsService.searchStaffRequests', () => {
    it('delegates search to requestsModel', async () => {
      jest.spyOn(requestsModel, 'searchStaffRequests').mockResolvedValueOnce([]);

      const result = await requestsService.searchStaffRequests({ staffUserId, q: 'Water' });

      expect(result).toEqual([]);
      expect(requestsModel.searchStaffRequests).toHaveBeenCalledWith({ staffUserId, q: 'Water' });
    });
  });
});
