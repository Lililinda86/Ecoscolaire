# Integrated financial settings / collection audit

Baseline: staging `6bdcc95` (2026-09-06). Development isolated from Production.

## Existing authorities and compatibility

- `Settings.tsx` directly saves `schools.globalFees`, `schools.classFees`, and `transportPolicy`. Other institution, cycles, governance, logo/contact, payment provider, academic calendar, subjects and classes controls must remain available.
- `secretaryCollections.readTuitionGross` prioritizes class-name tariffs; studentFinance/global fees are legacy fallbacks only when no class table exists. Missing class entries fail closed; zero/missing installments are not invented.
- Registration uses studentFinance.registrationFeeExpected; uniforms use the studentFinance snapshot then the school global fallback. These differ from class tuition lookup and must be reconciled without repricing existing obligations.
- `schoolFeeCatalog` schemaVersion 2 entries are immutable. Mandatory applicable fees are assigned by the account transaction; optional fees require an authorized explicit assignment. Archive freezes existing mandatory obligations before disabling new assignments.
- `studentFeeAssignments` stores immutable fee snapshots. No second allocation/payment engine is needed.
- `transportPaymentPolicy` centralizes ITALO 4000/5000 constants. Nursery/primary pay; secondary is free. `studentTransportPlans` snapshots monthly amounts and pickup points. PK changes take effect next month and preserve periods already paid. School billing periods are explicit.
- `getStudentFinancialAccount` and `recordCashCollection` share `buildAccountLines`. Collection writes payment, receipt, allocations, ledger, counter and audit atomically. Overpayment and duplicate obligation guards are server-side; replay authorizes the caller before returning financial details.
- `reverseCashCollection` uses compensating entries. The legacy projection trigger skips V3 reversals to preserve other collections.
- Benefits: secretary create/submit, director/owner approval/rejection; only approved/applied statuses affect quotes. Moratoria change effective dates, not principal. Existing legacy benefit adapters must remain.
- Stored receipts snapshot line amounts and identity. Immediate collection success/PDF currently omits some stored receipt metadata; improve presentation without rewriting stored receipts.
- Firestore denies client writes to assignments/plans/catalog; generic school configuration writes still permit direct financial tariff changes. Versioned tariff configuration needs a server-only write path and matching Rules.
- Staging workflow explicitly deploys V3/benefit functions, plus `getSchoolFeeCatalog`, `manageSchoolFee`, `setStudentTransportPlan`. New exports must be added explicitly; Production workflow remains out of scope.

## UX gaps

- Settings is a long flat page with mixed tariff/policy sections and repeated hard-coded ITALO explanations.
- Encaissement renders every unpaid obligation as a flat list, including all transport months. Preserve the desktop sticky basket, student selector, due dates, benefits drawer and amount/Solder controls while grouping by category.
- Group totals must be supplied by the existing server account projection, not become a new frontend debt calculation.
- Catalog categories, immutable obligations and optional assignment already exist; extend metadata conservatively rather than replace documents.

## Delivery gates

Run existing financial/benefit/reversal/legacy suites plus configuration history, role/isolation and grouped UI tests. Execute actual Linux emulator/Rules CI if Windows remains unavailable. Staging fixtures only, cleanup verified. No Production deployment, historical rewrite or destructive migration.
