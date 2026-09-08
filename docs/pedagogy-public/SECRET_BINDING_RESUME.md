# Staging secret binding correction

Firebase CLI 15.25.0 discovers Node Functions in a sanitized child environment.
The custom runtime flag and project dotenv values are unavailable at this stage.
This caused a successful deployment with no secret binding despite the runtime flag.

The binding declaration now recognizes CLI discovery only for the exact Staging
project and never for emulators or other projects. Runtime provider authorization
still requires the explicit flag, fixed synthetic envelope, approved model and
persistent USD2 allowance. Discovery itself does not enable provider calls.

An isolated SDK manifest regression test uses no key or credentials. Deployment
also verifies actual metadata and the private invoker policy before continuing.
No secret value is read by these checks. This correction alone is not proof of
real AI extraction or generation; those require the controlled live trial.

The earlier local watch/provenance checkpoint remains separate and unpublished.
Existing financial integrations on Staging are preserved.

## Bounded real-trial proof

The unchanged five document fixtures include a primary French PDF with no
prerequisites or differentiation. The live checks require those fields to remain
empty and missing information to be warned about. This is not a handwriting or
illegible-photo benchmark. Extracted synthetic content and question/answer pairs
are retained for review, together with tokens, conservative cost and latency.

One of the five assessment generations is assigned to the existing real Friday
scheduler. Its controlled clock is accepted only for the fixed synthetic Staging
school and trial; every other school/project retains the actual clock. The
secretary configuration API cannot set this internal test marker. The harness
refuses to trigger the job while any other school has enabled Friday automation.
Two deliveries must complete with one run and one provider reservation. A later
manual call must reuse the generated draft. No extra model calls are authorized.

The configuration is disabled in cleanup. Its non-personal delivery receipts
and run record are intentionally retained with the consumed trial ledger, not
misreported as deleted fixtures. No teacher decision or real teaching is certified.
