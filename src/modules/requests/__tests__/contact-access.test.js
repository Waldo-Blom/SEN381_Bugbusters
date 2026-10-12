jest.mock('../../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../requests.contact-access.model');

const model = require('../requests.contact-access.model');
const service = require('../requests.contact-access.service');
const { getCsrfToken, requireCsrf } = require('../../../shared/middleware/csrf.middleware');
const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';

beforeEach(() => jest.resetAllMocks());

it.each(['', '   ', [], {}, 'x'.repeat(1001)])(
  'rejects invalid contact request reasons',
  async (reason) => {
    await expect(service.requestAccess(id, actor, reason)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(model.createRequest).not.toHaveBeenCalled();
  }
);

it('uses a server-side default reason for the small request button', async () => {
  model.createRequest.mockResolvedValue({ status: 'PENDING' });
  await service.requestAccess(id, actor);
  expect(model.createRequest).toHaveBeenCalledWith(id, actor, expect.stringContaining('clarify'));
});

it('validates identifiers before touching the database', async () => {
  await expect(service.requestAccess('invalid', actor)).rejects.toMatchObject({ statusCode: 400 });
  await expect(service.reviewAccess(id, 'invalid', true)).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(model.createRequest).not.toHaveBeenCalled();
  expect(model.reviewRequest).not.toHaveBeenCalled();
});

it('does not interpret a string decision as approval', async () => {
  await expect(service.reviewAccess(id, actor, 'false')).rejects.toMatchObject({ statusCode: 400 });
  await expect(service.changeApproval(id, actor, 'false')).rejects.toMatchObject({
    statusCode: 400,
  });
});

it('requires database-backed manager ownership for detail reads', async () => {
  model.findContext.mockResolvedValue({ manager_allowed: false });
  await expect(service.getForManager(id, actor)).rejects.toMatchObject({ statusCode: 403 });
  model.findContext.mockResolvedValue(null);
  await expect(service.getForManager(id, actor)).rejects.toMatchObject({ statusCode: 404 });
});

it('maps inbox rows without requester contact data', async () => {
  model.findInbox.mockResolvedValue([
    {
      id,
      request_id: id,
      reference: 'CC-1',
      title: 'Water leak',
      staff_name: 'Assigned Staff',
      reason: 'Clarification',
      requested_at: '2026-10-11T08:00:00Z',
      status: 'REJECTED',
      can_review: false,
    },
  ]);
  const inbox = await service.listInbox(actor, id);
  expect(inbox[0]).toMatchObject({
    status: 'Rejected',
    canReview: false,
    staffName: 'Assigned Staff',
  });
  expect(inbox[0]).not.toHaveProperty('requesterEmail');
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
