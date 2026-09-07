# Validation correction: browser scenarios C and D

Earlier successful CI workflow conclusions were over-interpreted as proof that
all browser scenarios ran. This is corrected explicitly.

In run [34056113058](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34056113058),
the emulator logs report **one skipped test** for Lot C and **one skipped test**
for canonical results (Lot D). Their condition expected FUNCTIONS_EMULATOR_HOST,
which the invoked CLI did not provide. Other unit, Rules, Functions and Lot B
checks did execute; their evidence is not invalidated by this finding.

The real Staging D scenario did execute and fail. It verified the canonical
transfer reads, then failed because the first pupil control was absent.
The page waits for a grades query before rendering pupils. Existing Rules deny
secretary access to general raw grades, and the new pedagogy query lacked a
separate authorized read scope. Read-only production-service query-shape checks
against Staging, using nonexistent synthetic IDs, returned HTTP 200 for all
three index shapes; the index hypothesis was not supported.

The correction marks only server-created pedagogy results as
pedagogySecretaryReadable, constrains both Centre queries to that marker and
permits only same-school secretary reads of those results. General grade privacy,
cross-school denial and all client write denials remain unchanged.
A dedicated Rules regression verifies these boundaries.

CI now fails instead of silently skipping C/D when emulator configuration is
missing, and uses the two actual exported emulator host variables.
Future C/D success must be checked in the executed test output, not inferred
from the workflow conclusion. Historical C/D browser-success claims without
execution proof are superseded by this correction.

The failed Staging run cleaned its synthetic fixture successfully. A subsequent
read-only check found no remaining Synthetic results school.
No real pupil data or Production state was changed.

## First verified executed C/D checkpoint

On a444ef58cd361ec80017fa09061d243c3b33dd06,
[run 34057580247](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34057580247)
actually executed C (one passed, 18.9 seconds) and D (one passed, 17.3 seconds).
C required a further modular Timestamp import fix, revealed only after removing
the silent skip. Its cleanup completed. Full unit regression: 687 passed.
This is Linux emulator validation with synthetic teacher decisions and a mock
generator, NOT real OpenAI, real teacher approval or Staging deployment proof.
