// Run with: node db/scripts/seed-staging.js (credentials stay in ignored .env.staging).
require('dotenv').config({ path: '.env.staging', quiet: true });
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('crypto');
const fs = require('fs');

async function seed() {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== 'ep-sparkling-credit-b59ekdio-pooler.c-7.us-east-2.aws.neon.tech') {
    throw new Error('Seed is restricted to the approved staging endpoint.');
  }
  let password = process.env.STAGING_MOCK_PASSWORD;
  if (!password) {
    password = `Stage!${randomBytes(12).toString('hex')}`;
    fs.appendFileSync('.env.staging', `\nSTAGING_MOCK_PASSWORD=${password}\n`);
  }
  const hash = await bcrypt.hash(password, 12);
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(fs.readFileSync('db/migrations/004_operator_user_type.sql', 'utf8'));
    await client.query('BEGIN');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const user = async (name, role) => {
      await client.query(
        `INSERT INTO users (email,password_hash,first_name,last_name,user_type,email_notifications_enabled)
        VALUES ($1,$2,$3,'Demo',$4,false) ON CONFLICT (email) DO NOTHING`,
        [`${name}@example.com`, hash, name, role]
      );
      return (
        await client.query('SELECT user_id FROM users WHERE email=$1', [`${name}@example.com`])
      ).rows[0].user_id;
    };
    const admin = await user('admin.staging', 'ADMIN');
    for (let i = 2; i <= 3; i++) await user(`admin${i}.staging`, 'ADMIN');
    for (let i = 1; i <= 3; i++) await user(`operator${i}.staging`, 'OPERATOR');
    const requesters = [];
    for (let i = 1; i <= 30; i++) requesters.push(await user(`requester${i}.staging`, 'REQUESTER'));
    const departments = ['Roads', 'Water', 'Sanitation', 'Electricity', 'Parks', 'Housing'];
    const categories = [
      ['Pothole repairs', 'Road markings', 'Traffic signs'],
      ['Water leaks', 'Water pressure', 'Water quality'],
      ['Waste collection', 'Illegal dumping', 'Sewer blockages'],
      ['Power outages', 'Street lighting', 'Electrical hazards'],
      ['Park maintenance', 'Tree maintenance', 'Playground repairs'],
      ['Housing maintenance', 'Housing applications', 'Building inspections'],
    ];
    const statuses = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'];
    for (let d = 0; d < departments.length; d++) {
      const manager = await user(`manager.${departments[d].toLowerCase()}.staging`, 'MANAGER');
      const staff = await user(`staff.${departments[d].toLowerCase()}.staging`, 'STAFF');
      const departmentStaff = [staff];
      for (let n = 2; n <= (d < 2 ? 4 : 3); n++) {
        departmentStaff.push(
          await user(`staff${n}.${departments[d].toLowerCase()}.staging`, 'STAFF')
        );
      }
      await client.query(
        `INSERT INTO departments (name,description,manager_id) VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`,
        [departments[d], 'Fictional department for staging demonstrations', manager]
      );
      const department = (
        await client.query('SELECT department_id FROM departments WHERE name=$1', [departments[d]])
      ).rows[0].department_id;
      for (const member of departmentStaff)
        await client.query(
          `INSERT INTO staff_assignments (staff_id,department_id,assigned_by)
        SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM staff_assignments WHERE staff_id=$1 AND department_id=$2 AND is_active)`,
          [member, department, admin]
        );
      const categoryIds = [];
      for (const name of categories[d]) {
        await client.query(
          `INSERT INTO request_categories (name,description,department_id,target_resolution_time)
          VALUES ($1,'Mock service category',$2,interval '3 days') ON CONFLICT (name) DO NOTHING`,
          [name, department]
        );
        categoryIds.push(
          (await client.query('SELECT category_id FROM request_categories WHERE name=$1', [name]))
            .rows[0].category_id
        );
      }
      for (let i = 0; i < 24; i++) {
        const categoryIndex = Math.floor(i / 6) % 3;
        const category = categoryIds[categoryIndex];
        const assignedStaff = departmentStaff[i % departmentStaff.length];
        const status = statuses[i % statuses.length];
        const assigned = ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status);
        const created = new Date(Date.now() - (i + 2) * 86400000);
        const assignedAt = new Date(created.getTime() + 3600000);
        const resolvedAt = new Date(created.getTime() + 2 * 86400000);
        const requester = requesters[(d * 24 + i) % requesters.length];
        const result = await client.query(
          `INSERT INTO service_requests
          (request_number,requester_id,created_by,category_id,title,description,location,status,priority,
           assigned_staff_id,assigned_by,assigned_at,created_at,updated_at,expected_completion_at,resolved_at,closed_at,overdue_flag)
          VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT (request_number) DO NOTHING RETURNING request_id`,
          [
            `MOCK-${d + 1}-${String(i + 1).padStart(3, '0')}`,
            requester,
            category,
            `${categories[d][categoryIndex]} near Demo Street ${i + 1}`,
            'Fictional staging request. Please use this record for testing only.',
            `${i + 1} Demo Street, Pretoria`,
            status,
            ['LOW', 'MEDIUM', 'HIGH', 'URGENT'][i % 4],
            assigned ? assignedStaff : null,
            assigned ? manager : null,
            assigned ? assignedAt : null,
            created,
            assigned ? resolvedAt : created,
            new Date(created.getTime() + 3 * 86400000),
            ['RESOLVED', 'CLOSED'].includes(status) ? resolvedAt : null,
            status === 'CLOSED' ? new Date(resolvedAt.getTime() + 86400000) : null,
            ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS'].includes(status) && i >= 2,
          ]
        );
        if (!result.rows.length) continue;
        const id = result.rows[0].request_id;
        if (assigned) {
          await client.query(
            `INSERT INTO request_assignment_history (request_id,assigned_to_staff_id,assigned_by_id,assigned_at) VALUES ($1,$2,$3,$4)`,
            [id, assignedStaff, manager, assignedAt]
          );
        }
        const sequence =
          status === 'REJECTED'
            ? ['SUBMITTED', 'REJECTED']
            : statuses.slice(0, statuses.indexOf(status) + 1);
        for (let s = 1; s < sequence.length; s++) {
          await client.query(
            `INSERT INTO request_status_history (request_id,old_status,new_status,changed_by,changed_at) VALUES ($1,$2,$3,$4,$5)`,
            [id, sequence[s - 1], sequence[s], manager, new Date(created.getTime() + s * 3600000)]
          );
        }
        await client.query(
          `INSERT INTO request_comments (request_id,commented_by,comment_type,content,created_at) VALUES ($1,$2,'NOTE',$3,$4)`,
          [
            id,
            assigned ? assignedStaff : requester,
            'Mock update: service request recorded for staging testing.',
            new Date(created.getTime() + 3600000),
          ]
        );
        if (status === 'IN_PROGRESS') {
          await client.query(
            `INSERT INTO request_contact_access_requests (request_id,requested_by,department_id,reason,requested_at) VALUES ($1,$2,$3,$4,$5)`,
            [
              id,
              assignedStaff,
              department,
              'Please approve contact access to arrange the mock site visit.',
              assignedAt,
            ]
          );
        }
      }
    }
    await client.query('COMMIT');
    for (const table of [
      'users',
      'departments',
      'request_categories',
      'service_requests',
      'request_comments',
      'request_status_history',
      'request_assignment_history',
      'request_contact_access_requests',
    ]) {
      console.log(table, (await client.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
    }
    console.log('Mock password saved in .env.staging as STAGING_MOCK_PASSWORD.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
