describe('Request search — performance plan', () => {
  // NFR-201: exercise the staff request search against a controlled representative dataset.
  // Workload: warm up, then collect at least 100 read-request timings at normal test-environment load.
  // Expected: report p95 latency and error rate; compare p95 with the stated <800 ms target.
  // Do not run against shared Neon data; use an isolated performance database/environment.
  test.todo('NFR-201 measures p95 latency and error rate for staff request search');
});
