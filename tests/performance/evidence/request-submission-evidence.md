# PT-001 execution evidence

Status: **EXECUTED — local latency FAIL; subsequent Render-hosted run PASS. Submission and persistence checks passed in both environments.**

## Local execution — 16 October 2026

The owner authorised setup and execution against the existing Neon Staging database in chat.
The existing `.env` endpoint was matched to Neon branch metadata before execution. No Render,
bucket, schema or branch configuration was changed. Five synthetic requester accounts were created
through the normal registration endpoint and reused by both runs. The temporary credential file
and local execution helper were removed after testing. No real account credentials were used.

| Environment | Recorded value |
|---|---|
| Application | Local Express process bound to `http://127.0.0.1:3106`, stopped after each run |
| Tested branch | `staging_test/performance_test` |
| Tested commit | `8d63e6744c80025a7a6d0d4bd785c48ab79db58f` |
| Application source state | Clean working tree before preparation; only evidence files added before full run |
| Render | Not exercised; no Render plan or resource measurements apply |
| Neon | CivicConnect project; `Staging`, `br-rough-pond-b54xlapu`; `civicconnect_dev` |
| Neon region / configured compute limits | `aws-us-east-2`; 0.25–2 CU; actual resource utilisation not collected |
| Runner | Windows 10.0.26200, x64, 8 logical CPUs, approximately 20 GiB RAM; Node v20.15.1 |
| k6 | v2.2.0, commit `00a9a1b7f5`, windows/amd64 |
| Initial data | 150 existing service requests, 67 users; 5 synthetic users added before sanity |
| Full-run initial data | 152 requests, 72 users; same five test accounts reused |
| Category | Existing active UUID `06a77de9-6a87-47ab-a1fa-ccf2678a057f` |
| Side effects | No triggers found on users/service_requests; creation emits no notification event; synthetic `example.invalid` accounts; no attachments |
| Cold/warm conditions | Endpoint was idle in metadata before preparation; registration/read queries exercised it before measured submissions. Cache state and actual compute were not instrumented |
| Workload | Sanity: 1 VU, 1/5/1 seconds. Full: 5 VUs, 10/60/10 seconds. Both: 1–2 second pacing, 30-second request timeout, 35-second graceful completion settings |

| Measurement | Sanity | Full |
|---|---:|---:|
| Run ID | `sanity-20261016105919144` | `full-20261016110003959` |
| Local start (Africa/Johannesburg, UTC+2) | 12:59:27 | 13:00:08 |
| Local end | 12:59:36 | 13:01:36 |
| Planned workload seconds | 7 | 80 |
| Attempts | 2 | 90 |
| Expected HTTP successes | 2 | 90 |
| Failed submissions | 0 | 0 |
| HTTP success / error rate | 100% / 0% | 100% / 0% |
| Mean response time (ms) | 1,650.85 | 2,536.09 |
| Median response time (ms) | 1,650.85 | 2,565.07 |
| p90 response time (ms) | 1,658.14 | 2,960.51 |
| p95 response time (ms) | 1,659.06 | 3,046.85 |
| Maximum response time (ms) | 1,659.97 | 4,475.91 |
| Overall successful submissions/second | 0.2324 | 1.0240 |
| Persisted records / distinct titles / distinct references | 2 / 2 / 2 | 90 / 90 / 90 |
| Interrupted or unaccounted attempts | 0 | 0 |
| k6 exit code | 99 | 99 |
| `p(95)<800` | FAIL | FAIL |
| Nonzero attempts / zero submission errors | PASS / PASS | PASS / PASS |
| Persistence reconciliation | PASS | PASS |
| Overall classification | FAIL — latency | FAIL — latency |

All validation, authentication, authorisation-or-CSRF, rate-limit, server, timeout, transport and
unexpected-response counters were zero in both summaries. Every persisted marker was unique;
references were unique; VU/iteration sequences were contiguous; requester ownership and category
matched the designated accounts and configured category. Pre-run prefix counts were zero.
The summaries retain their original "NOT VERIFIED" persistence text because the script itself
does not query the database. The separate persistence exports and execution metadata record the
subsequent database verification; raw summaries were not rewritten to imply an automatic check.

