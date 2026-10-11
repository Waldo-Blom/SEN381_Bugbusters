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

  it('lists only requests belonging to the requester user ID', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          request_id: 'request-1',
          request_number: 'CC-0001',
          title: 'Broken streetlight',
          description: 'Streetlight is not working',
          status: 'SUBMITTED',
          priority: 'MEDIUM',
          location: 'Main Street',
          created_at: '2026-10-01T10:30:00.000Z',
          updated_at: '2026-10-01T10:30:00.000Z',
          requester_email: 'avery@example.com',
        },
      ],
    });

    const result = await requestsModel.findByRequesterId('requester-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'request-1',
      requesterEmail: 'avery@example.com',
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE r.requester_id = $1'), [
      'requester-1',
    ]);
  });

  it('limits a requester detail query to both request ID and requester ID', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await expect(requestsModel.findById('request-1', 'requester-1')).resolves.toBeNull();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE r.request_id = $1 AND r.requester_id = $2'),
      ['request-1', 'requester-1']
    );
  });

  it('lists requests created by a database user ID', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await expect(requestsModel.findByCreatorId('staff-1')).resolves.toEqual([]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE r.created_by = $1'), [
      'staff-1',
    ]);
  });

  it('searches saved community members with a parameterized, bounded query', async () => {
    const members = [
      {
        id: 'external-1',
        firstName: 'Taylor',
        lastName: 'Morgan',
        phone: '555-0100',
        email: null,
        preferredContactMethod: 'PHONE',
      },
    ];
    db.query.mockResolvedValue({ rows: members });

    await expect(requestsModel.searchExternalRequesters('Taylor')).resolves.toEqual(members);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM external_requesters'), [
      '%Taylor%',
    ]);
    expect(db.query.mock.calls[0][0]).toContain('LIMIT 10');
    expect(db.query.mock.calls[0][0]).toContain('concat_ws');
  });

  it('inserts a requester submission into service_requests through a DB transaction', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes('COALESCE(MAX')) {
          return { rows: [{ last_sequence: 0 }] };
        }
        if (sql.includes('INSERT INTO service_requests')) {
          return {
            rows: [
              {
                request_id: 'request-1',
                request_number: 'CC-2026-0001',
                status: 'SUBMITTED',
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    db.pool.connect.mockResolvedValue(client);

    const result = await requestsModel.create(
      {
        requesterId: 'requester-1',
        externalRequester: null,
        createdBy: 'requester-1',
        categoryId: 'category-1',
        title: 'Pothole',
        description: 'A pothole in the road.',
        location: 'Oak Street',
        priority: 'HIGH',
      },
      () => 'CC-2026-0001'
    );

    expect(result.request_id).toBe('request-1');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('(request_number, requester_id, external_requester_id, created_by,'),
      [
        'CC-2026-0001',
        'requester-1',
        null,
        'requester-1',
        'category-1',
        'Pothole',
        'A pothole in the road.',
        'Oak Street',
        'HIGH',
      ]
    );
    expect(client.query.mock.calls.some(([sql]) => sql.includes('submission_channel'))).toBe(false);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('inserts an operator submission and external requester in one DB transaction', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes('COALESCE(MAX')) {
          return { rows: [{ last_sequence: 1 }] };
        }
        if (sql.includes('INSERT INTO external_requesters')) {
          return { rows: [{ external_requester_id: 'external-1' }] };
        }
        if (sql.includes('INSERT INTO service_requests')) {
          return {
            rows: [
              {
                request_id: 'request-2',
                request_number: 'CC-2026-0002',
                status: 'SUBMITTED',
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    db.pool.connect.mockResolvedValue(client);

    await requestsModel.create(
      {
        requesterId: null,
        externalRequester: {
          firstName: 'Taylor',
          lastName: 'Morgan',
          phone: '555-0100',
          email: null,
          preferredContactMethod: 'PHONE',
        },
        createdBy: 'staff-1',
        categoryId: 'category-1',
        title: 'Pothole',
        description: 'A caller reported a pothole.',
        location: 'Oak Street',
        priority: 'HIGH',
      },
      () => 'CC-2026-0002'
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO external_requesters'),
      ['Taylor', 'Morgan', '555-0100', null, 'PHONE']
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO service_requests'),
      [
        'CC-2026-0002',
        null,
        'external-1',
        'staff-1',
        'category-1',
        'Pothole',
        'A caller reported a pothole.',
        'Oak Street',
        'HIGH',
      ]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('links an existing community member without inserting a duplicate', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes('COALESCE(MAX')) {
          return { rows: [{ last_sequence: 2 }] };
        }
        if (sql.includes('INSERT INTO service_requests')) {
          return {
            rows: [
              {
                request_id: 'request-3',
                request_number: 'CC-2026-0003',
                status: 'SUBMITTED',
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    db.pool.connect.mockResolvedValue(client);

    await requestsModel.create(
      {
        requesterId: null,
        externalRequesterId: 'external-1',
        externalRequester: null,
        createdBy: 'staff-1',
        categoryId: 'category-1',
        title: 'Pothole',
        description: 'A caller reported a pothole.',
        location: 'Oak Street',
        priority: 'HIGH',
      },
      () => 'CC-2026-0003'
    );

    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO external_requesters'))
    ).toBe(false);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO service_requests'),
      [
        'CC-2026-0003',
        null,
        'external-1',
        'staff-1',
        'category-1',
        'Pothole',
        'A caller reported a pothole.',
        'Oak Street',
        'HIGH',
      ]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('lists active request categories by name', async () => {
    const categories = [{ id: 'category-1', name: 'Roads' }];
    db.query.mockResolvedValue({ rows: categories });

    await expect(requestsModel.findCategories()).resolves.toEqual(categories);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM request_categories'));
    expect(db.query.mock.calls[0][0]).toContain('WHERE is_active = true');
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY name');
    expect(db.query.mock.calls[0][0]).not.toContain('display_order');
  });

  describe('updateStatus', () => {
    it('throws error and rolls back when request is already in target status', async () => {
      const client = {
        query: jest.fn(async (sql) => {
          if (sql === 'BEGIN') return {};
          if (sql.includes('SELECT status FROM service_requests')) {
            return { rows: [{ status: 'RESOLVED' }] };
          }
          if (sql === 'ROLLBACK') return {};
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      db.pool.connect.mockResolvedValue(client);

      await expect(
        requestsModel.updateStatus('req-1', 'Resolved', 'Duplicate resolve comment', 'staff-1')
      ).rejects.toThrow('Request is already Resolved');

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(
        client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO request_comments'))
      ).toBe(false);
      expect(client.release).toHaveBeenCalled();
    });

    it('inserts comment and updates status using actor userId when transitioning to a new status', async () => {
      const client = {
        query: jest.fn(async (sql) => {
          if (sql === 'BEGIN') return {};
          if (sql.includes('SELECT status FROM service_requests')) {
            return { rows: [{ status: 'IN_PROGRESS' }] };
          }
          if (sql.includes('UPDATE service_requests')) return {};
          if (sql.includes('INSERT INTO request_status_history')) return {};
          if (sql.includes('INSERT INTO request_comments')) return {};
          if (sql === 'COMMIT') return {};
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      db.pool.connect.mockResolvedValue(client);
      db.query.mockResolvedValue({ rows: [] });

      await requestsModel.updateStatus('req-1', 'Resolved', 'Fixed successfully', 'staff-1');

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO request_comments'),
        expect.arrayContaining(['req-1', 'staff-1', 'Fixed successfully'])
      );
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();
    });
  });
});
