# Controlled document watch

## Live baseline evidence

[Run34187428876](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34187428876)
passed on Staging1e872bff59426c8004ca1990875291c902072569. The actual Scheduler job
retrieved the original public fixture and recorded baseline SHA256
118d234e4b0870331ed592419c4eadea525011365614faf15fee0617e56b0a7e
at2026-09-08T04:44:13.982Z. No AI call was involved. The synthetic user was removed;
the source was disabled and its school/configuration retained for the change phase.
This proves the baseline only. Version2 must be published and its actual detection,
explicit synthetic review and final fixture cleanup verified before claiming the
complete live watch scenario. No institutional document was authenticated by this test.

The direction configures up to ten HTTPS sources per school under Pedagogy >
Settings. The secretary can read status, not activate sources or record a review.
Public hosts are restricted to MINEDUB, MINESEC and CEDUC, with one exact original
Staging fixture URL for testing. Redirects must remain within that allowlist.

Each scheduled tick reads at most six sources, up to 2 MiB each, within 15 seconds
per source. No source body or provider prompt is stored or sent to AI. Fingerprints,
content type, byte count and dates are retained. A hostname or successful retrieval
does not authenticate a curriculum or grant redistribution rights.

The first successful check creates a baseline. A new hash creates a pending review;
a later unchanged hash does not clear it. An unavailable source reports failure
while retaining the previous successful fingerprint and its date. Configuration
versions and transactional leases prevent stale responses from replacing edits.

After receiving an actual file review, direction can record its note against the
exact current version and fingerprint. This neither authenticates nor publishes
nor adopts a curriculum. A failed check or changed fingerprint blocks that action.
Review history is server-only writable and scoped to the school.

Unit tests simulate HTTP. The emulator scenario adds real Firestore transactions,
authorization, concurrency, changed-file review and failure handling. Only a separate
deployed scheduler run against a changing public fixture can establish live operation.
The live baseline above is separate from these simulated-HTTP tests; full live
changed-file review remains pending until its separate report is recorded.

## Documentary coverage limit

The MINESEC programmes index identifies separate French and English catalogues:
https://www.minesec.gov.cm/web/index.php/fr/systeme-educatif/progammes-officiels

This index is not an imported corpus. The previously indexed Sciences 6e/5e download
returned a file-unavailable page on recheck. MINEDUB document retrieval timed out.
No mirror, textbook list or generated template is labelled an authenticated curriculum.
CEDUC connectivity and reuse rights remain unverified. The eight original activity
templates continue to be available, with teacher review pending.
