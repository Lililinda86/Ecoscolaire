# Real synthetic AI trial: quality is not HTTP success

## Update: five document analyses completed, Scheduler conflict diagnosed

[Continuation 34187407004](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34187407004)
on Staging1e872bff59426c8004ca1990875291c902072569 reused the first two results
without provider calls and completed the three remaining analyses. Cumulative:
5 Responses and5input-token preflights,5,663input/888output tokens, estimated
USD0.003688 (not invoice), USD0.445 reserved. No assessment operation was consumed.
Title anchors passed4/5; content anchors passed5/5. These narrow checks are not
an accuracy score: nursery title was omitted, and language/subject interpretation
still requires comparison with the source. The incomplete PDF left absent fields
empty; the secondary image result visibly included the new missing-assessment warning.

The two simultaneous Scheduler RunJob mutations conflicted: one returned ABORTED
“sync mutate calls cannot be queued”, the other was accepted after the trial
configuration had been disabled. Cloud audit showed jobs.run permission granted.
No IAM grant was added. Subsequent bounded reads confirmed zero Friday run,
zero trial receipt, zero assessment consumption and disabled configuration.
Exact disposable cleanup passed; all consumed audit records remain.

The assessment-only continuation serializes the two dispatch requests and accepts
only this diagnosed manifest, five retained successful document operations,
unchanged USD0.445 reservation and no Friday run/receipt. It is claimed once,
does not invoke any document-analysis callable and can consume at most the five
remaining assessments. This is an implemented control, not yet a live PASS.

## Initial attempt (historical)

On Staging SHA d42ad3f9248a3e3c09dacf7e91d8f9fef8f7ca99,
[run 34185299765](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34185299765)
verified the private gateway secret binding and completed two real document
analyses with gpt-4.1-mini-2025-04-14. Secret values were never read.

Observed usage: 1,063 input tokens and 356 output tokens; estimated upper-bound
list-price cost USD0.000996, not an invoice. Two generation requests and two
input-token preflights succeeded. USD0.178 remains reserved, not refunded, in the
original USD2 trial ledger. No assessment generation ran in this attempt.

The French pre-nursery document passed the title/content anchors. The English
nursery document preserved its objective, materials and activities but omitted
the visible title “Listening to initial sounds”. This is a real quality failure,
not a passing extraction and not a validated curriculum. High model confidence
did not establish completeness. Source comparison and teacher review remain
necessary; the application explicitly flags missing core fields without filling
them with invented content.

Exact disposable school/user/document/Storage cleanup passed. The disabled AI
configuration, operations and consumption ledger and manifest remain as audit
and replay protection. No real school records or Production were changed.

The diagnosed continuation accepts only this failed, fully cleaned attempt
and its two successful operations. It reads those results without invoking them
again, preserves the consumed ledger, and may execute only the three remaining
document analyses and five assessment generations. It is claimed once and
cannot be rerun automatically. Original quality failures remain in the final
report even if independent checks complete. Its implementation/tests are not
evidence that this continuation has already run.
