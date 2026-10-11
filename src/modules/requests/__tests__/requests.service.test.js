jest.mock('../requests.model', () => ({
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findByRequesterId: jest.fn(),
  findByCreatorId: jest.fn(),
}));

const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
const { REQUEST_STATUSES } = require('../requests.constants');

describe('RequestWorkflowService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Requester request listing', () => {
    it('retrieves requests for the authenticated requester ID', async () => {
      const requesterRequests = [{ id: 'request-1' }];
      requestsModel.findByRequesterId.mockResolvedValue(requesterRequests);

      await expect(requestsService.listForRequester('requester-1')).resolves.toBe(
        requesterRequests
      );
      expect(requestsModel.findByRequesterId).toHaveBeenCalledWith('requester-1');
    });

    it('does not query requests without an authenticated requester ID', async () => {
      await expect(requestsService.listForRequester()).rejects.toThrow(
        'No active database user is available for this action.'
      );
      expect(requestsModel.findByRequesterId).not.toHaveBeenCalled();
    });

    it('loads a detail only for the authenticated requester', async () => {
      requestsModel.findById.mockResolvedValue(null);

      await expect(requestsService.getForRequester('request-1', 'requester-1')).resolves.toBeNull();
      expect(requestsModel.findById).toHaveBeenCalledWith('request-1', 'requester-1');
    });

    it('retrieves operator logged requests for the authenticated operator ID', async () => {
      requestsModel.findByCreatorId.mockResolvedValue([]);

      await expect(requestsService.listCreatedByOperator('operator-1')).resolves.toEqual([]);
      expect(requestsModel.findByCreatorId).toHaveBeenCalledWith('operator-1');
    });

    it('does not list operator requests without an authenticated user ID', async () => {
      await expect(requestsService.listCreatedByOperator()).rejects.toThrow(
        'No active database user is available for this action.'
      );
      expect(requestsModel.findByCreatorId).not.toHaveBeenCalled();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires a comment when resolving a request', async () => {
    requestsModel.findById.mockResolvedValue({
      id: 'request-1',
      status: REQUEST_STATUSES.IN_PROGRESS,
    });

    await expect(
      requestsService.workflow.transitionRequest(
        'request-1',
        REQUEST_STATUSES.RESOLVED,
        'staff-1',
        null
      )
    ).rejects.toThrow('A resolution comment is required to resolve a request.');

    expect(requestsModel.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects a transition that is not allowed', async () => {
    requestsModel.findById.mockResolvedValue({
      id: 'request-1',
      status: REQUEST_STATUSES.SUBMITTED,
    });

    await expect(
      requestsService.workflow.transitionRequest(
        'request-1',
        REQUEST_STATUSES.RESOLVED,
        'staff-1',
        'Fixed it'
      )
    ).rejects.toThrow('Invalid transition from Submitted to Resolved');

    expect(requestsModel.updateStatus).not.toHaveBeenCalled();
  });

  it('updates the model for a valid transition', async () => {
    const updatedRequest = { id: 'request-1', status: REQUEST_STATUSES.ASSIGNED };
    requestsModel.findById.mockResolvedValue({
      id: 'request-1',
      status: REQUEST_STATUSES.SUBMITTED,
    });
    requestsModel.updateStatus.mockResolvedValue(updatedRequest);
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      requestsService.workflow.transitionRequest('request-1', REQUEST_STATUSES.ASSIGNED, 'staff-1')
    ).resolves.toBe(updatedRequest);

    expect(requestsModel.updateStatus).toHaveBeenCalledWith(
      'request-1',
      REQUEST_STATUSES.ASSIGNED,
      null
    );
  });

  it.each([
    ['Submitted', 'Rejected'],
    ['Assigned', 'In Progress'],
    ['In Progress', 'Resolved'],
    ['Resolved', 'Closed'],
    ['Resolved', 'In Progress'],
  ])('allows the existing workflow transition %s to %s', async (from, to) => {
    requestsModel.findById.mockResolvedValue({ id: 'request-1', status: from });
    requestsModel.updateStatus.mockResolvedValue({ id: 'request-1', status: to });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await requestsService.workflow.transitionRequest('request-1', to, 'staff-1', 'Work recorded');
    expect(requestsModel.updateStatus).toHaveBeenCalledWith('request-1', to, 'Work recorded');
  });
});
