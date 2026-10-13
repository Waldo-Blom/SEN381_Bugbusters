jest.mock('../requests.model', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findCategories: jest.fn(),
  findActiveCategory: jest.fn(),
  updateRequesterRequest: jest.fn(),
  findByRequesterId: jest.fn(),
}));

jest.mock('../../auth/auth.service', () => ({
  createRequester: jest.fn(),
  authenticate: jest.fn(),
}));

jest.mock('../../../shared/events/eventBus', () => {
  const EventEmitter = require('events');
  const bus = new EventEmitter();
  bus.emitAuditEvent = jest.fn();
  return bus;
});

jest.mock('../requests.attachments.service', () => ({
  prepareImages: jest.fn().mockResolvedValue([]),
  persist: jest.fn().mockResolvedValue(true),
  cleanup: jest.fn().mockResolvedValue(true),
  list: jest.fn().mockResolvedValue([]),
  add: jest.fn().mockResolvedValue([]),
  remove: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const app = require('../../../app');
const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
const attachmentsService = require('../requests.attachments.service');
const authService = require('../../auth/auth.service');
const eventBus = require('../../../shared/events/eventBus');

const validRequestId = '11111111-1111-4111-8111-111111111111';
const validCategoryId = '22222222-2222-4222-8222-222222222222';
const validRequesterId = '33333333-3333-4333-8333-333333333333';

const mockRequest = {
  id: validRequestId,
  reference: 'CC-2026-0042',
  title: 'Pothole on Main Road',
  description: 'Deep pothole causing hazard to traffic.',
  location: 'Main Road near 5th Ave',
  priority: 'HIGH',
  status: 'Submitted',
  categoryId: validCategoryId,
  categoryName: 'Roads & Stormwater',
  requesterId: validRequesterId,
};

const validUpdateInput = {
  title: 'Updated Pothole on Main Road',
  description: 'Updated description with more details.',
  location: 'Main Road near 6th Ave',
  categoryId: validCategoryId,
  priority: 'URGENT',
};

describe('Requester Request Editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestsService.getEditableForRequester', () => {
    it('returns request when it belongs to requester and status is Submitted', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);

      const result = await requestsService.getEditableForRequester(
        validRequestId,
        validRequesterId
      );

      expect(result).toEqual(mockRequest);
      expect(requestsModel.findById).toHaveBeenCalledWith(validRequestId, validRequesterId);
    });

    it('returns null when request is not found', async () => {
      requestsModel.findById.mockResolvedValue(null);

      const result = await requestsService.getEditableForRequester(
        validRequestId,
        validRequesterId
      );

      expect(result).toBeNull();
    });

    it('throws RequestNotEditableError when request is in progress or resolved', async () => {
      requestsModel.findById.mockResolvedValue({
        ...mockRequest,
        status: 'In Progress',
      });

      await expect(
        requestsService.getEditableForRequester(validRequestId, validRequesterId)
      ).rejects.toThrow('Only submitted requests can be edited.');
    });

    it('throws error when requesterId is missing', async () => {
      await expect(requestsService.getEditableForRequester(validRequestId, null)).rejects.toThrow(
        'No active database user is available for this action.'
      );
    });
  });

  describe('requestsService.updateRequesterRequest', () => {
    it('successfully updates a submitted request and emits audit event', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);
      requestsModel.findActiveCategory.mockResolvedValue({ id: validCategoryId, name: 'Roads' });
      requestsModel.updateRequesterRequest.mockResolvedValue({
        ...mockRequest,
        ...validUpdateInput,
      });

      const result = await requestsService.updateRequesterRequest({
        requestId: validRequestId,
        requesterId: validRequesterId,
        input: validUpdateInput,
      });

      expect(result).toBeDefined();
      expect(requestsModel.updateRequesterRequest).toHaveBeenCalledWith(
        validRequestId,
        validRequesterId,
        expect.objectContaining({
          title: validUpdateInput.title,
          description: validUpdateInput.description,
          location: validUpdateInput.location,
          categoryId: validCategoryId,
          priority: 'URGENT',
        })
      );
      expect(eventBus.emitAuditEvent).toHaveBeenCalledWith(
        'RequestDetailsUpdated',
        expect.objectContaining({
          requestId: validRequestId,
          requesterId: validRequesterId,
        })
      );
    });

    it('removes specified attachments when removeAttachmentIds are provided', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);
      requestsModel.findActiveCategory.mockResolvedValue({ id: validCategoryId, name: 'Roads' });
      requestsModel.updateRequesterRequest.mockResolvedValue({
        ...mockRequest,
        ...validUpdateInput,
      });

      await requestsService.updateRequesterRequest({
        requestId: validRequestId,
        requesterId: validRequesterId,
        input: {
          ...validUpdateInput,
          removeAttachmentIds: ['44444444-4444-4444-8444-444444444444'],
        },
      });

      expect(attachmentsService.remove).toHaveBeenCalledWith(
        validRequestId,
        validRequesterId,
        ['44444444-4444-4444-8444-444444444444'],
        'requester'
      );
    });

    it('throws 404 when request does not exist or requester is not owner', async () => {
      requestsModel.findById.mockResolvedValue(null);

      await expect(
        requestsService.updateRequesterRequest({
          requestId: validRequestId,
          requesterId: validRequesterId,
          input: validUpdateInput,
        })
      ).rejects.toThrow('Request not found.');
    });

    it('throws RequestNotEditableError when status is not Submitted', async () => {
      requestsModel.findById.mockResolvedValue({
        ...mockRequest,
        status: 'Assigned',
      });

      await expect(
        requestsService.updateRequesterRequest({
          requestId: validRequestId,
          requesterId: validRequesterId,
          input: validUpdateInput,
        })
      ).rejects.toThrow('Only submitted requests can be edited.');
    });

    it('validates required fields and throws RequestValidationError', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);

      await expect(
        requestsService.updateRequesterRequest({
          requestId: validRequestId,
          requesterId: validRequesterId,
          input: { ...validUpdateInput, title: '' },
        })
      ).rejects.toThrow('Please correct the request details.');
    });

    it('validates category existence and throws RequestValidationError if inactive', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);
      requestsModel.findActiveCategory.mockResolvedValue(null);

      await expect(
        requestsService.updateRequesterRequest({
          requestId: validRequestId,
          requesterId: validRequesterId,
          input: validUpdateInput,
        })
      ).rejects.toThrow('Please correct the request details.');
    });
  });

  describe('HTTP endpoints for request editing', () => {
    let agent;

    beforeEach(async () => {
      authService.authenticate.mockResolvedValue({
        id: validRequesterId,
        name: 'Jane Citizen',
        email: 'citizen@example.com',
        role: 'requester',
        departmentId: null,
      });

      agent = request.agent(app);
      await agent
        .post('/auth/login')
        .type('form')
        .send({ email: 'citizen@example.com', password: 'Password123' });
    });

    it('requires authentication to access GET /requester/requests/:id/edit', async () => {
      const unauthResponse = await request(app).get(`/requester/requests/${validRequestId}/edit`);
      expect(unauthResponse.status).toBe(401);
    });

    it('renders the edit page for a submitted request', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);
      requestsModel.findCategories.mockResolvedValue([
        { id: validCategoryId, name: 'Roads & Stormwater' },
      ]);

      const response = await agent.get(`/requester/requests/${validRequestId}/edit`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Edit Service Request');
      expect(response.text).toContain('Pothole on Main Road');
      expect(response.text).toContain('Save changes');
    });

    it('returns 400 when trying to edit a request that is already Assigned or In Progress', async () => {
      requestsModel.findById.mockResolvedValue({
        ...mockRequest,
        status: 'In Progress',
      });

      const response = await agent.get(`/requester/requests/${validRequestId}/edit`);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Only submitted requests can be edited.');
    });

    it('returns 404 when request is not found', async () => {
      requestsModel.findById.mockResolvedValue(null);

      const response = await agent.get(`/requester/requests/${validRequestId}/edit`);

      expect(response.status).toBe(404);
    });

    it('POST /requester/requests/:id/edit updates the request and redirects to detail view', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);
      requestsModel.findActiveCategory.mockResolvedValue({ id: validCategoryId, name: 'Roads' });
      requestsModel.updateRequesterRequest.mockResolvedValue({
        ...mockRequest,
        ...validUpdateInput,
      });

      const response = await agent
        .post(`/requester/requests/${validRequestId}/edit`)
        .type('form')
        .send(validUpdateInput);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/requester/requests/${validRequestId}`);
      expect(requestsModel.updateRequesterRequest).toHaveBeenCalled();
    });

    it('POST /requester/requests/:id/edit returns 400 with validation errors on invalid input', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);
      requestsModel.findCategories.mockResolvedValue([
        { id: validCategoryId, name: 'Roads & Stormwater' },
      ]);

      const response = await agent
        .post(`/requester/requests/${validRequestId}/edit`)
        .type('form')
        .send({ ...validUpdateInput, title: '' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Please enter a title');
    });

    it('renders existing attachments with remove checkboxes on GET', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);
      requestsModel.findCategories.mockResolvedValue([
        { id: validCategoryId, name: 'Roads & Stormwater' },
      ]);
      attachmentsService.list.mockResolvedValue([
        {
          id: '55555555-5555-5555-8555-555555555555',
          name: 'photo.jpg',
          size: 1024,
          extension: 'jpg',
        },
      ]);

      const response = await agent.get(`/requester/requests/${validRequestId}/edit`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Currently Attached Images');
      expect(response.text).toContain('photo.jpg');
      expect(response.text).toContain('Remove image');
    });

    it('POST /requester/requests/:id/edit forwards removeAttachmentIds to service', async () => {
      requestsModel.findById.mockResolvedValue(mockRequest);
      requestsModel.findActiveCategory.mockResolvedValue({ id: validCategoryId, name: 'Roads' });
      requestsModel.updateRequesterRequest.mockResolvedValue({
        ...mockRequest,
        ...validUpdateInput,
      });

      const response = await agent
        .post(`/requester/requests/${validRequestId}/edit`)
        .type('form')
        .send({
          ...validUpdateInput,
          removeAttachmentIds: '55555555-5555-5555-8555-555555555555',
        });

      expect(response.status).toBe(302);
      expect(attachmentsService.remove).toHaveBeenCalledWith(
        validRequestId,
        validRequesterId,
        ['55555555-5555-5555-8555-555555555555'],
        'requester'
      );
    });
  });
});
