jest.mock('../requests.model', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findCategories: jest.fn(),
  findActiveCategory: jest.fn(),
  findRequesterIdByEmail: jest.fn(),
  create: jest.fn(),
  findByRequesterEmail: jest.fn(),
}));

const request = require('supertest');
const app = require('../../../app');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
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
};

describe('request submission validation and reference generation', () => {
  it('requires every field and returns human-readable field errors', () => {
    const result = validateSubmission({});

    expect(result.errors).toEqual({
      categoryId: 'Please select a category.',
      title: 'Please enter a title.',
      description: 'Please enter a description.',
      location: 'Please enter a location.',
    });
  });

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

  it('generates request numbers with a four-digit minimum sequence', () => {
    expect(requestsService.generateRequestNumber(2026, 1)).toBe('CC-2026-0001');
    expect(requestsService.generateRequestNumber(2026, 9999)).toBe('CC-2026-9999');
    expect(requestsService.generateRequestNumber(2026, 10000)).toBe('CC-2026-10000');
  });
});

describe('request submission routes', () => {
  let submittedRequests;

  beforeEach(() => {
    submittedRequests = [];
    jest.clearAllMocks();
    requestsModel.findCategories.mockResolvedValue([category]);
    requestsModel.findRequesterIdByEmail.mockResolvedValue('33333333-3333-4333-8333-333333333333');
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
    requestsModel.findByRequesterEmail.mockImplementation(async (email) =>
      submittedRequests
        .filter((item) => item.requesterEmail === email)
        .map(({ requesterEmail: _requesterEmail, ...item }) => item)
    );
  });

  it('populates the submit form with active categories', async () => {
    const response = await request(app).get('/requester/submit');

    expect(response.status).toBe(200);
    expect(response.text).toContain(`value="${category.id}"`);
    expect(response.text).toContain(category.name);
  });

  it('requires a signed-in requester to submit', async () => {
    const response = await request(app).post('/requester/submit').send(formData);

    expect(response.status).toBe(401);
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  it('persists valid submissions and displays them in the requester list', async () => {
    const browser = request.agent(app);
    await browser.post('/auth/login').type('form').send({ role: 'requester' });

    const response = await browser.post('/requester/submit').type('form').send(formData);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/requester/my-requests');
    expect(requestsModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: category.id,
        title: formData.title,
        description: formData.description,
        location: formData.location,
      }),
      expect.any(Function)
    );
    expect(requestsModel.findRequesterIdByEmail).toHaveBeenCalledWith('amelia.carter@email.com');

    const listResponse = await browser.get('/requester/my-requests');
    expect(listResponse.status).toBe(200);
    expect(listResponse.text).toContain('CC-2026-0001');
    expect(listResponse.text).toContain(formData.title);
  });

  it('shows validation errors and does not persist invalid submissions', async () => {
    const browser = request.agent(app);
    await browser.post('/auth/login').type('form').send({ role: 'requester' });

    const response = await browser
      .post('/requester/submit')
      .type('form')
      .send({ ...formData, title: '' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Please enter a title.');
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  it('rejects a category that is not active in the database', async () => {
    const browser = request.agent(app);
    await browser.post('/auth/login').type('form').send({ role: 'requester' });
    requestsModel.findActiveCategory.mockResolvedValue(null);

    const response = await browser.post('/requester/submit').type('form').send(formData);

    expect(response.status).toBe(400);
    expect(response.text).toContain('Please select an available category.');
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  it('shows a useful error if the signed-in requester has no active database account', async () => {
    const browser = request.agent(app);
    await browser.post('/auth/login').type('form').send({ role: 'requester' });
    requestsModel.findRequesterIdByEmail.mockResolvedValue(null);

    const response = await browser.post('/requester/submit').type('form').send(formData);

    expect(response.status).toBe(403);
    expect(response.text).toContain('active requester account');
    expect(requestsModel.create).not.toHaveBeenCalled();
  });
});
