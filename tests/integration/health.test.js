const { spawn } = require('child_process');
const http = require('http');

// Give the server time to start, connect to the database, and begin listening.
jest.setTimeout(30000);

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Poll the /health endpoint until it returns 200, or reject after timeoutMs.
 */
function waitForServer(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const attempt = () => {
      http
        .get(`${url}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            retry();
          }
        })
        .on('error', () => retry());
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server did not respond within ${timeoutMs}ms`));
        return;
      }
      setTimeout(attempt, 500);
    };

    attempt();
  });
}

describe('Health Check — server startup', () => {
  let serverProcess;

  beforeAll(async () => {
    serverProcess = spawn('node', ['src/server.js'], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
    });

    // Surface server stderr in Jest output for easier debugging.
    serverProcess.stderr.on('data', (data) => {
      console.error(`[server stderr] ${data.toString().trim()}`);
    });

    await waitForServer(BASE_URL);
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  it('GET /health returns 200 with { status: "ok" }', async () => {
    const { statusCode, body } = await new Promise((resolve, reject) => {
      http
        .get(`${BASE_URL}/health`, (res) => {
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, body: raw }));
        })
        .on('error', reject);
    });

    expect(statusCode).toBe(200);
    expect(JSON.parse(body)).toEqual({ status: 'ok' });
  });
});
