require('dotenv').config({ path: '.env.staging', quiet: true });
const { Client } = require('pg');
const bcrypt = require('bcrypt');
async function verify() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const users = (
      await client.query(
        "SELECT email,password_hash FROM users WHERE email LIKE '%staging@example.com' ORDER BY email"
      )
    ).rows;
    for (const user of users) {
      if (!(await bcrypt.compare(process.env.STAGING_MOCK_PASSWORD, user.password_hash))) {
        throw new Error(`Mock password verification failed: ${user.email}`);
      }
    }
    console.log(`Verified passwords for ${users.length} staging users.`);
    console.log(
      (
        await client.query(
          "SELECT user_type,count(*)::int AS count FROM users WHERE email LIKE '%staging@example.com' GROUP BY user_type ORDER BY user_type"
        )
      ).rows
    );
    console.log(
      (
        await client.query(
          'SELECT d.name,count(DISTINCT c.category_id)::int AS categories,count(DISTINCT sa.staff_id)::int AS staff FROM departments d LEFT JOIN request_categories c ON c.department_id=d.department_id LEFT JOIN staff_assignments sa ON sa.department_id=d.department_id AND sa.is_active GROUP BY d.name ORDER BY d.name'
        )
      ).rows
    );
    console.log(
      (
        await client.query(
          'SELECT status,count(*)::int AS count FROM service_requests GROUP BY status ORDER BY status'
        )
      ).rows
    );
  } finally {
    await client.end();
  }
  const response = await fetch('https://civicconnect-staging.onrender.com/health');
  console.log('Render health:', response.status, await response.text());
  if (!response.ok) throw new Error('Render health check failed.');
}
verify().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
