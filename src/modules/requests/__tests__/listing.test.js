jest.mock('../../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
// Request listing coverage follows the data path from requester history and
// comments through manager/staff lists and their filtering behavior.
describe('Requester history and staff comments', () => {
  const db = require('../../../config/database');
  const requestsModel = require('../requests.model');

  describe('FR-103 Requester Request History & FR-204 Staff Comments', () => {
    const requesterId = 'requester-uuid-1';
    const staffId = '22222222-2222-4222-8222-222222222222';
    const requestId = '11111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('requestsModel.findByRequesterId (FR-103)', () => {
      it('filters by search term across title and request number', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });

        await requestsModel.findByRequesterId(requesterId, { q: 'Pothole' });

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining(
            "WHERE r.requester_id = $1 AND (r.title ILIKE $2 ESCAPE E'\\\\' OR r.request_number ILIKE $2 ESCAPE E'\\\\')"
          ),
          [requesterId, '%Pothole%']
        );
      });
    });

    describe('requestsModel.getRequesterSummaryCounts (FR-103)', () => {
      it('aggregates status counts for the requester', async () => {
        db.query.mockResolvedValueOnce({
          rows: [
            {
              total: 10,
              submitted: 3,
              in_progress: 4,
              resolved: 2,
              closed: 1,
            },
          ],
        });

        const counts = await requestsModel.getRequesterSummaryCounts(requesterId);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT \n      COUNT(*)::int AS total'),
          [requesterId]
        );
        expect(counts).toEqual({
          total: 10,
          submitted: 3,
          inProgress: 4,
          resolved: 2,
          closed: 1,
        });
      });
    });

    describe('Staff Comments (FR-204)', () => {
      it('inserts a comment into request_comments and updates request timestamp', async () => {
        db.query
          .mockResolvedValueOnce({
            rows: [{ comment_id: 'comm-1', content: 'Inspected location', created_at: new Date() }],
          })
          .mockResolvedValueOnce({ rowCount: 1 });

        const comment = await requestsModel.addComment(
          requestId,
          staffId,
          'Inspected location',
          'NOTE'
        );

        expect(db.query).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('INSERT INTO request_comments'),
          [requestId, staffId, 'NOTE', 'Inspected location']
        );
        expect(db.query).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('UPDATE service_requests SET updated_at = LOCALTIMESTAMP'),
          [requestId]
        );
        expect(comment.comment_id).toBe('comm-1');
      });
    });
  });
});

describe('Manager department request list', () => {
  const path = require('path');
  const express = require('express');
  const request = require('supertest');
  const { query } = require('../../../config/database');
  const routes = require('../requests.routes');
  const service = require('../requests.service');

  const manager = {
    id: 'manager-id',
    email: 'manager@example.com',
    role: 'management',
    name: 'Manager',
    avatarInitials: 'TM',
    departmentId: 'stale',
  };
  const appFor = (user) => {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', [
      path.join(__dirname, '../..'),
      path.join(__dirname, '../../../shared/views'),
    ]);
    app.use((req, res, next) => {
      req.session = { user };
      next();
    });
    app.use(routes);
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => res.status(500).send('Unable to load requests.'));
    return app;
  };

  describe('Manager department request list', () => {
    beforeEach(() => query.mockReset());

    it.each([
      [null, 401],
      [{ ...manager, role: 'staff' }, 403],
      [{ ...manager, role: 'requester' }, 403],
    ])('denies unauthorised access', async (user, status) => {
      expect((await request(appFor(user)).get('/manager/requests')).status).toBe(status);
      expect(query).not.toHaveBeenCalled();
    });

    it.each([{ status: 'INVALID' }, { category: 'foreign' }])(
      'rejects invalid or foreign-department filter selections',
      async (filters) => {
        query.mockResolvedValue({
          rows: [
            {
              department_id: 'own',
              department_name: 'Water',
              request_id: null,
              statuses: ['SUBMITTED'],
              categories: [{ id: 'own', name: 'Leaks' }],
            },
          ],
        });
        expect(
          (await request(appFor(manager)).get('/manager/requests').query(filters)).status
        ).toBe(400);
      }
    );

    it.each([{ status: ['SUBMITTED', 'CLOSED'] }, { q: 'x'.repeat(201) }])(
      'rejects malformed filters before querying',
      async (filters) => {
        await expect(service.listForManager(manager.id, filters)).rejects.toThrow('Please correct');
        expect(query).not.toHaveBeenCalled();
      }
    );
  });
});

describe('Staff request search and filtering', () => {
  const db = require('../../../config/database');
  const requestsModel = require('../requests.model');

  describe('FR-203 Staff Search, Filter and Sort', () => {
    const staffUserId = 'staff-user-1';
    const departmentId = 'dept-roads';

    beforeEach(() => {
      jest.clearAllMocks();
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
          'r.title ILIKE $3 OR r.request_number ILIKE $3 OR r.description ILIKE $3 OR r.location ILIKE $3'
        ),
        [departmentId, staffUserId, '%Main Street%', staffUserId]
      );
      expect(db.query.mock.calls[0][0]).toContain(
        '(r.assigned_staff_id IS NULL OR r.assigned_staff_id = $4)'
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
        expect.stringMatching(/r\.status::text = \$3/),
        expect.arrayContaining([departmentId, 'IN_PROGRESS', 'Pothole', 'HIGH'])
      );
    });

    it('applies tab filtering for available, mine, overdue, and resolved tabs', async () => {
      // The default tab includes the member's work and requests still available to claim.
      db.query.mockResolvedValueOnce({ rows: [] });
      await requestsModel.searchStaffRequests({ staffUserId, departmentId, tab: 'all' });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('(r.assigned_staff_id IS NULL OR r.assigned_staff_id = $3)'),
        [departmentId, staffUserId, staffUserId]
      );

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
});
