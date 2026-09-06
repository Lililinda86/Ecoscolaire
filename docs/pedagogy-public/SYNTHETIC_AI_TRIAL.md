# Bounded synthetic AI trial

This is an execution safety boundary, not a successful live-provider report.
Runtime remains disabled until private Staging configuration is ready.

- Destination: api.openai.com, Responses and input-token counting endpoints only.
- Exact model: gpt-4.1-mini-2025-04-14; no substitution.
- One global allowance: USD 2 maximum reserved cost, at most five preparation
  analyses and five assessment generations. No other purpose is permitted.
- The ledger survives date changes, configuration versions, failures and fixture
  cleanup. An uncertain paid request consumes its reservation and is not retried.
- Only the fixed synthetic trial school on ecoscolaire-staging is accepted.
- Documents must match one of five compiled SHA256/MIME pairs. A synthetic school
  identifier, file name, user-provided checksum or MIME alone is insufficient.
- The three PDF and two PNG fixtures are original generated test material.
  All five rendered pages were inspected. The PNGs are rendered pages, not camera
  photographs; these fixtures do not prove robustness to real photographed work.
- Provider token counting runs after reservation; an excessive/unknown count
  blocks generation. No external tools, URL files, stored conversation or pupil
  metadata are requested.
- Extracted text remains a draft. Model confidence is not measured accuracy.
  No official curriculum alignment, teaching or teacher approval is inferred.

## Verification status

Local tests cover exact-byte allowlisting, modified-byte refusal, purpose limits,
the global allowance, reservation before simulated transport, retained uncertain
reservations and refusal before generation when preflight exceeds reservation.
Simulated transport tests are NOT real AI validation. Linux CI and the actual
limited trial must still produce evidence tied to their final SHA.

The empty Secret Manager container is infrastructure only, not an operational
provider credential. Never add a key value to the repository or CI logs.

## Sources and reproduction

Original fixture authoring source: scripts/generate-pedagogy-synthetic-documents.py.
Changing the PDF or rasterizer output changes the allowlist and requires review.
Do not regenerate and silently accept new hashes during CI.

Official protocol references:
[File inputs](https://developers.openai.com/api/docs/guides/file-inputs),
[Counting tokens](https://developers.openai.com/api/docs/guides/token-counting),
[Model and pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

store:false is not a promise of zero provider retention. No real school, pupil
or teacher records are authorized for this trial.
