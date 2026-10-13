jest.mock('../requests.model', () => ({
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
}));
jest.mock('../../auth/auth.service', () => ({
  createRequester: jest.fn(),
  authenticate: jest.fn(),
}));
jest.mock('../requests.contact-access.model', () => ({ findContext: jest.fn() }));
jest.mock('../requests.assignment', () => ({ listEligible: jest.fn() }));

const request = require('supertest');
const app = require('../../../app');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
const authService = require('../../auth/auth.service');
const { validateSubmission } = require('../requests.schema');
const { closePool } = require('../../../config/database');

const category = { id: '11111111-1111-4111-8111-111111111111', name: 'Roads' };
const formData = {
  categoryId: category.id,
  title: 'Pothole on Oak Street',
  description: 'A large pothole needs repair.',
  location: '12 Oak Street',
  priority: 'HIGH',
};

afterAll(async () => {
  await closePool();
});

// Separate requester and operator flows because they share request creation
// but differ in identity, validation, and which routes they may use.
describe('Requester submissions', () => {
  describe('validation and reference generation', () => {
    it('requires every field and returns human-readable field errors', () => {
      expect(validateSubmission({}).errors).toEqual({
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

    it('defaults priority to medium and rejects unsupported priorities', () => {
      expect(validateSubmission({ ...formData, priority: '' }).value.priority).toBe('MEDIUM');
      expect(validateSubmission({ ...formData, priority: 'CRITICAL' }).errors.priority).toBe(
        'Please select a valid priority.'
      );
    });

    it('generates request numbers with a four-digit minimum sequence', () => {
      expect(requestsService.generateRequestNumber(2026, 1)).toBe('CC-2026-0001');
      expect(requestsService.generateRequestNumber(2026, 9999)).toBe('CC-2026-9999');
      expect(requestsService.generateRequestNumber(2026, 10000)).toBe('CC-2026-10000');
    });
  });

  describe('routes', () => {
    let submittedRequests;
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

    it('requires a signed-in requester to submit', async () => {
      const response = await request(app).post('/requester/submit').send(formData);
      expect(response.status).toBe(401);
      expect(requestsModel.create).not.toHaveBeenCalled();
    });

    it('persists valid submissions and displays them in the requester list', async () => {
      // Both ownership fields must point to the authenticated database user.
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

    it('prevents duplicate request creation on rapid double-clicks', async () => {
      // The in-flight guard prevents two requests from being created by one fast double-submit.
      const browser = request.agent(app);
      await browser
        .post('/auth/login')
        .type('form')
        .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });
      requestsModel.create.mockClear();
      const first = await browser.post('/requester/submit').type('form').send(formData);
      expect(first.status).toBe(302);
      expect(requestsModel.create).toHaveBeenCalledTimes(1);
      const second = await browser.post('/requester/submit').type('form').send(formData);
      expect(second.status).toBe(302);
      expect(second.headers.location).toBe('/requester/my-requests');
      expect(requestsModel.create).toHaveBeenCalledTimes(1);
    });

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

    it('filters each requester list using that requesters own session ID', async () => {
      const first = request.agent(app);
      await first
        .post('/auth/login')
        .type('form')
        .send({ email: 'first@demo.invalid', password: 'SecurePass1' });
      const second = request.agent(app);
      await second
        .post('/auth/login')
        .type('form')
        .send({ email: 'second@demo.invalid', password: 'SecurePass1' });
      await first.get('/requester/my-requests');
      await second.get('/requester/my-requests');
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
      expect(requestsModel.findById).toHaveBeenCalledWith(
        'another-users-request',
        'demo-requester'
      );
    });

    it('requires requester authentication to open request pages', async () => {
      expect((await request(app).get('/requester/my-requests')).status).toBe(401);
      expect((await request(app).get('/requester/requests/request-1')).status).toBe(401);
      expect((await request(app).get('/requester/submit')).status).toBe(401);
    });
  });
});

describe('Operator-assisted submissions', () => {
  const request = require('supertest');
  const app = require('../../../app');
  const requestsModel = require('../requests.model');
  const requestsService = require('../requests.service');
  const authService = require('../../auth/auth.service');
  const { validateExternalRequester } = require('../requests.schema');

  const category = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Roads',
  };
  const managerRequest = {
    id: '55555555-5555-4555-8555-555555555555',
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
      authService.authenticate.mockImplementation(async (email) => {
        const role = email.split('@')[0];
        return {
          id: role === 'management' ? '66666666-6666-4666-8666-666666666666' : `demo-${role}`,
          name: `Demo ${role}`,
          email,
          role,
          departmentId: null,
        };
      });
      requestsModel.findById.mockImplementation((id) =>
        id === managerRequest.id ? managerRequest : null
      );
      require('../requests.contact-access.model').findContext.mockResolvedValue({
        manager_allowed: true,
      });
      require('../requests.assignment').listEligible.mockResolvedValue([]);
      requestsModel.findCategories.mockResolvedValue([category]);
      requestsModel.findActiveCategory.mockResolvedValue(category);
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
        actorUserId: 'operator-1',
      });

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
          createdBy: 'operator-1',
        }),
        expect.any(Function)
      );
    });

    it('reuses a selected community member instead of creating a duplicate', async () => {
      // Selecting an existing person must link their record rather than create another one.
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
        actorUserId: 'operator-1',
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
      await operator
        .post('/auth/login')
        .type('form')
        .send({ email: 'operator@demo.invalid', password: 'SecurePass1' });

      const operatorPage = await operator.get('/operator/submit');
      expect(operatorPage.status).toBe(200);
      expect(operatorPage.text).toContain('action="/operator/submit"');
      expect(operatorPage.text).toContain('name="externalFirstName"');
      expect(operatorPage.text).toContain('name="preferredContactMethod"');
      expect(operatorPage.text).toContain(`value="${category.id}"`);
      expect(operatorPage.text).toContain(category.name);
      expect(requestsModel.findCategories).toHaveBeenCalledTimes(1);
      expect(operatorPage.text).not.toContain('name="submissionChannel"');

      const requester = request.agent(app);
      await requester
        .post('/auth/login')
        .type('form')
        .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });
      const requesterPage = await requester.get('/requester/submit');
      expect(requesterPage.status).toBe(200);
      expect(requesterPage.text).toContain('action="/requester/submit"');
      expect(requesterPage.text).toContain(`value="${category.id}"`);
      expect(requesterPage.text).toContain(category.name);
      expect(requestsModel.findCategories).toHaveBeenCalledTimes(2);
      expect(requesterPage.text).not.toContain('name="externalFirstName"');
    });

    it('creates a request from the operator route and redirects with its reference', async () => {
      const operator = request.agent(app);
      await operator
        .post('/auth/login')
        .type('form')
        .send({ email: 'operator@demo.invalid', password: 'SecurePass1' });

      const response = await operator.post('/operator/submit').type('form').send(operatorForm);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/operator/submit?submitted=CC-2026-0001');
      expect(requestsModel.create).toHaveBeenCalledTimes(1);
      expect(requestsModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'demo-operator' }),
        expect.any(Function)
      );
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
      await operator
        .post('/auth/login')
        .type('form')
        .send({ email: 'operator@demo.invalid', password: 'SecurePass1' });

      const response = await operator.get('/operator/requests');

      expect(response.status).toBe(200);
      expect(response.text).toContain('CC-2026-0002');
      expect(response.text).toContain('Taylor Morgan');
      expect(response.text).toContain('Streetlight reported by phone');
      expect(requestsModel.findByCreatorId).toHaveBeenCalledWith('demo-operator');
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
      await operator
        .post('/auth/login')
        .type('form')
        .send({ email: 'operator@demo.invalid', password: 'SecurePass1' });

      const response = await operator.get('/operator/community-members/search?q=Taylor');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([matchingMember]);
      expect(requestsModel.searchExternalRequesters).toHaveBeenCalledWith('Taylor');
      expect((await request(app).get('/operator/community-members/search?q=Taylor')).status).toBe(
        401
      );

      const requester = request.agent(app);
      await requester
        .post('/auth/login')
        .type('form')
        .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });
      expect((await requester.get('/operator/community-members/search?q=Taylor')).status).toBe(403);
    });

    it('does not allow requesters to access operator logged requests', async () => {
      const requester = request.agent(app);
      await requester
        .post('/auth/login')
        .type('form')
        .send({ email: 'requester@demo.invalid', password: 'SecurePass1' });

      const response = await requester.get('/operator/requests');

      expect(response.status).toBe(403);
      expect(requestsModel.findByCreatorId).not.toHaveBeenCalled();
    });

    it('rejects operator submissions with no email or phone before persistence', async () => {
      const operator = request.agent(app);
      await operator
        .post('/auth/login')
        .type('form')
        .send({ email: 'operator@demo.invalid', password: 'SecurePass1' });

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

    it('shows the creator in the manager request detail', async () => {
      const manager = request.agent(app);
      await manager
        .post('/auth/login')
        .type('form')
        .send({ email: 'management@demo.invalid', password: 'SecurePass1' });

      const response = await manager.get(`/manager/requests/${managerRequest.id}`);
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
      await manager
        .post('/auth/login')
        .type('form')
        .send({ email: 'management@demo.invalid', password: 'SecurePass1' });

      const response = await manager.get('/manager/requests/44444444-4444-4444-8444-444444444444');

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('Submission channel');
      expect(response.text).toContain('Sam Rivera');
      expect(response.text).toContain('Taylor Morgan');
      expect(response.text).toContain('Not provided');
    });
  });
});
