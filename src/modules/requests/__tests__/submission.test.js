// Replace every persistence function with a Jest mock. These tests exercise
// validation, service, controller, and routing behavior without connecting to PostgreSQL.
jest.mock('../requests.model', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findCategories: jest.fn(),
  findActiveCategory: jest.fn(),
  create: jest.fn(),
  findByRequesterId: jest.fn(),
}));

jest.mock('../../auth/auth.service', () => ({
  createRequester: jest.fn(),
  authenticate: jest.fn(),
}));

const request = require('supertest');
const app = require('../../../app');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
const authService = require('../../auth/auth.service');
const { validateSubmission } = require('../requests.schema');

const category = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Roads',
};
const formData = {
  categoryId: category.id,
  title: 'Pothole on Oak Street',
  description: 'A large pothole needs repair.',
  location: '12 Oak Street',
  priority: 'HIGH',
};

describe('request submission validation and reference generation', () => {
  // Check required fields and the readable errors returned for an empty submission.
  it('requires every field and returns human-readable field errors', () => {
    const result = validateSubmission({});

    expect(result.errors).toEqual({
      categoryId: 'Please select a category.',
      title: 'Please enter a title.',
      description: 'Please enter a description.',
      location: 'Please enter a location.',
    });
  });

  // Verify input normalization and limits that match the database columns.
  it('trims valid fields and enforces database field lengths', () => {
    const result = validateSubmission({
      ...formData,
      title: ` ${'x'.repeat(201)} `,
      location: 'x'.repeat(256),
    });

    expect(result.errors).toEqual({
      title: 'The title must be 200 characters or fewer.',
      location: 'The location must be 255 characters or fewer.',
    });
    expect(result.value.description).toBe(formData.description);
  });

  it('accepts canonical PostgreSQL UUIDs regardless of RFC version or variant bits', () => {
    const result = validateSubmission({
      ...formData,
      categoryId: '1f79da6e-4d90-b319-189a-c93894247b09',
    });

    expect(result.errors.categoryId).toBeUndefined();
    expect(result.value.categoryId).toBe('1f79da6e-4d90-b319-189a-c93894247b09');
  });

  // The stored priority defaults to the database's MEDIUM default and accepts only enum values.
  it('defaults priority to medium and rejects unsupported priorities', () => {
    const defaultPriority = validateSubmission({ ...formData, priority: '' });
    const invalidPriority = validateSubmission({ ...formData, priority: 'CRITICAL' });

    expect(defaultPriority.value.priority).toBe('MEDIUM');
    expect(invalidPriority.errors.priority).toBe('Please select a valid priority.');
  });

  // Ensure generated references retain the required year and padded sequence format.
  it('generates request numbers with a four-digit minimum sequence', () => {
    expect(requestsService.generateRequestNumber(2026, 1)).toBe('CC-2026-0001');
    expect(requestsService.generateRequestNumber(2026, 9999)).toBe('CC-2026-9999');
    expect(requestsService.generateRequestNumber(2026, 10000)).toBe('CC-2026-10000');
  });
});

