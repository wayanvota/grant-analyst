# Grant Analyst

Grant Analyst is an evidence-first pre-submission review tool for grant
proposals. It tests eligibility, proposal merit, funder fit, evidence quality,
and competitive readiness. It does not predict whether a grant will be funded.

The public architecture deliberately separates presentation from privileged
services:

```text
wayan.com/grant-analyst (static files)
                 |
                 v
       Render Express API
          |            |
          v            v
    Neon Postgres   OpenAI API
```

The static frontend contains no database credentials or AI keys. Render is the
only component allowed to access Neon and OpenAI.

## What the MVP does

1. Creates a browser-private workspace for one proposal and opportunity.
2. Accepts pasted text or PDF, Office, text, and spreadsheet files.
3. Runs a two-layer fast review:
   - proposal extraction and due diligence run in parallel with cached or current funder research
   - skeptical review, adjudication, citation audit, and revision ranking run in one decision pass
4. Shows the decision, diagnostic scorecard, claim ledger, strongest rejection
   case, public sources, and revision priorities.
5. Records corrected facts, preserves review versions, and exports Markdown or
   JSON.

## Repository layout

- `frontend/`: React and Vite static frontend
- `frontend/dist/`: generated FTP-ready files, ignored by Git
- `backend/`: Express API for Render
- `backend/migrations/`: Neon Postgres schema
- `public/config.js`: runtime API URL copied into the frontend build
- `render.yaml`: Render Blueprint
- `docs/deployment.md`: deployment instructions
- `docs/trust-baseline.md`: verified trust-gap baseline
- `docs/build-1-trust-instrumentation.md`: local manifest and failure-semantics build

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
cp backend/.env.example .env.local
npm run migrate
npm run dev:backend
```

In another terminal:

```bash
npm run dev:frontend
```

For local development, change `public/config.js` to:

```js
window.GRANT_ANALYST_CONFIG = {
  apiBase: "http://localhost:10000"
};
```

Never commit `.env.local`.

## Build and verify

```bash
npm run lint
npm test
npm run build
```

The FTP artifact is the contents of `frontend/dist/`, not the directory itself.

## Production tests

The free production suite checks the public frontend, static assets, Render
health and metadata, security headers, CORS, browser-session enforcement,
workspace isolation, validation, Neon CRUD, and cleanup:

```bash
npm run test:live
```

The paid suite is opt-in and never runs in normal CI. It starts exactly three
two-layer OpenAI reviews with synthetic proposals, validates that each complete
result finishes within 90 seconds, and deletes the test workspaces and OpenAI
files afterward:

```bash
RUN_PAID_OPENAI_TESTS=1 PAID_TEST_RUNS=3 npm run test:paid-live
```

Do not set `RUN_PAID_OPENAI_TESTS=1` unless the account owner has approved the
OpenAI charges.

## Public-demo safeguards

The backend includes:

- strict CORS allowlisting
- helmet security headers
- IP request throttling
- a random browser bearer session stored only in the browser
- a peppered session hash in Neon
- per-browser and global daily review quotas
- document count and size limits
- server-only OpenAI and Neon credentials
- prompt-injection defenses for uploaded documents
- 14-day shared funder-research caching
- explicit OpenAI time budgets and marked safeguard results
- ownership checks on every workspace, document, review, correction, and export

The browser session is lightweight pseudonymous access, not full
authentication. Do not invite users to submit confidential proposals until you
add an identity provider and a clear retention policy.

## Deploy

Follow [docs/deployment.md](docs/deployment.md) for Neon, Render, FTP, and
verification steps.

## Open source

MIT licensed. Forks should replace the API URL, set their own CORS origins and
usage limits, and supply their own Neon and OpenAI credentials.
