jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const db = require('../../../config/database');
const requestsModel = require('../requests.model');

describe('Requests model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps database statuses, priorities, requester details, and attachments', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          request_id: 'request-1',
          request_number: 'CC-0001',
          title: 'Broken streetlight',
          description: 'Streetlight is not working',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          location: 'Main Street',
          created_at: '2026-10-01T10:30:00.000Z',
          updated_at: '2026-10-02T11:45:00.000Z',
          overdue_flag: false,
          category_name: 'Roads',
          department_name: 'Public Works',
          requester_name: 'Avery Citizen',
          requester_email: 'avery@example.com',
          requester_phone: '555-0100',
          ext_requester_name: null,
          ext_requester_email: null,
          ext_requester_phone: null,
          assigned_to_name: 'Sam Staff',
          attachment_count: '2',
        },
      ],
    });

    const result = await requestsModel.findAll();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'request-1',
      reference: 'CC-0001',
      status: 'In Progress',
      priority: 'High',
      requesterName: 'Avery Citizen',
      assignedTo: 'Sam Staff',
      hasAttachment: true,
      attachmentCount: 2,
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM service_requests r'));
  });
});
