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
