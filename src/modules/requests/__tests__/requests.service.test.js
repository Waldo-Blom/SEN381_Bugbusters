jest.mock('../requests.model', () => ({
  findById: jest.fn(),
  updateStatus: jest.fn(),
}));

const requestsModel = require('../requests.model');
const requestsService = require('../requests.service');
const { REQUEST_STATUSES } = require('../requests.constants');

describe('RequestWorkflowService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
