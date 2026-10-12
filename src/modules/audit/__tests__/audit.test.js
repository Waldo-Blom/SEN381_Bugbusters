jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const { query, pool } = require('../../../config/database');
const eventBus = require('../../../shared/events/eventBus');
const auditModel = require('../audit.model');
const auditListener = require('../audit.listener');

const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };

describe('Audit model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes request status transitions as append-only audit entries without comment text', async () => {
    await auditModel.recordStatusChange(client, {
      actorId: 'actor-id',
      requestId: 'request-id',
      oldStatus: 'IN_PROGRESS',
      newStatus: 'RESOLVED',
      comment: 'private resolution details',
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO admin_audit_log');
    expect(sql).toContain("'STATUS_CHANGED'::action_type");
    expect(sql).toContain("'REQUEST'");
    expect(params).toEqual([
      'actor-id',
      'request-id',
      JSON.stringify({ oldStatus: 'IN_PROGRESS', newStatus: 'RESOLVED' }),
    ]);
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b/i);
  });

  it('writes contact access and assignment records with the expected targets and details', async () => {
    await auditModel.recordContactAccessChange(client, {
      actorId: 'manager-id',
      requestId: 'request-id',
      action: 'CONTACT_ACCESS_APPROVED',
      details: { approved: true },
    });
    await auditModel.recordAssignment(client, {
      actorId: 'manager-id',
      requestId: 'request-id',
      assignedToStaffId: 'staff-id',
      previousAssignee: 'old-staff-id',
    });

    expect(client.query.mock.calls[0][1]).toEqual([
      'manager-id',
      'CONTACT_ACCESS_APPROVED',
      'request-id',
      JSON.stringify({ approved: true }),
    ]);
    expect(client.query.mock.calls[1][1]).toEqual([
      'manager-id',
      'request-id',
      JSON.stringify({ assignedToStaffId: 'staff-id', previousAssignee: 'old-staff-id' }),
    ]);
  });

  it('queries request history together with request audit entries in manager scope', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await auditModel.getAuditLog({
      managerId: 'manager-id',
      departmentId: 'department-id',
      limit: 25,
      offset: 10,
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('FROM request_status_history');
    expect(sql).toContain('FROM request_assignment_history');
    expect(sql).toContain('FROM admin_audit_log');
    expect(sql).toContain("a.target_type IN ('USER', 'ASSIGNMENT')");
    expect(sql).toContain("'USER_DEACTIVATED'");
    expect(sql).toContain('d.manager_id = $2 AND d.department_id = $3');
    expect(sql).toContain('d.manager_id = $2');
    expect(sql).toContain('d.department_id = $3');
    expect(params).toEqual([null, 'manager-id', 'department-id', null, 25, 10]);
  });

  it('writes manager staff actions as audit log entries', async () => {
    await auditModel.recordAdminUserEvent(client, {
      actorId: 'manager-id',
      actionType: 'USER_DEACTIVATED',
      targetType: 'USER',
      targetId: 'staff-id',
      changedData: { isActive: false },
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO admin_audit_log');
    expect(sql).toContain('$2::action_type');
    expect(sql).toContain('$3::target_type');
    expect(params).toEqual([
      'manager-id',
      'USER_DEACTIVATED',
      'USER',
      'staff-id',
      JSON.stringify({ isActive: false }),
    ]);
  });

  it('refuses to read a manager audit log without a department scope', async () => {
    await expect(auditModel.getAuditLog({ managerId: 'manager-id' })).rejects.toThrow(
      'Manager and department scope are required'
    );
    expect(query).not.toHaveBeenCalled();
  });
});

describe('Audit listener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.connect.mockResolvedValue(client);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to lifecycle events and records the audit fields', async () => {
    const statusChange = jest.spyOn(auditModel, 'recordStatusChange').mockResolvedValue();
    const unregister = auditListener.register();

    eventBus.emitAuditEvent('RequestStatusChanged', {
      requestId: 'request-id',
      userId: 'actor-id',
      oldStatus: 'SUBMITTED',
      newStatus: 'ASSIGNED',
      comment: 'must not be persisted',
    });
    await new Promise((resolve) => setImmediate(resolve));
    unregister();

    expect(statusChange).toHaveBeenCalledWith(client, {
      actorId: 'actor-id',
      requestId: 'request-id',
      oldStatus: 'SUBMITTED',
      newStatus: 'ASSIGNED',
    });
    expect(client.release).toHaveBeenCalled();
  });

  it('logs connection failures without rejecting the event handler', async () => {
    const error = new Error('database unavailable');
    pool.connect.mockRejectedValueOnce(error);
    const logger = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      auditListener.handleRequestStatusChanged({
        requestId: 'request-id',
        userId: 'actor-id',
        oldStatus: 'SUBMITTED',
        newStatus: 'ASSIGNED',
      })
    ).resolves.toBeUndefined();
    expect(logger).toHaveBeenCalledWith(
      '[AuditListener] Failed to record status change audit for request request-id:',
      error
    );
  });
});
