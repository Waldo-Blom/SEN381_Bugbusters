jest.mock('../requests.model', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findCategories: jest.fn(),
  findActiveCategory: jest.fn(),
  findActiveUserIdByEmail: jest.fn(),
  create: jest.fn(),
  findByRequesterEmail: jest.fn(),
  findDetailsById: jest.fn(),
}));

const request = require('supertest');
const app = require('../../../app');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
const { validateExternalRequester } = require('../requests.schema');
const { mockRequests } = require('../../../../db/mock/mockData');

const category = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Roads',
};
const operatorForm = {
  categoryId: category.id,
  title: 'Pothole reported by phone',
  description: 'Caller reports a large pothole.',
  location: '12 Oak Street',
  priority: 'HIGH',
  externalFirstName: 'Taylor',
  externalLastName: 'Morgan',
  externalPhone: '555-0100',
  externalEmail: '',
  preferredContactMethod: 'PHONE',
  submissionChannel: 'PHONE',
};

describe('external requester validation', () => {
  it('requires at least one contact method', () => {
    const result = validateExternalRequester({
      externalFirstName: 'Taylor',
      externalLastName: 'Morgan',
      externalPhone: '',
      externalEmail: '',
      preferredContactMethod: 'PHONE',
    });

    expect(result.errors.externalPhone).toContain('at least one contact method');
    expect(result.errors.externalEmail).toContain('at least one contact method');
  });

  it('requires the preferred method to have a matching contact value', () => {
    const result = validateExternalRequester({
      externalFirstName: 'Taylor',
      externalLastName: 'Morgan',
      externalEmail: 'taylor@example.com',
      preferredContactMethod: 'PHONE',
    });

    expect(result.errors.preferredContactMethod).toContain('phone number is required');
  });
});

describe('operator-assisted request submission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestsModel.findById.mockImplementation((id) => mockRequests.find((item) => item.id === id));
    requestsModel.findCategories.mockResolvedValue([category]);
    requestsModel.findActiveCategory.mockResolvedValue(category);
    requestsModel.findActiveUserIdByEmail.mockResolvedValue('33333333-3333-4333-8333-333333333333');
    requestsModel.create.mockResolvedValue({
      request_id: '22222222-2222-4222-8222-222222222222',
      request_number: 'CC-2026-0001',
      status: 'SUBMITTED',
    });
  });

  it('uses the shared creation service with one external requester, creator, and channel', async () => {
    await requestsService.createServiceRequest({
      input: operatorForm,
      actorEmail: 'sam.rivera@civic.gov',
      actorType: 'OPERATOR',
      submissionChannel: operatorForm.submissionChannel,
    });

    expect(requestsModel.findActiveUserIdByEmail).toHaveBeenCalledWith(
      'sam.rivera@civic.gov',
      'OPERATOR'
    );
    expect(requestsModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: null,
        externalRequester: expect.objectContaining({
          firstName: 'Taylor',
          lastName: 'Morgan',
          phone: '555-0100',
          email: null,
          preferredContactMethod: 'PHONE',
        }),
        createdBy: '33333333-3333-4333-8333-333333333333',
        submissionChannel: 'PHONE',
      }),
      expect.any(Function)
    );
  });

  it('renders the existing submission page with external requester fields for operators only', async () => {
    const operator = request.agent(app);
    await operator.post('/auth/login').type('form').send({ role: 'operator' });

    const operatorPage = await operator.get('/operator/submit');
    expect(operatorPage.status).toBe(200);
    expect(operatorPage.text).toContain('action="/operator/submit"');
    expect(operatorPage.text).toContain('name="externalFirstName"');
    expect(operatorPage.text).toContain('name="preferredContactMethod"');

    const requesterPage = await request(app).get('/requester/submit');
    expect(requesterPage.status).toBe(200);
    expect(requesterPage.text).toContain('action="/requester/submit"');
    expect(requesterPage.text).not.toContain('name="externalFirstName"');
  });

  it('creates a request from the operator route and redirects with its reference', async () => {
    const operator = request.agent(app);
    await operator.post('/auth/login').type('form').send({ role: 'operator' });

    const response = await operator.post('/operator/submit').type('form').send(operatorForm);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/operator/submit?submitted=CC-2026-0001');
    expect(requestsModel.create).toHaveBeenCalledTimes(1);
  });

  it('rejects operator submissions with no email or phone before persistence', async () => {
    const operator = request.agent(app);
    await operator.post('/auth/login').type('form').send({ role: 'operator' });

    const response = await operator
      .post('/operator/submit')
      .type('form')
      .send({
        ...operatorForm,
        externalPhone: '',
        preferredContactMethod: '',
      });

    expect(response.status).toBe(400);
    expect(response.text).toContain('at least one contact method');
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  it('denies unauthenticated operators and prevents operators from using staff routes', async () => {
    const unauthenticatedResponse = await request(app).get('/operator/submit');
    expect(unauthenticatedResponse.status).toBe(401);

    const operator = request.agent(app);
    await operator.post('/auth/login').type('form').send({ role: 'operator' });
    const staffResponse = await operator.get('/staff/dashboard');
    expect(staffResponse.status).toBe(403);
  });

  it('shows the creator and submission channel in the manager request detail', async () => {
    const manager = request.agent(app);
    await manager.post('/auth/login').type('form').send({ role: 'management' });

    const response = await manager.get('/manager/requests/r1');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Submission channel');
    expect(response.text).toContain('Created by');
    expect(response.text).toContain('Amelia Carter');
  });

  it('renders creator and external requester details returned for a persisted request', async () => {
    requestsModel.findDetailsById.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      reference: 'CC-2026-0002',
      title: 'Pothole reported by phone',
      description: 'Caller reports a large pothole.',
      category: 'Roads',
      department: 'Public Works',
      status: 'Submitted',
      priority: 'High',
      location: '12 Oak Street',
      requesterName: 'Taylor Morgan',
      requesterEmail: null,
      requesterPhone: '555-0100',
      createdBy: 'Sam Rivera',
      submissionChannel: 'PHONE',
      submittedAt: '2026-10-10 10:00',
      updatedAt: '2026-10-10 10:00',
      comments: [],
      timeline: [],
    });
    const manager = request.agent(app);
    await manager.post('/auth/login').type('form').send({ role: 'management' });

    const response = await manager.get('/manager/requests/44444444-4444-4444-8444-444444444444');

    expect(response.status).toBe(200);
    expect(response.text).toContain('PHONE');
    expect(response.text).toContain('Sam Rivera');
    expect(response.text).toContain('Taylor Morgan');
    expect(response.text).toContain('Not provided');
  });
});
