jest.mock('../reporting.model', () => ({
  findManagedDepartment: jest.fn(),
  findRecentActivity: jest.fn(),
  findDashboardStats: jest.fn(),
}));

const model = require('../reporting.model');
const service = require('../reporting.service');

describe('Dashboard activity presentation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    model.findManagedDepartment.mockResolvedValue({ id: 'department', name: 'Utilities' });
    model.findDashboardStats.mockResolvedValue({
      open: '0',
      overdue: '0',
      resolved: '0',
      closed: '0',
      eligible_total: '0',
      avg_response_hours: null,
      sla_total: '0',
      sla_met: '0',
    });
  });

  it('labels recorded events and preserves the database order and timestamp', async () => {
    model.findRecentActivity.mockResolvedValue([
      {
        event_type: 'comment',
        comment_type: 'RESOLUTION',
        actor: 'Staff',
        timestamp: '2026-10-11 14:30',
      },
      { event_type: 'assignment', assignee: 'New Staff' },
      { event_type: 'assignment', assignee: null },
      { event_type: 'status', event_status: 'IN_PROGRESS' },
      { event_type: 'submission' },
    ]);
    const { recentActivity } = await service.getDashboardData('manager');
    expect(recentActivity.map((event) => event.label)).toEqual([
      'Resolution comment added',
      'Assigned to New Staff',
      'Assignment removed',
      'Status changed to In Progress',
      'Request submitted',
    ]);
    expect(recentActivity[0].timestamp).toBe('2026-10-11 14:30');
    expect(recentActivity[0].actor).toBe('Staff');
    expect(recentActivity[4].actor).toBe('Unknown user');
    expect(model.findRecentActivity).toHaveBeenCalledWith('manager', 'department');
  });

  it('does not read activity when the manager has no department', async () => {
    model.findManagedDepartment.mockResolvedValue(null);
    expect(await service.getDashboardData('manager')).toBeNull();
    expect(model.findRecentActivity).not.toHaveBeenCalled();
  });
});
