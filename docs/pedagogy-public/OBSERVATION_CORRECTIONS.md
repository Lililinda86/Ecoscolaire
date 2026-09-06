# Recorded observation corrections

The pupil profile allows an explicit correction of a current observation when
its pupil, preparation and objective references are available. It uses the
existing server transaction; it does not overwrite the old observation.

The secretary must select the responsible teacher, provide the corrected
context/reason and confirm receipt of that correction. Pupil, class, subject,
preparation and objective are not editable through this form. Concurrent
corrections of the same observation are rejected by the existing backend.

An uncertain network result locks the captured payload and retries its request
ID. A definite business rejection permits editing. Unsaved forms lock pupil
navigation and other action forms. Existing remediation review snapshots are
not rewritten by a later correction.

Two local component tests passed, along with frontend typecheck and scoped
lint. The integrated synthetic browser scenario now performs a correction,
checks old/new linkage and preservation of the earlier remediation review,
and cleans the observation batch receipt. Its CI result remains required.

No teacher decision, durable mastery, real pupil outcome or Staging browser
success is inferred from these local tests.
