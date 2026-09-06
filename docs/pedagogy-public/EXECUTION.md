# Pedagogy finalization: public engineering checkpoint

This document is a deliberately separate, sanitized maintenance summary.
Local school inventories, reports, real records and credentials are excluded.
The publication branch starts from staging without importing local report history.

## Implemented, awaiting validation on this branch

- Explicit teaching declarations: a prepared lesson is not a taught lesson.
- Partial teaching excerpts, version checks and idempotent recording.
- Preschool qualitative observations with teacher attribution and rectification.
- Versioned class policies; no numeric preschool assessment.
- Assessment generation gateway with explicit secure configuration, privacy and
  budget approvals, reservations and no silent live mock fallback.
- Synthetic authorization, concurrency, evidence and policy regression tests.

## Execution sequence

1. Audit every exported commit and changed blob; publish only sanitized code.
2. Run types, lint, full unit tests, Functions tests and builds on the new SHA.
3. Run Linux Firestore/Storage Rules, Functions integration and A/B/C browser tests.
4. Complete source provenance/library, testable automation, canonical results and
   remediation, secretary workflows, scope isolation and rendered print validation.
5. Run real integrations only after approved secure configuration and budget exist.
6. Integrate with required repository approvals; deploy and validate exact Staging
   SHA, clean only the synthetic fixtures, then prepare the human review handoff.

## Evidence boundaries

An emulator fixture is not a real AI, scheduler or pedagogical validation.
An invoked print button is not a rendered PDF validation.
Earlier checkpoint tests do not certify the current SHA.
No real AI verification, complete curriculum coverage, completed automation,
Staging delivery or human pedagogical approval is claimed by this document.
Production is outside this work's authorization.

## Test privacy

The dedicated CI uses synthetic demo projects and no production credentials.
Browser authentication traces and screenshots are disabled for the pedagogy
release gate and the Staging configuration. Runtime-generated test passwords
must never be printed. Local validation logs remain ignored.
The emulator's disposable secret override follows Firebase's documented
[local secret override](https://firebase.google.com/docs/functions/config-env#secrets_and_credentials_in_the_emulator)
mechanism; it is not a real provider key.