The sanity run passed functional and persistence checks but failed latency. Its automatic full-run
gate stopped. The full workload was then deliberately executed under the existing owner
authorisation to collect concurrent evidence, reusing the same accounts and unchanged 800 ms
threshold. No repeated full runs or threshold adjustments were made.

Interpretation: CivicConnect accepted and persisted all submissions in this workload, but the
measured operation did not meet NFR-201's latency criterion under these recorded conditions.
Full-run p95 was approximately 3.81 times the 800 ms limit. This is useful failure evidence and
does not indicate that the k6 implementation failed to submit requests. The test does not isolate
the cause. Remote database round trips, serial request-number allocation and pool contention are
possible contributors requiring investigation, not proven causes. "Normal system load" remains
undefined, and these results do not measure Render-hosted application performance.

Throughput uses total k6 elapsed time, including preparation/grace, rather than a steady-state
window. Exact elapsed seconds are retained in each summary. Small sanity samples do not support
strong percentile conclusions. No server/DB resource time series was collected. The test is one
short closed-loop scenario, not a production capacity or endurance assessment.

Evidence:

- [Sanity raw summary](sanity-20261016105919144-summary.json)
- [Sanity persistence rows](sanity-20261016105919144-persistence.json)
- [Sanity environment and reconciliation](20261016105919144-execution.json)
- [Full raw summary](full-20261016110003959-summary.json)
- [Full persistence rows](full-20261016110003959-persistence.json)
- [Full environment and reconciliation](20261016110003959-execution.json)

The temporary k6 stderr logs were removed after results were recorded. The linked JSON summaries
retain the threshold outcomes and exit codes are recorded in the execution metadata.
No passwords, cookies, tokens or connection strings are included in the linked evidence.
92 synthetic service requests and five synthetic accounts remain in Staging. No cleanup occurred.
Peer review of the results and any investigation/remediation remains outstanding.

## Render-hosted execution — 16 October 2026

The owner subsequently requested the test against Render and confirmed the workspace. The existing
service was inspected; no service creation, deployment, restart, environment-variable change or
Git write was performed. k6 ran on the same Windows runner and sent HTTPS requests to Render.
The application itself ran on Render, rather than locally. This is a second environment execution
of PT-001, not an additional performance scenario. Earlier local evidence above remains unchanged.

| Environment | Recorded value |
|---|---|
| Hosted URL | `https://civicconnect-staging.onrender.com` |
| Render service | `civicconnect-bugbusters`, `srv-db75l2cs728c73dh7k3g` |
| Render configuration | Free plan, Virginia, one configured instance |
| Deployed application branch / commit | `staging` / `f6ecc481b3819eb5edb1fa097453bba70c7b645f` |
| Deployment | `dep-db7pn0qj9qps73da6th0`; confirmed live with the same commit after the run |
| Test script branch / commit | `staging_test/performance_test` / `87c7210dddefed7791102ece8467b0ce887e5ab0` |
| Source comparison | No differences found between deployed and test commits in inspected auth, submission route/controller/service/schema/model, session or notification-listener code |
| Database | Existing approved Neon Staging database and category recorded above |
| Database binding verification | Each of five new synthetic accounts registered through Render was found in the approved database before workload execution |
| Initial database counts | 242 service requests, 72 users; five synthetic requester accounts then added |
| Runner | Same Windows machine and k6 v2.2.0; no local application process used |
| Preparation and warm state | Initial `/health` call returned 200 after 22,513 ms; account registration followed. Preparation latency is excluded from submission metrics |
| Side effects | No triggers found on users/service_requests; normal registration and creation paths reviewed; only synthetic `example.invalid` accounts, no attachments |

