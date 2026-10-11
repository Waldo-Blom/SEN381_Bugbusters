jest.mock('../requests.model', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findCategories: jest.fn(),
  findActiveCategory: jest.fn(),
  findGenericActiveUserId: jest.fn(),
  findExternalRequesterById: jest.fn(),
  searchExternalRequesters: jest.fn(),
  create: jest.fn(),
  findByRequesterId: jest.fn(),
  findByCreatorId: jest.fn(),
}));

const request = require('supertest');
const app = require('../../../app');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
const { validateExternalRequester } = require('../requests.schema');

const category = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Roads',
};
const managerRequest = {
  id: 'r1',
  reference: 'CC-2026-0481',
  title: 'Large pothole on Maple Street',
  description: 'A pothole needs repair.',
  category: 'Pothole',
  department: 'Public Works',
  status: 'Resolved',
  priority: 'High',
  location: '142 Maple Street',
  requesterName: 'Amelia Carter',
  requesterEmail: 'amelia.carter@email.com',
  requesterPhone: '555-0100',
  createdBy: 'Amelia Carter',
  submittedAt: '2026-09-20 09:14',
  updatedAt: '2026-09-22 14:20',
  assignedTo: 'Marcus Doyle',
  comments: [],
  timeline: [],
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
    requestsModel.findById.mockImplementation((id) => (id === 'r1' ? managerRequest : null));
    requestsModel.findCategories.mockResolvedValue([category]);
    requestsModel.findActiveCategory.mockResolvedValue(category);
    requestsModel.findGenericActiveUserId.mockResolvedValue('33333333-3333-4333-8333-333333333333');
    requestsModel.searchExternalRequesters.mockResolvedValue([]);
    requestsModel.create.mockResolvedValue({
      request_id: '22222222-2222-4222-8222-222222222222',
      request_number: 'CC-2026-0001',
      status: 'SUBMITTED',
    });
  });

  it('uses the shared creation service with one external requester and creator', async () => {
    await requestsService.createServiceRequest({
      input: operatorForm,
      actorType: 'OPERATOR',
    });

    expect(requestsModel.findGenericActiveUserId).toHaveBeenCalledWith(['STAFF', 'ADMIN']);
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
      }),
      expect.any(Function)
    );
  });

  it('reuses a selected community member instead of creating a duplicate', async () => {
    const externalRequesterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    requestsModel.findExternalRequesterById.mockResolvedValue({
      id: externalRequesterId,
      firstName: 'Taylor',
      lastName: 'Morgan',
      phone: '555-0100',
      email: null,
      preferredContactMethod: 'PHONE',
    });

    await requestsService.createServiceRequest({
      input: {
        ...operatorForm,
        externalRequesterId,
      },
      actorType: 'OPERATOR',
    });

    expect(requestsModel.findExternalRequesterById).toHaveBeenCalledWith(externalRequesterId);
    expect(requestsModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRequesterId,
        externalRequester: expect.objectContaining({ id: externalRequesterId }),
      }),
      expect.any(Function)
    );
  });

  it('rejects invalid or missing selected community-member IDs', async () => {
    await expect(
      requestsService.createServiceRequest({
        input: { ...operatorForm, externalRequesterId: 'not-a-uuid' },
        actorType: 'OPERATOR',
      })
    ).rejects.toMatchObject({
      name: 'RequestValidationError',
      errors: { externalRequesterId: 'Please select a valid community member.' },
    });

    requestsModel.findExternalRequesterById.mockResolvedValue(null);
    await expect(
      requestsService.createServiceRequest({
        input: {
          ...operatorForm,
          externalRequesterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
        actorType: 'OPERATOR',
      })
    ).rejects.toMatchObject({
      name: 'RequestValidationError',
      errors: {
        externalRequesterId: 'Please select an existing community member or enter new details.',
      },
    });
    expect(requestsModel.create).not.toHaveBeenCalled();
  });

  it('renders the existing submission page with external requester fields for operators only', async () => {
    const operator = request.agent(app);
    await operator.post('/auth/login').type('form').send({ role: 'operator' });

    const operatorPage = await operator.get('/operator/submit');
    expect(operatorPage.status).toBe(200);
    expect(operatorPage.text).toContain('action="/operator/submit"');
    expect(operatorPage.text).toContain('name="externalFirstName"');
    expect(operatorPage.text).toContain('name="preferredContactMethod"');
    expect(operatorPage.text).not.toContain('name="submissionChannel"');

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
    expect(requestsModel.findGenericActiveUserId).toHaveBeenCalledWith(['STAFF', 'ADMIN']);
  });

  it('shows only the signed-in operator’s logged requests', async () => {
    requestsModel.findByCreatorId.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        reference: 'CC-2026-0002',
        requesterName: 'Taylor Morgan',
        requesterPhone: '555-0100',
        title: 'Streetlight reported by phone',
        category: 'Streetlight',
        location: '12 Oak Street',
        status: 'Submitted',
        submittedAt: '2026-10-10 10:00',
      },
    ]);
    const operator = request.agent(app);
    await operator.post('/auth/login').type('form').send({ role: 'operator' });

    const response = await operator.get('/operator/requests');

    expect(response.status).toBe(200);
    expect(response.text).toContain('CC-2026-0002');
    expect(response.text).toContain('Taylor Morgan');
    expect(response.text).toContain('Streetlight reported by phone');
    expect(requestsModel.findGenericActiveUserId).toHaveBeenCalledWith(['STAFF', 'ADMIN']);
    expect(requestsModel.findByCreatorId).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333'
    );
  });

  it('searches community members only for authenticated operators', async () => {
    const matchingMember = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      firstName: 'Taylor',
      lastName: 'Morgan',
      phone: '555-0100',
      email: null,
      preferredContactMethod: 'PHONE',
    };
    requestsModel.searchExternalRequesters.mockResolvedValue([matchingMember]);
    const operator = request.agent(app);
    await operator.post('/auth/login').type('form').send({ role: 'operator' });

    const response = await operator.get('/operator/community-members/search?q=Taylor');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([matchingMember]);
    expect(requestsModel.searchExternalRequesters).toHaveBeenCalledWith('Taylor');
    expect((await request(app).get('/operator/community-members/search?q=Taylor')).status).toBe(
      401
    );

    const requester = request.agent(app);
    await requester.post('/auth/login').type('form').send({ role: 'requester' });
    expect((await requester.get('/operator/community-members/search?q=Taylor')).status).toBe(403);
  });

  it('does not allow requesters to access operator logged requests', async () => {
    const requester = request.agent(app);
    await requester.post('/auth/login').type('form').send({ role: 'requester' });

    const response = await requester.get('/operator/requests');

    expect(response.status).toBe(403);
    expect(requestsModel.findByCreatorId).not.toHaveBeenCalled();
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

  it('shows the creator in the manager request detail', async () => {
    const manager = request.agent(app);
    await manager.post('/auth/login').type('form').send({ role: 'management' });

    const response = await manager.get('/manager/requests/r1');
    expect(response.status).toBe(200);
    expect(response.text).not.toContain('Submission channel');
    expect(response.text).toContain('Created by');
    expect(response.text).toContain('Amelia Carter');
  });

  it('renders creator and external requester details returned for a persisted request', async () => {
    requestsModel.findById.mockResolvedValue({
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
      submittedAt: '2026-10-10 10:00',
      updatedAt: '2026-10-10 10:00',
      comments: [],
      timeline: [],
    });
    const manager = request.agent(app);
    await manager.post('/auth/login').type('form').send({ role: 'management' });

    const response = await manager.get('/manager/requests/44444444-4444-4444-8444-444444444444');

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('Submission channel');
    expect(response.text).toContain('Sam Rivera');
    expect(response.text).toContain('Taylor Morgan');
    expect(response.text).toContain('Not provided');
  });
});
