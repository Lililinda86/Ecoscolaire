# Targeted Production routing

Human-approved business source: 280d41e270d4bd09db8285d76e196923c8daeea8. Technical release commits change only deployment routing and its tests. Production base is e1f236ae5c370e9de5ccf9efaa99d53483b9b1a4.

The generic Production workflow retains all existing backup, branch/project, fail-closed and ACTIVE checks. A release-routing step compares the full business paths to the approved source. If identical, it deploys exactly scripts/limited-parameters-functions.json plus firestore:rules and verifies every scoped Function ACTIVE. The broader legacy manifest is retained as the fallback for future business releases, but is skipped for this limited release. No change to business logic or Rules.

Read-only baseline captured before merge includes school, students/classes, private finance, obligations, payments, receipts, advantages/moratoria, allocations, transport plans and ledgers. Production checks must not call a financial getter that lazily creates obligations. Use document reads, compiled-source/Rules provenance and authorization rejection checks instead. No Production fixture or payment is authorized.

Rollback target remains e1f236ae5c370e9de5ccf9efaa99d53483b9b1a4, with source archive and recent backup retained. Never import/recalculate financial data automatically during rollback.

Vercel Production waits for the exact merged SHA's successful Firebase backend workflow before building/publishing. Preview builds remain independent. The backend verifies the deployed Rules source hash after deployment. This avoids exposing the new frontend while the old backend is still active.

Vercel build command is pinned in `vercel.json` to `npm run vercel-build`. Production dashboard settings previously bypassed the npm script; repository configuration now enforces backend-before-frontend publication. This changes deployment ordering only, with no product or financial source changes.
