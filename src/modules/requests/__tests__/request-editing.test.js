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

const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
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

// Editing is limited to the owning requester while the request is still
// Submitted; these cases cover ownership, validation and update service rules.
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

    it('throws RequestNotEditableError when request is in progress or resolved', async () => {
      requestsModel.findById.mockResolvedValue({
        ...mockRequest,
        status: 'In Progress',
      });

      await expect(
        requestsService.getEditableForRequester(validRequestId, validRequesterId)
      ).rejects.toThrow('Only submitted requests can be edited.');
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
});
