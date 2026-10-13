// Black-box functional scenarios exercise real Express routes, middleware,
// validation, service orchestration, rendered pages, and session behavior.
// Persistence is stubbed at the model boundary to keep the suite isolated.
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
const otherCategoryId = '22222222-2222-4222-8222-222222222222';
const requester = {
  id: 'requester-one',
  name: 'Jamie Citizen',
  email: 'jamie@example.test',
  role: 'requester',
  departmentId: null,
};

const validSubmission = {
  categoryId,
  title: 'Pothole on Oak Street',
  description: 'A large pothole needs repair.',
  location: '12 Oak Street',
  priority: 'HIGH',
};

describe('Request workflows — black-box functional tests', () => {
  let records;
  beforeEach(() => {
    jest.clearAllMocks();
    records = [];
    auth.authenticate.mockImplementation(async (email, password) =>
      email === 'jamie@example.test' && password === 'SecurePass1' ? requester : null
    );
    auth.createRequester.mockResolvedValue({
      user_id: requester.id,
      first_name: 'Jamie',
      last_name: 'Citizen',
      email: requester.email,
    });
    model.findCategories.mockResolvedValue([{ id: categoryId, name: 'Roads' }]);
    model.findActiveCategory.mockImplementation(async (id) =>
      id === categoryId ? { id, name: 'Roads' } : null
    );
    model.create.mockImplementation(async (input, makeReference) => {
      const reference = makeReference(2026, records.length + 1);
      const item = {
        id: `request-${records.length + 1}`,
        requesterId: input.requesterId,
        reference,
        title: input.title,
        description: input.description,
        location: input.location,
        category: 'Roads',
        status: 'Submitted',
        priority: input.priority === 'HIGH' ? 'High' : 'Medium',
        submittedAt: '2026-10-12 09:00',
        comments: [],
        timeline: [],
      };
      records.push(item);
      return {
        request_id: item.id,
        request_number: reference,
        category_id: categoryId,
        category_name: 'Roads',
        title: item.title,
        description: item.description,
        location: item.location,
        status: 'SUBMITTED',
        priority: input.priority,
        created_at: new Date('2026-10-12T09:00:00Z'),
      };
    });
    model.findByRequesterId.mockImplementation(async (id, filters) =>
      records.filter(
        (item) =>
          item.requesterId === id &&
          (!filters?.q ||
            `${item.reference} ${item.title}`.toLowerCase().includes(filters.q.toLowerCase()))
      )
    );
    model.getRequesterSummaryCounts.mockResolvedValue({ submitted: 1, inProgress: 0, resolved: 0 });
  });

  it('FR-101 accepts valid details once and returns a unique request reference', async () => {
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: requester.email, password: 'SecurePass1' });
    const response = await browser.post('/requester/submit').type('form').send(validSubmission);
    expect(response.status).toBe(302);
    const history = await browser.get('/requester/my-requests');
    expect(history.status).toBe(200);
    expect(history.text).toMatch(/CC-2026-\d{4}/);
    expect(records).toHaveLength(1);
    expect(model.create).toHaveBeenCalledTimes(1);
  });

  it('FR-101 rejects every missing required field and an unsupported category', async () => {
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: requester.email, password: 'SecurePass1' });
    const required = ['categoryId', 'title', 'description', 'location'];
    for (const field of required) {
      const response = await browser
        .post('/requester/submit')
        .type('form')
        .send({
          ...validSubmission,
          [field]: '',
        });
      expect(response.status).toBe(400);
      expect(response.text).toMatch(
        /Please select a category|Please enter a title|Please enter a description|Please enter a location/
      );
    }
    const unsupported = await browser
      .post('/requester/submit')
      .type('form')
      .send({
        ...validSubmission,
        categoryId: otherCategoryId,
      });
    expect(unsupported.status).toBe(400);
    expect(model.create).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });

  it('FR-102 shows a known reference and status, and returns an empty safe result for an unknown reference', async () => {
    records.push({
      id: 'request-known',
      requesterId: requester.id,
      reference: 'CC-2026-0042',
      title: 'Street light out',
      description: 'Dark at night',
      location: 'Oak Street',
      category: 'Roads',
      status: 'In Progress',
      priority: 'Medium',
      submittedAt: '2026-10-12 09:00',
      comments: [],
      timeline: [],
    });
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: requester.email, password: 'SecurePass1' });
    const known = await browser.get('/requester/my-requests?q=CC-2026-0042');
    expect(known.status).toBe(200);
    expect(known.text).toContain('CC-2026-0042');
    expect(known.text).toContain('In Progress');
    const unknown = await browser.get('/requester/my-requests?q=CC-2099-9999');
    expect(unknown.status).toBe(200);
    expect(unknown.text).toContain('No requests found');
    expect(unknown.text).not.toContain('Street light out');
  });

  it('FR-103 limits history to its signed-in requester and denies signed-out access', async () => {
    records.push(
      {
        id: 'own',
        requesterId: requester.id,
        reference: 'CC-2026-0001',
        title: 'My request',
        category: 'Roads',
        status: 'Submitted',
        priority: 'Medium',
        submittedAt: '2026-10-12 09:00',
        comments: [],
        timeline: [],
      },
      {
        id: 'other',
        requesterId: 'requester-two',
        reference: 'CC-2026-0002',
        title: 'Private request',
        category: 'Roads',
        status: 'Submitted',
        priority: 'Medium',
        submittedAt: '2026-10-12 09:00',
        comments: [],
        timeline: [],
      }
    );
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: requester.email, password: 'SecurePass1' });
    const ownHistory = await browser.get('/requester/my-requests');
    expect(ownHistory.status).toBe(200);
    expect(ownHistory.text).toContain('My request');
    expect(ownHistory.text).not.toContain('Private request');
    const signedOut = await request(app).get('/requester/my-requests');
    expect([302, 401]).toContain(signedOut.status);
    expect(model.findByRequesterId).toHaveBeenCalledWith(requester.id);
  });

  it('FR-105 registers a requester, accepts valid credentials, and rejects an incorrect password', async () => {
    const registrationBrowser = request.agent(app);
    const registration = await registrationBrowser.post('/auth/register').type('form').send({
      firstName: 'Jamie',
      lastName: 'Citizen',
      email: requester.email,
      password: 'SecurePass1',
      terms: 'on',
    });
    expect(registration.status).toBe(302);
    expect(auth.createRequester).toHaveBeenCalledTimes(1);

    const validLogin = await request.agent(app).post('/auth/login').type('form').send({
      email: requester.email,
      password: 'SecurePass1',
    });
    expect(validLogin.status).toBe(302);
    expect(validLogin.headers.location).toBe('/requester/my-requests');

    const invalidBrowser = request.agent(app);
    const invalidLogin = await invalidBrowser.post('/auth/login').type('form').send({
      email: requester.email,
      password: 'WrongPass1',
    });
    expect(invalidLogin.status).toBe(401);
    expect(invalidLogin.text).toContain('Email or password is incorrect.');
    expect((await invalidBrowser.get('/requester/my-requests')).status).toBe(401);
  });
});
