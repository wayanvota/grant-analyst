# Grant Analyst end-to-end test report

## Scope

The harness builds the production React/Vite frontend and runs it in Chromium
against a deterministic local HTTP API. The API preserves the application's
browser-session, workspace, document, review, evidence, correction, export,
validation, and security contracts without contacting Neon or OpenAI.

The optional OpenAI smoke test is separate, credential-gated, excluded from CI,
and makes one small structured request. Production deployment tests remain in
`tests/live-smoke.test.mjs` and the opt-in three-review paid suite remains in
`tests/paid-analysis.test.mjs`.

## Required categories

| ID | Category | Expected behavior |
| --- | --- | --- |
| U01 | Public interface and safeguards | Purpose and confidentiality warning render; no secret names leak |
| U02 | Required-field behavior | Browser prevents incomplete workspace submission |
| U03 | Workspace creation and navigation | Workspace is created and can be reopened |
| U04 | Pasted proposal | Text becomes a proposal-labeled document |
| U05 | File upload | Supported proposal file appears as user-supplied evidence |
| U06 | Document removal | Confirmed removal updates the workspace and disables review |
| U07 | Full review | Browser-to-API flow displays a deterministic decision and score |
| U08 | Result inspection | Scorecard, claims, stress questions, and sources remain accessible |
| U09 | Fact correction | Human-confirmed fact persists after reopening the review |
| U10 | Workspace deletion | Confirmed deletion removes the workspace from the session |
| A01 | Missing session | API rejects unauthenticated workspace access |
| A02 | Weak session | Short or malformed session value is rejected |
| A03 | Cross-session isolation | Another browser session receives no workspace data |
| A04 | CORS boundary | Disallowed origin is rejected before API access |
| A05 | Missing required data | API rejects an incomplete workspace payload |
| A06 | Oversized text | API rejects over-limit text instead of silently truncating it |
| A07 | Malformed JSON | Parser fails closed without a stack trace |
| A08 | Unsupported upload | Executable extension is rejected |
| A09 | No-proposal guard | Analysis cannot start without a proposal-labeled source |
| A10 | Route and method abuse | Unknown route, unsupported method, and traversal attempt fail closed |

## Verification record

Status: passed locally on 2026-09-11 with Node 22.16.0.

- Existing backend tests: 20 passed
- Existing frontend tests: 2 passed
- Deterministic E2E categories: 20 passed, exactly U01-U10 and A01-A10
- Production frontend and backend build checks: passed
- TypeScript and backend syntax checks: passed
- High-severity dependency audit: 0 vulnerabilities at all severities
- Optional OpenAI smoke using an authorized local key: passed; structured
  evidence boundary accepted

Reproduce with:

```bash
npm ci
npx playwright install chromium
npm run test:ci
npm audit --audit-level=high
```

Optional authorized live smoke:

```bash
OPENAI_API_KEY=... npm run test:live:openai
```

No live credential is required or read by the deterministic suite or GitHub
Actions workflow.
