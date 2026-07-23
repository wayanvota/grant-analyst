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
3. Runs five review stages:
   - fact extraction and eligibility checks
   - current public funder research
   - proposal and claim due diligence
   - skeptical reviewer simulation
   - final adjudication and citation audit
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
