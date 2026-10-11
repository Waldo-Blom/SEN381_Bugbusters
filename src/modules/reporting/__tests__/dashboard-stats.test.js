jest.mock('../reporting.model', () => ({
  findManagedDepartment: jest.fn(),
  findDashboardRequests: jest.fn(),
  findDashboardStats: jest.fn(),
}));

const model = require('../reporting.model');
const service = require('../reporting.service');

describe('Dashboard statistics presentation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    model.findManagedDepartment.mockResolvedValue({ id: 'department', name: 'Utilities' });
    model.findDashboardRequests.mockResolvedValue([]);
  });

  it('converts PostgreSQL counts and calculates percentages with closed requests included', async () => {
    model.findDashboardStats.mockResolvedValue({
      open: '3',
      overdue: '2',
      resolved: '2',
      closed: '1',
      eligible_total: '6',
      avg_response_hours: '2.345',
      sla_total: '3',
      sla_met: '2',
    });
    const data = await service.getDashboardData('manager');
    expect(data.stats).toEqual({
      open: 3,
      overdue: 2,
      resolved: 2,
      closed: 1,
      avgResponseHours: '2.3',
      resolutionRate: '50.0',
      slaCompliance: '66.7',
      slaTotal: 3,
    });
    expect(model.findDashboardStats).toHaveBeenCalledWith('manager', 'department');
  });

  it('represents missing samples as unavailable rather than zero or NaN', async () => {
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
    const { stats } = await service.getDashboardData('manager');
    expect(stats.avgResponseHours).toBeNull();
    expect(stats.resolutionRate).toBeNull();
    expect(stats.slaCompliance).toBeNull();
  });

  it('preserves genuine zero durations and zero percentages', async () => {
    model.findDashboardStats.mockResolvedValue({
      open: '1',
      overdue: '0',
      resolved: '0',
      closed: '0',
      eligible_total: '1',
      avg_response_hours: '0',
      sla_total: '1',
      sla_met: '0',
    });
    const { stats } = await service.getDashboardData('manager');
    expect(stats.avgResponseHours).toBe('0.0');
    expect(stats.resolutionRate).toBe('0.0');
    expect(stats.slaCompliance).toBe('0.0');
  });
});