| Measurement | Render sanity | Render full |
|---|---:|---:|
| Run ID | `render-sanity-20261016115053593` | `render-full-20261016115053593` |
| Local start, UTC+2 | 13:51:33 | 13:51:47 |
| Local end, UTC+2 | 13:51:44 | 13:53:17 |
| Maximum VUs | 1 | 5 |
| Ramp / hold / down seconds | 1 / 5 / 1 | 10 / 60 / 10 |
| Overall k6 elapsed seconds, including setup/grace | 11.38 | 90.13 |
| Attempts / expected HTTP successes / failures | 4 / 4 / 0 | 191 / 191 / 0 |
| Success / error rate | 100% / 0% | 100% / 0% |
| Average response time (ms) | 462.11 | 353.62 |
| Median response time (ms) | 345.89 | 329.98 |
| p90 response time (ms) | 681.89 | 396.75 |
| p95 response time (ms) | 752.43 | 453.98 |
| Maximum response time (ms) | 822.96 | 824.84 |
| Overall successful submissions/second | 0.3514 | 2.1193 |
| Persisted rows / distinct titles / distinct references | 4 / 4 / 4 | 191 / 191 / 191 |
| Interrupted or unaccounted attempts | 0 | 0 |
| Ownership, category and contiguous markers | PASS | PASS |
| Pre-run prefix row count | 0 | 0 |
| k6 exit code | 0 | 0 |
| p95 <800 ms / zero errors / nonzero attempts | PASS / PASS / PASS | PASS / PASS / PASS |
| Classification | PASS | PASS |

Pacing remained 1–2 seconds, request timeout 30 seconds, and graceful completion settings 35 seconds.
All failure-category counters were zero. Persistence was independently checked after each workload;
the raw summaries' pending-persistence labels were retained and are supplemented by the row exports
and execution metadata. The original 800 ms threshold was not changed.

Render resource samples were requested at 30-second resolution for 11:50–11:54 UTC, covering
preparation, both workloads and surrounding time. The highest returned CPU sample was 0.08975237
CPU units against the reported 0.15 limit (approximately 59.8%). Highest returned memory was
65,478,656 bytes (62.45 MiB) against approximately 512 MiB. These are maxima of returned samples,
not continuous peaks. HTTP latency/request-count and instance-count time series returned no points;
k6 provides the submission latency and throughput evidence. No Neon resource time series was
collected. No inference about resource headroom or maximum capacity is made from these samples.

Interpretation: this Render-hosted workload met PT-001's latency and functional gates and all
195 submissions across sanity/full persisted. The lower latency than the local run is consistent
with different application hosting/network conditions, but the test does not prove a particular
cause. No performance optimisation was applied between runs. Application commits and initial
data volumes differ and are recorded explicitly. Results must not be presented as an improvement
caused by a code fix or as proof of all-operation/production-scale NFR-201 compliance.

The initial health response took 22.5 seconds; its cause was not isolated. This preparation is
outside the measured operation, so the PASS does not demonstrate cold-start performance. The sanity
sample is small; percentile interpolation can yield p95 below 800 ms even with an individual request
above 800 ms. The full-run maximum also exceeded 800 ms; the configured requirement compares p95,
not the maximum. Other scope and environment limitations described above still apply.

Hosted evidence:

- [Execution environment and reconciliation](render-20261016115053593-execution.json)
- [Sanity summary](render-sanity-20261016115053593-summary.json)
- [Sanity persisted rows](render-sanity-20261016115053593-persistence.json)
- [Full summary](render-full-20261016115053593-summary.json)
- [Full persisted rows](render-full-20261016115053593-persistence.json)
- [Render resource samples and post-run deployment check](render-20261016115053593-resources.json)

Five additional synthetic accounts and 195 additional requests remain in Staging from this hosted
execution (ten accounts and 287 requests across local plus hosted executions). No cleanup occurred.
The temporary runner was removed; its generated passwords existed only in process memory and were
not saved. No secrets are included in these artefacts. Peer review remains outstanding.

## Template for future executions

Copy the following for later runs; it is not the status of the executions recorded above.

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
