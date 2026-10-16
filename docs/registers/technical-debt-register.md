# Proposed Technical Debt Register

## TD-PERF-001 — Performance verification integration

- **Category:** Testing Automation / Verification Integration
- **Description:** Performance testing is maintained separately from the staging verification
  workflow pending further refinement, review and integration.
- **Reason:** Limited M3 delivery time and prioritisation of a stable release candidate.
- **Technical consequences:** Performance tests are not yet part of staging verification; future
  performance regressions may not be detected automatically; manual execution is required;
  additional review and configuration work remains.
- **Current mitigation:** The manually executable [PT-001 test](../../tests/performance/README.md)
  and its [recorded execution evidence](../../tests/performance/evidence/request-submission-evidence.md).
  Authorised local and Render-hosted sanity/full runs were completed on 16 October 2026.
  Submission/persistence checks passed in both environments. Local latency failed; the subsequent
  Render-hosted full run passed with p95 453.98 ms. Both results and their environment limitations
  remain recorded separately from this deferred-integration debt.
- **Future resolution:** Review implementation; expand coverage if justified; finalise testing
  configuration; submit a pull request into staging; complete peer review; merge the approved
  implementation; consider a controlled performance-testing CI workflow.
- **Status:** Open — Integration Deferred.
- **Review state:** Proposed local entry for owner review; no issue, PR or integration created.

The debt concerns deferred integration. Successful execution and recorded evidence can coexist
with this debt remaining open; do not label an executed test incomplete merely because it is unmerged.
