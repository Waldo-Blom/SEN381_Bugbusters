jest.mock('../../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
// These tests protect the contact-access workflow, department authorization,
// and staff detail privacy at their respective service/model/HTTP boundaries.
describe('Contact access', () => {
  const model = require('../requests.contact-access.model');
  const service = require('../requests.contact-access.service');
  const { getCsrfToken, requireCsrf } = require('../../../shared/middleware/csrf.middleware');
  const id = '11111111-1111-4111-8111-111111111111';
  const actor = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(model, 'createRequest');
    jest.spyOn(model, 'reviewRequest');
    jest.spyOn(model, 'changeApproval');
    jest.spyOn(model, 'findContext');
    jest.spyOn(model, 'findInbox');
  });

  afterEach(() => jest.restoreAllMocks());

  // Reject blank, wrong-shaped, and overlong reasons before they become persisted requests.
  it.each(['', '   ', [], {}, 'x'.repeat(1001)])(
    'rejects invalid contact request reasons',
    async (reason) => {
      await expect(service.requestAccess(id, actor, reason)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(model.createRequest).not.toHaveBeenCalled();
    }
  );

  it('requires database-backed manager ownership for detail reads', async () => {
    model.findContext.mockResolvedValue({ manager_allowed: false });
    await expect(service.getForManager(id, actor)).rejects.toMatchObject({ statusCode: 403 });
    model.findContext.mockResolvedValue(null);
    await expect(service.getForManager(id, actor)).rejects.toMatchObject({ statusCode: 404 });
  });

  
  it('creates a session CSRF token and only accepts a matching form token', () => {
    const req = { session: {}, body: {} };
    const token = getCsrfToken(req);
    expect(token).toHaveLength(64);
    expect(getCsrfToken(req)).toBe(token);
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    requireCsrf(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    req.body._csrf = token;
    requireCsrf(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    req.body._csrf = 'x'.repeat(64);
    requireCsrf(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('Department access', () => {
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

    afterEach(() => jest.restoreAllMocks());

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

    });

    describe('requestsService.getForStaff', () => {
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
});

describe('Staff request access and privacy', () => {
  const express = require('express');
  const supertest = require('supertest');
  const path = require('path');
  const ejs = require('ejs');
  const db = require('../../../config/database');
  const model = require('../requests.model');
  const service = require('../requests.service');
  const routes = require('../requests.routes');

  const requestId = '11111111-1111-4111-8111-111111111111';
  const staffId = '22222222-2222-4222-8222-222222222222';
  const otherId = '33333333-3333-4333-8333-333333333333';
  const context = {
    staff_allowed: true,
    assigned_staff_id: staffId,
    contact_information_approved: false,
  };
  const row = {
    request_id: requestId,
    request_number: 'CC-2026-0001',
    title: 'Broken pipe',
    description: 'Repair required',
    status: 'ASSIGNED',
    priority: 'MEDIUM',
    department_name: 'Water',
    category_name: 'Leaks',
    assigned_to_name: 'Assigned Staff',
    requester_name: 'Private Citizen',
    requester_email: 'private@example.com',
    requester_phone: '0123456789',
    ...context,
  };

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: { id: staffId, email: 'staff@example.com', role: 'staff' } };
    next();
  });
  app.use(routes);

  beforeEach(() => jest.resetAllMocks());

 
  it('returns HTTP 404 for a missing request and HTTP 400 for malformed IDs', async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect((await supertest(app).get(`/staff/requests/${requestId}`)).status).toBe(404);
    expect((await supertest(app).get('/staff/requests/invalid')).status).toBe(400);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  // Contact details require both explicit approval and the current staff member's assignment.
  it.each([
    [false, staffId, false],
    [true, otherId, false],
    [true, staffId, true],
  ])(
    'requires approval=%s and matching assignee=%s for contact visibility',
    async (approved, assignee, visible) => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            {
              request_department_id: 'dept-water',
              request_department_name: 'Water',
              staff_department_id: 'dept-water',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              ...row,
              staff_allowed: true,
              assigned_staff_id: assignee,
              contact_information_approved: approved,
            },
          ],
        })
        .mockResolvedValue({ rows: [] });
      const result = await service.getForStaff(requestId, staffId);
      expect(result.canViewContact).toBe(visible);
      expect(result.canManageStatus).toBe(assignee === staffId);
      if (!visible)
        expect(JSON.stringify(result)).not.toMatch(
          /Private Citizen|private@example.com|0123456789/
        );
      const sql = db.query.mock.calls[1][0];
      expect(sql).toContain('r.contact_information_approved = true AND r.assigned_staff_id = $2');
      expect(sql).toContain('viewer.is_active = true');
      expect(db.query.mock.calls[1][1]).toEqual([requestId, staffId]);
    }
  );
});
