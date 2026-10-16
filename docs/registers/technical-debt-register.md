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
  and its execution evidence, once completed. Implementation is available; execution is currently
  pending owner review, environment preparation and explicit approval.
- **Future resolution:** Review implementation; expand coverage if justified; finalise testing
  configuration; submit a pull request into staging; complete peer review; merge the approved
  implementation; consider a controlled performance-testing CI workflow.
- **Status:** Open — Integration Deferred.
- **Review state:** Proposed local entry for owner review; no issue, PR or integration created.

The debt concerns deferred integration. Successful execution and recorded evidence can coexist
with this debt remaining open; do not label an executed test incomplete merely because it is unmerged.