describe('request submission routes', () => {
  let submittedRequests;

  // Simulate database reads and writes in memory so route tests are deterministic.
  beforeEach(() => {
    submittedRequests = [];
    jest.clearAllMocks();
    authService.authenticate.mockImplementation(async (email) => ({
      id: `demo-${email.split('@')[0]}`,
      name: 'Demo Requester',
      email,
      role: 'requester',
      departmentId: null,
    }));
    requestsModel.findCategories.mockResolvedValue([category]);
    requestsModel.findActiveCategory.mockImplementation(async (id) =>
      id === category.id ? category : null
    );
    requestsModel.create.mockImplementation(async (input, generateRequestNumber) => {
      const row = {
        request_id: '22222222-2222-4222-8222-222222222222',
        request_number: generateRequestNumber(2026, submittedRequests.length + 1),
        category_id: input.categoryId,
        category_name: category.name,
        title: input.title,
        description: input.description,
        location: input.location,
        status: 'SUBMITTED',
        priority: 'MEDIUM',
        created_at: new Date('2026-10-10T10:00:00.000Z'),
      };

      submittedRequests.push({
        id: row.request_id,
        requesterId: input.requesterId,
        reference: row.request_number,
        category: row.category_name,
        title: row.title,
        description: row.description,
        location: row.location,
        status: 'Submitted',
        priority: 'Medium',
        submittedAt: '2026-10-10 10:00',
        overdue: false,
        comments: [],
        requesterEmail: 'amelia.carter@email.com',
      });
      return row;
    });
    requestsModel.findByRequesterId.mockImplementation(async (userId) =>
      submittedRequests.filter((item) => item.requesterId === userId)
    );
  });

  // Confirm the page renders the categories and default priority supplied by the controller.
  it('populates the submit form with active categories', async () => {
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });
    const response = await browser.get('/requester/submit');

    expect(response.status).toBe(200);
    expect(response.text).toContain(`value="${category.id}"`);
    expect(response.text).toContain(category.name);
    expect(response.text).toContain('id="priority" name="priority" value="MEDIUM"');
    expect(response.text).toContain('data-priority="LOW"');
    expect(response.text).toContain('data-priority="MEDIUM"');
    expect(response.text).toContain('aria-pressed="true"');
  });

  // Ensure unauthenticated requests are rejected before the create operation.
  it('requires a signed-in requester to submit', async () => {
    const response = await request(app).post('/requester/submit').send(formData);

    expect(response.status).toBe(401);
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  // Exercise login, POST submission, and the follow-up list page using a fake model.
  it('persists valid submissions and displays them in the requester list', async () => {
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });

    const response = await browser.post('/requester/submit').type('form').send(formData);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/requester/my-requests');
    expect(requestsModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: 'demo-requester',
        externalRequester: null,
        createdBy: 'demo-requester',
        categoryId: category.id,
        title: formData.title,
        description: formData.description,
        location: formData.location,
        priority: formData.priority,
      }),
      expect.any(Function)
    );

    const listResponse = await browser.get('/requester/my-requests');
    expect(listResponse.status).toBe(200);
    expect(listResponse.text).toContain('Demo Requester');
    expect(listResponse.text).toContain('requester@demo.invalid');
    expect(listResponse.text).not.toContain('Amelia Carter');
    expect(listResponse.text).toContain('CC-2026-0001');
    expect(listResponse.text).toContain(formData.title);
  });

  // Invalid input should be reported to the user without attempting a model write.
  it('shows validation errors and does not persist invalid submissions', async () => {
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });

    const response = await browser
      .post('/requester/submit')
      .type('form')
      .send({ ...formData, title: '' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Please enter a title.');
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  // The service must re-check a category instead of trusting a submitted category ID.
  it('rejects a category that is not active in the database', async () => {
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });
    requestsModel.findActiveCategory.mockResolvedValue(null);

    const response = await browser.post('/requester/submit').type('form').send(formData);

    expect(response.status).toBe(400);
    expect(response.text).toContain('Please select an available category.');
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  // Request creation must use a database identity from the authenticated session.
  it('rejects a requester session without a database user ID', async () => {
    authService.authenticate.mockResolvedValueOnce({
      id: null,
      name: 'Demo Requester',
      email: 'requester@demo.invalid',
      role: 'requester',
      departmentId: null,
    });
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });
    const response = await browser.post('/requester/submit').type('form').send(formData);

    expect(response.status).toBe(401);
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  it('uses the authenticated database requester ID rather than a generic account', async () => {
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });

    await browser.post('/requester/submit').type('form').send(formData);

    expect(requestsModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: 'demo-requester',
        createdBy: 'demo-requester',
      }),
      expect.any(Function)
    );
  });

  it('filters each requester list using that requesters own session ID', async () => {
    const firstRequester = request.agent(app);
    await firstRequester
      .post('/auth/login')
      .type('form')
      .send({ email: 'first@demo.invalid', password: 'SecurePass1' });
    const secondRequester = request.agent(app);
    await secondRequester
      .post('/auth/login')
      .type('form')
      .send({ email: 'second@demo.invalid', password: 'SecurePass1' });

    await firstRequester.get('/requester/my-requests');
    await secondRequester.get('/requester/my-requests');

    expect(requestsModel.findByRequesterId).toHaveBeenNthCalledWith(1, 'demo-first');
    expect(requestsModel.findByRequesterId).toHaveBeenNthCalledWith(2, 'demo-second');
  });

  it('does not show another requesters detail to the current requester', async () => {
    const browser = request.agent(app);
    await browser
      .post('/auth/login')
      .type('form')
      .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });

    const response = await browser.get('/requester/requests/another-users-request');

    expect(response.status).toBe(404);
    expect(requestsModel.findById).toHaveBeenCalledWith('another-users-request', 'demo-requester');
  });

  it('requires requester authentication to open request pages', async () => {
    expect((await request(app).get('/requester/my-requests')).status).toBe(401);
    expect((await request(app).get('/requester/requests/request-1')).status).toBe(401);
    expect((await request(app).get('/requester/submit')).status).toBe(401);
  });
});
