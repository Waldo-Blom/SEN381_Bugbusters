require('dotenv').config();

const { query, closePool } = require('../../src/config/database');

async function testDatabase() {
  try {
    console.log('Testing CivicConnect Neon connection...\n');

    // Confirm the connection works and report which database and user it reached.
    const connection = await query(`
      SELECT
        current_database() AS database_name,
        current_user AS database_user
    `);

    const database = connection.rows[0];

    console.log('Connection successful!');
    console.log('Database:', database.database_name);
    console.log('User:', database.database_user);

    // Guard against accidentally running this development check on another database.
    if (database.database_name !== 'civicconnect_dev') {
      throw new Error(`Wrong database: ${database.database_name}`);
    }

    // Verify that every table expected by the application exists in the public schema.
    const tables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const expectedTables = [
      'users',
      'external_requesters',
      'departments',
      'staff_assignments',
      'request_categories',
      'service_requests',
      'request_attachments',
      'request_status_history',
      'request_assignment_history',
      'request_comments',
      'admin_audit_log',
    ];

    const actualTables = tables.rows.map((row) => row.table_name);
    const missingTables = expectedTables.filter((table) => !actualTables.includes(table));

    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(', ')}`);
    }

    console.log('All 11 CivicConnect tables found!');

    // Report row counts as a quick check that the main request tables can be queried.
    const requests = await query(`
      SELECT COUNT(*)::int AS total
      FROM service_requests
    `);

    const externalRequesters = await query(`
      SELECT COUNT(*)::int AS total
      FROM external_requesters
    `);

    console.log('Service requests:', requests.rows[0].total);
    console.log('External requesters:', externalRequesters.rows[0].total);

    console.log('\nAll database checks passed!');
  } catch (error) {
    console.error('\nDatabase test failed:', error.message);
    process.exitCode = 1;
  } finally {
    // Close the pool so this standalone script can exit cleanly.
    await closePool();
  }
}

testDatabase();
