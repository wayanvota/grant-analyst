# Build 1: Trust Instrumentation

**Status:** Implemented and verified locally  
**Production status:** Not migrated or deployed  
**Baseline:** [Grant Analyst Trust Baseline](trust-baseline.md)

## What this build changes

Build 1 adds the minimum instrumentation required to explain how a review was produced and to prevent failed analysis from appearing as a clean result.

Each finished review now receives an immutable analysis manifest containing:

- review and workspace identifiers
- proposal version
- source snapshot hash
- correlation ID
- schema, rubric, pipeline, prompt, and module versions
- SHA-256 hashes of every analysis prompt
- model and provider configuration
- provider request and response IDs when available
- module start time, completion time, duration, status, and error code
- overall completion state
- structured analysis errors
- analysis start and completion time

The confirmed-fact snapshot field is present and explicitly null until Build 2 implements the fact-confirmation gate.

## Explicit completion states

New reviews use:

- `complete`
- `complete_with_warnings`
- `partial`
- `failed`
- `awaiting_analysis` while running

Legacy `completed` reviews remain readable by the frontend.

A review containing a timed-out or invalid stage is stored as `partial`. It remains openable because the safeguard report and limitations are useful, but it cannot appear as a clean completion.

## Structured errors

Analysis failures are classified with stable codes:

- `ANALYSIS_TIMEOUT`
- `ANALYSIS_SCHEMA_INVALID`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_AUTHENTICATION_FAILED`
- `PROVIDER_REQUEST_FAILED`
- `INTERNAL_ANALYSIS_ERROR`
- `SERVICE_RESTARTED`

Stored messages are safe summaries. Provider credentials and raw secret-bearing errors are not copied into the review result.

## Correlation

Every API response receives a server-generated `X-Correlation-ID` header. The review correlation ID is recorded in:

- the review row
- the analysis manifest
- upload and review audit events
- provider request records
- completion or failure audit events
- export audit events

This supports tracing one review without exposing the pseudonymous browser token.

## Manifest immutability

Migration `003_trust_manifest.sql` adds the manifest and completion fields. A database trigger enforces two rules:

1. A stored analysis manifest cannot be changed.
2. The manifest embedded in `reviews.result` must match `reviews.analysis_manifest`.

The migration has been reviewed and tested as a file. It has not been applied to Neon.

## Sanitized fixtures

The local fixture set now covers:

- an eligible documented proposal
- an ineligible applicant
- conflicting amounts, dates, and beneficiary totals
- unsupported load-bearing claims
- a broken budget
- conflicting current and archived funder rules
- prompt injection
- a technology proposal with governance gaps
- a non-technology proposal where technology review should be skipped

The fixtures are synthetic and contain no direct contact information.

## Local release checks

The build must pass:

```bash
npm run lint
npm test
npm run build
git diff --check
```

Production smoke and paid OpenAI tests are deferred until the owner approves the migration and deployment.

## Remaining P0 work

Build 1 makes reviews traceable at the request and configuration level. It does not create passage-level evidence or fix fact authority.

Build 2 must:

- extract decision-critical facts before full analysis
- preserve exact source locations
- require confirmation, correction, unknown status, or explicit override
- create an immutable confirmed-fact snapshot
- pass that snapshot into dependent analysis
- prove through tests that corrections change later analysis inputs

Evidence passages, independent citation audit, and deterministic budget analysis remain subsequent gated builds.
