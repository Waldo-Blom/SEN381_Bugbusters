// Browser-like journeys through the complete Express route, middleware, service,
// view and session stack. The storage model is deterministic and isolated.
jest.mock('../../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../../src/modules/requests/requests.model', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findCategories: jest.fn(),
  findActiveCategory: jest.fn(),
  findExternalRequesterById: jest.fn(),
  searchExternalRequesters: jest.fn(),
  create: jest.fn(),
  findByRequesterId: jest.fn(),
  findByCreatorId: jest.fn(),
  getRequesterSummaryCounts: jest.fn(),
}));
jest.mock('../../src/modules/auth/auth.service', () => ({
  createRequester: jest.fn(),
  authenticate: jest.fn(),
}));
jest.mock('../../src/modules/requests/requests.contact-access.model', () => ({
  findContext: jest.fn(),
}));
const request = require('supertest');
const app = require('../../src/app');
const model = require('../../src/modules/requests/requests.model');
const auth = require('../../src/modules/auth/auth.service');
const categoryId = '11111111-1111-4111-8111-111111111111';

describe('Critical requester journeys', () => {
  let records;
  beforeEach(() => {
    jest.clearAllMocks();
    records = [];
    auth.authenticate.mockResolvedValue({
      id: 'journey-requester',
      name: 'Jamie Citizen',
      email: 'jamie@example.test',
      role: 'requester',
      departmentId: null,
    });
    model.findCategories.mockResolvedValue([{ id: categoryId, name: 'Roads' }]);
    model.findActiveCategory.mockResolvedValue({ id: categoryId, name: 'Roads' });
    model.create.mockImplementation(async (input, nextReference) => {
      const reference = nextReference(2026, records.length + 1);
      const entry = {
        id: 'journey-request',
        requesterId: input.requesterId,
        reference,
        title: input.title,
        description: input.description,
        location: input.location,
        category: 'Roads',
        status: 'Submitted',
        priority: 'Medium',
        submittedAt: '2026-10-12 09:00',
        comments: [],
        timeline: [],
      };
      records.push(entry);
      return {
        request_id: entry.id,
        request_number: reference,
        category_id: categoryId,
        category_name: 'Roads',
        title: entry.title,
        description: entry.description,
        location: entry.location,
        status: 'SUBMITTED',
        priority: 'MEDIUM',
        created_at: new Date('2026-10-12T09:00:00Z'),
      };
    });
    model.findByRequesterId.mockImplementation(async (id) =>
      records.filter((r) => r.requesterId === id)
    );
    model.getRequesterSummaryCounts.mockResolvedValue({ submitted: 1, inProgress: 0, resolved: 0 });
    model.findById.mockImplementation(
      async (_id, requesterId) => records.find((r) => r.requesterId === requesterId) || null
    );
  });

  it('registers, signs in, submits a report, and tracks its generated reference', async () => {
    auth.createRequester.mockResolvedValue({
      user_id: 'journey-requester',
      first_name: 'Jamie',
      last_name: 'Citizen',
      email: 'jamie@example.test',
    });
    const browser = request.agent(app);
    const registration = await browser.post('/auth/register').type('form').send({
      firstName: 'Jamie',
      lastName: 'Citizen',
      email: 'jamie@example.test',
      password: 'SecurePass1',
      terms: 'on',
    });
    expect([302, 200]).toContain(registration.status);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: 'jamie@example.test', password: 'SecurePass1' });
    const submission = await browser.post('/requester/submit').type('form').send({
      categoryId,
      title: 'Street light out',
      description: 'The light is not working.',
      location: 'Oak Street',
    });
    expect(submission.status).toBe(302);
    const listing = await browser.get('/requester/my-requests');
    expect(listing.status).toBe(200);
    expect(listing.text).toContain('CC-2026-0001');
    expect(listing.text).toContain('Street light out');
    const detail = await browser.get('/requester/requests/journey-request');
    expect(detail.status).toBe(200);
    expect(detail.text).toContain('Submitted');
  });
});
