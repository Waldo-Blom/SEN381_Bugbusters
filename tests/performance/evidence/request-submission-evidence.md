# PT-001 execution evidence

Status: **BLOCKED / NOT RUN — awaiting owner review, configuration and explicit execution approval.**
Copy this template for each run. Do not replace blanks with estimated measurements.

| Field | Record |
|---|---|
| Test | PT-001 — Concurrent Service Request Submission |
| Requirements | FR-101; supporting FR-105/NFR-101; NFR-201 (<800 ms p95 under normal load) |
| Purpose | Observe concurrent authenticated request creation and persistence |
| Execution approval / isolation evidence | Pending |
| Run ID, executor, date/time/timezone | Pending |
| Application environment / approved origin (no credentials) | Pending |
| Tested commit / branch / uncommitted diff evidence | Pending |
| Render plan, region, instances, cold/warm state, configuration | Pending |
| Neon isolated environment, region, compute, sleep state | Pending |
| Runner OS, hardware, network/location, k6 version | Pending |
| Dataset size, active category, synthetic account assumptions | Pending |
| Side effects / notification isolation review | Pending |
| VUs, ramp/steady/down, pacing, timeout/grace | Pending |
| Planned / actual duration; setup included? | Pending |
| Expected | Valid unique submissions return exact 302; persisted rows reconcile; no errors; p95 <800 ms |
| Normal-load interpretation approved? | Pending; requirement does not define normal load |
| Actual behaviour | |
| Attempted submissions | |
| HTTP successes pending persistence | |
| Failed submissions / unaccounted or interrupted attempts | |
| Success rate / error rate | |
| Mean / median response time (ms) | |
| p90 / p95 / maximum response time (ms) | |
| Validation / authentication / authorisation-or-CSRF failures | |
| Server / timeout / transport / rate-limit / unexpected failures | |
| Attempt/s and HTTP success/s; denominator/window | |
| Persistence pre-run count / post-run count / distinct titles / references | |
| Row-marker/account/category reconciliation; ambiguous commits | |
| Render / Neon resource evidence (or unavailable) | |
| k6 exit code / each threshold outcome | |
| Classification: PASS / FAIL / BLOCKED | BLOCKED / NOT RUN |
| Interpretation against NFR-201 and functional validity gates | |
| Follow-up action / reviewer | |
| Evidence links: summary, optional time series, sanitized SQL rows, resource captures | |

Limitations to retain and contextualise: this is one closed-loop HTTP write scenario, not maximum
capacity, a whole municipality, long-term reliability or all operations. No attachments/browser
rendering/notification performance is covered. Hosting, network, DB compute, cold starts and data
volume influence results. HTTP redirects alone do not prove persistence. Sanity has a small sample;
normal load is undefined. Record interrupted iterations and unavailable resource evidence honestly.
