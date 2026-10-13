// Run with PERFORMANCE_TEST=1 on an otherwise idle test worker. This measures
// the staff search HTTP path with a fixed representative result set.
jest.mock('../../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../../src/modules/requests/requests.model', () => ({
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
  searchStaffRequests: jest.fn(),
  findCategoriesByDepartment: jest.fn(),
}));
jest.mock('../../src/modules/users/users.model', () => ({ findStaffDepartment: jest.fn() }));
const request = require('supertest');
const app = require('../../src/app');
const requestsModel = require('../../src/modules/requests/requests.model');
const usersModel = require('../../src/modules/users/users.model');

const enabled = process.env.PERFORMANCE_TEST === '1' ? describe : describe.skip;
const sample = Array.from({ length: 2500 }, (_, index) => ({
  id: `request-${index}`,
  reference: `CC-2026-${String(index + 1).padStart(4, '0')}`,
  title: `Search workload request ${index}`,
  category: 'Roads',
  status: 'Submitted',
  priority: 'Medium',
  submittedAt: '2026-10-01 10:00',
  requesterName: 'Sample Requester',
}));

enabled('Staff request search performance', () => {
  jest.setTimeout(60000);
  it('keeps 100 staff search page reads below 800 ms p95 with a 2,500-row result set', async () => {
    usersModel.findStaffDepartment.mockResolvedValue({
      departmentId: 'roads',
      departmentName: 'Roads',
    });
    requestsModel.searchStaffRequests.mockResolvedValue(sample);
    requestsModel.findCategoriesByDepartment.mockResolvedValue([{ id: 'roads', name: 'Roads' }]);
    const agent = request.agent(app);
    // Auth service is mocked in this isolated suite to avoid measuring password hashing.
    const authService = require('../../src/modules/auth/auth.service');
    jest.spyOn(authService, 'authenticate').mockResolvedValue({
      id: 'staff-performance',
      name: 'Perf Staff',
      email: 'perf@example.test',
      role: 'staff',
      departmentId: 'roads',
    });
    await agent
      .post('/auth/login')
      .type('form')
      .send({ email: 'perf@example.test', password: 'x' });
    const durations = [];
    let errors = 0;
    for (let index = 0; index < 105; index += 1) {
      const start = process.hrtime.bigint();
      const response = await agent.get('/staff/dashboard');
      durations.push(Number(process.hrtime.bigint() - start) / 1e6);
      if (response.status !== 200) errors += 1;
      if (index === 4) durations.length = 0; // discard five warm-up reads
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    process.stdout.write(`Staff search: p95=${p95.toFixed(1)}ms, errors=${errors}/105\n`);
    expect(errors).toBe(0);
    expect(p95).toBeLessThan(800);
  });
});
