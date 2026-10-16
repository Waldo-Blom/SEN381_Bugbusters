/* global __ENV, __VU, __ITER */
/* eslint-env es6 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// No application imports, dotenv loading, remote modules, or implicit target.
const base = (__ENV.PT_BASE_URL || '').replace(/\/$/, '');
const runId = __ENV.PT_RUN_ID || '';
const categoryId = __ENV.PT_CATEGORY_ID || '';
const mode = __ENV.PT_MODE || 'full';
function positive(name, fallback, integer = false) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be a positive ${integer ? 'integer' : 'number'}`);
  }
  return value;
}
const vus = positive('PT_VUS', mode === 'sanity' ? 1 : 5, true);
const ramp = positive('PT_RAMP_SECONDS', mode === 'sanity' ? 1 : 10);
const steady = positive('PT_STEADY_SECONDS', mode === 'sanity' ? 5 : 60);
const down = positive('PT_DOWN_SECONDS', mode === 'sanity' ? 1 : 10);
const paceMin = positive('PT_PACE_MIN_SECONDS', 1);
const paceMax = positive('PT_PACE_MAX_SECONDS', 2);
if (!['full', 'sanity'].includes(mode) || paceMax < paceMin) {
  throw new Error('Invalid PT_MODE or pacing range');
}
if (!/^https?:\/\/[^/?#@\s]+$/.test(base)) {
  throw new Error('PT_BASE_URL must be an explicit origin without credentials, path or query');
}
if (!/^[A-Za-z0-9-]{1,60}$/.test(runId)) {
  throw new Error('PT_RUN_ID must contain 1-60 letters, digits or hyphens; use a fresh ID per run');
}
if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(categoryId)) {
  throw new Error('PT_CATEGORY_ID must be an existing active category UUID');
}
// Credentials never enter metric tags or result files. Parse errors must not echo input.
let accounts;
try {
  accounts = JSON.parse(__ENV.PT_ACCOUNTS_JSON || '[]');
} catch {
  throw new Error('PT_ACCOUNTS_JSON must be a JSON array of test credentials');
}
if (
  !Array.isArray(accounts) ||
  accounts.length < vus ||
  accounts.some(
    (a) =>
      !a || typeof a.email !== 'string' || !a.email || typeof a.password !== 'string' || !a.password
  ) ||
  new Set(accounts.map((a) => a.email.toLowerCase())).size !== accounts.length
) {
  throw new Error(
    'Supply at least PT_VUS distinct requester test accounts with email and password'
  );
}

const attempted = new Counter('pt_attempted');
const successful = new Counter('pt_successful');
const failed = new Counter('pt_failed');
const successRate = new Rate('pt_success_rate');
const errorRate = new Rate('pt_error_rate');
const duration = new Trend('pt_submission_ms', true);
const outcomes = new Counter('pt_outcomes');
const outcomeCounts = Object.fromEntries(
  [
    'http_success_pending_persistence',
    'unexpected',
    'timeout',
    'transport_error',
    'authentication',
    'authorisation_or_csrf',
    'validation',
    'rate_limited',
    'server_error',
  ].map((name) => [name, new Counter(`pt_outcome_${name}`)])
);

export const options = {
  scenarios: {
    PT001: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${ramp}s`, target: vus },
        { duration: `${steady}s`, target: vus },
        { duration: `${down}s`, target: 0 },
      ],
      gracefulRampDown: '35s',
      gracefulStop: '35s',
    },
  },
  noCookiesReset: true,
  setupTimeout: '120s',
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
  // NFR-201 is formal; zero errors and nonzero attempts are PT-001 validity gates.
  thresholds: {
    pt_submission_ms: ['p(95)<800'],
    pt_error_rate: ['rate==0'],
    pt_attempted: ['count>0'],
  },
  // Avoid target URLs in time-series exports. Never enable HTTP debug logging.
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
};

export function setup() {
  if (
    __ENV.PT_APPROVED !== 'yes' ||
    __ENV.PT_APPROVED_BASE_URL !== base ||
    __ENV.PT_ISOLATION_CONFIRMED !== 'yes'
  ) {
    throw new Error(
      'Execution requires explicit approval, exact approved origin and isolation confirmation'
    );
  }
  const sessions = [];
  for (let i = 0; i < vus; i++) {
    const jar = http.cookieJar();
    jar.clear(base);
    const login = http.post(`${base}/auth/login`, accounts[i], {
      redirects: 0,
      timeout: '30s',
      tags: { name: 'setup_login', phase: 'setup' },
    });
    if (login.status !== 302 || login.headers.Location !== '/requester/my-requests') {
      throw new Error(`Test account ${i + 1} requester login failed (status ${login.status})`);
    }
    const form = http.get(`${base}/requester/submit`, {
      redirects: 0,
      timeout: '30s',
      tags: { name: 'setup_form', phase: 'setup' },
    });
    const csrf = form.status === 200 ? form.html().find('input[name="_csrf"]').attr('value') : '';
    const category =
      form.status === 200
        ? form.html().find(`select[name="categoryId"] option[value="${categoryId}"]`).size()
        : 0;
    const cookies = jar.cookiesForURL(`${base}/requester/submit`);
    if (!csrf || !category || !cookies['connect.sid']) {
      throw new Error(`Test account ${i + 1} form, session, category or CSRF setup failed`);
    }
    sessions.push({ csrf, cookies });
  }
  return { sessions };
}

let sessionLoaded = false;
export default function (data) {
  const session = data.sessions[__VU - 1];
  if (!session) throw new Error('No session for VU; do not override k6 VU allocation');
  if (!sessionLoaded) {
    const jar = http.cookieJar();
    for (const name of Object.keys(session.cookies)) {
      jar.set(base, name, session.cookies[name][0], { path: '/' });
    }
    sessionLoaded = true;
  }
  const marker = `PT001-${runId}-vu${__VU}-i${__ITER}`;
  const fields = {
    _csrf: session.csrf,
    categoryId,
    title: marker,
    description: `Synthetic municipal issue for controlled PT-001 run ${runId}.`,
    location: `Synthetic Test Street ${__VU}`,
    priority: 'MEDIUM',
  };
  // Match the browser multipart form, including its enforced CSRF path; no images.
  const boundary = `----CivicConnect${runId}${__VU}${__ITER}`;
  const body =
    Object.entries(fields)
      .map(
        ([name, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
      .join('') + `--${boundary}--\r\n`;
  attempted.add(1);
  const response = http.post(`${base}/requester/submit`, body, {
    redirects: 0,
    timeout: '30s',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    tags: { name: 'PT001_submit', phase: 'submission' },
  });
  const ok = response.status === 302 && response.headers.Location === '/requester/my-requests';
  let outcome = 'unexpected';
  if (ok) outcome = 'http_success_pending_persistence';
  else if (response.status === 0)
    outcome = response.error_code === 1050 ? 'timeout' : 'transport_error';
  else if (response.status === 401) outcome = 'authentication';
  else if (response.status === 403) outcome = 'authorisation_or_csrf';
  else if ([400, 413, 422].includes(response.status)) outcome = 'validation';
  else if (response.status === 429) outcome = 'rate_limited';
  else if (response.status >= 500) outcome = 'server_error';
  successful.add(ok ? 1 : 0);
  failed.add(ok ? 0 : 1);
  successRate.add(ok);
  errorRate.add(!ok);
  duration.add(response.timings.duration);
  outcomes.add(1, { outcome });
  for (const name of Object.keys(outcomeCounts)) {
    outcomeCounts[name].add(name === outcome ? 1 : 0);
  }
  check(response, { 'submission returns expected redirect': () => ok });
  sleep(paceMin + Math.random() * (paceMax - paceMin));
}

export function handleSummary(data) {
  const count = (name) => data.metrics[name]?.values.count || 0;
  const attempts = count('pt_attempted');
  const successes = count('pt_successful');
  const failures = count('pt_failed');
  const elapsed = data.state.testRunDurationMs / 1000;
  const report = {
    testId: 'PT-001',
    runId,
    mode,
    workload: {
      vus,
      rampSeconds: ramp,
      steadySeconds: steady,
      downSeconds: down,
      paceMin,
      paceMax,
    },
    attempts,
    httpSuccessesPendingPersistence: successes,
    failures,
    accountedSubmissions: successes + failures,
    interruptedOrUnaccounted: attempts - successes - failures,
    successRate: attempts ? successes / attempts : null,
    errorRate: attempts ? failures / attempts : null,
    responseTimeMs: data.metrics.pt_submission_ms?.values || null,
    elapsedSecondsIncludingSetupAndGrace: elapsed,
    attemptedPerSecondOverall: elapsed ? attempts / elapsed : null,
    successfulPerSecondOverall: elapsed ? successes / elapsed : null,
    // Deliberately whitelist aggregate metrics: no cookies, bodies, credentials or target.
    metrics: Object.fromEntries(
      Object.entries(data.metrics).filter(([name]) => name.startsWith('pt_'))
    ),
    persistence: 'NOT VERIFIED: reconcile unique titles in approved test database',
    target: 'NFR-201: p(95) < 800 ms; normal load is not formally defined',
  };
  const json = JSON.stringify(report, null, 2);
  return {
    stdout: `${json}\n`,
    [`tests/performance/evidence/${runId}-summary.json`]: json,
  };
}
