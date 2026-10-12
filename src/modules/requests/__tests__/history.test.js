jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const db = require('../../../config/database');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');

describe('FR-103 Requester Request History & FR-204 Staff Comments', () => {
  const requesterId = 'requester-uuid-1';
  const staffId = '22222222-2222-4222-8222-222222222222';
  const requestId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestsModel.findByRequesterId (FR-103)', () => {
    it('fetches all requests for the requester when no filters are provided', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await requestsModel.findByRequesterId(requesterId);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE r.requester_id = $1 ORDER BY r.created_at DESC'),
        [requesterId]
      );
    });

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

    it('filters by status when specified', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await requestsModel.findByRequesterId(requesterId, { status: 'In Progress' });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE r.requester_id = $1 AND r.status::text = $2'),
        [requesterId, 'IN_PROGRESS']
      );
    });

    it('combines search term and status filter', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await requestsModel.findByRequesterId(requesterId, { q: 'CC-2026', status: 'Submitted' });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(
          "WHERE r.requester_id = $1 AND (r.title ILIKE $2 ESCAPE E'\\\\' OR r.request_number ILIKE $2 ESCAPE E'\\\\') AND r.status::text = $3"
        ),
        [requesterId, '%CC-2026%', 'SUBMITTED']
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

  describe('requestsService.listForRequester and getRequesterSummaryCounts', () => {
    it('delegates listForRequester with filters to model', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            request_id: 'req-1',
            request_number: 'CC-2026-0001',
            title: 'Broken pipe',
            status: 'SUBMITTED',
            priority: 'HIGH',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const result = await requestsService.listForRequester(requesterId, { q: 'pipe' });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Broken pipe');
    });

    it('rejects unauthenticated requester ID', async () => {
      await expect(requestsService.listForRequester(null)).rejects.toThrow(
        requestsService.SubmissionUserNotFoundError
      );
      await expect(requestsService.getRequesterSummaryCounts(null)).rejects.toThrow(
        requestsService.SubmissionUserNotFoundError
      );
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

    it('enforces department access before adding a staff comment', async () => {
      const usersService = require('../../users/users.service');
      const verifySpy = jest.spyOn(usersService, 'verifyStaffRequestAccess').mockResolvedValueOnce({
        allowed: false,
        reason: 'You do not have permission to access requests for this department.',
      });

      await expect(
        requestsService.addStaffComment(requestId, staffId, 'A note from outside')
      ).rejects.toThrow(requestsService.StaffDepartmentAccessError);

      expect(verifySpy).toHaveBeenCalledWith(staffId, requestId);
      verifySpy.mockRestore();
    });
  });
});
