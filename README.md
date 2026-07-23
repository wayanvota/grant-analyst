# Grant Analyst

Grant Analyst is a private, evidence-first pre-submission review tool. It tests
proposal merit, eligibility, funder fit, evidence quality, and competitive
readiness. Its recommendation is an assessment, not a prediction of funding.

## MVP workflow

1. Create one workspace for an organization, funder, and opportunity.
2. Paste or upload the proposal, funder materials, and supporting evidence.
3. Run a five-stage review:
   - structured fact extraction
   - current public funder research
   - proposal due diligence and claim testing
   - skeptical reviewer simulation
   - final adjudication and citation audit
4. Review the decision, weighted scorecard, claim ledger, rejection case,
   source audit, and prioritized revisions.
5. Correct extracted facts, re-run the analysis, compare versions, and export
   Markdown or JSON.

## Architecture

- Next.js-compatible UI and API routes built with vinext
- OpenAI Responses API with schema-validated outputs
- OpenAI web search for current public funder research
- Cloudflare D1 for workspaces, reviews, facts, claims, sources, and audit events
- Cloudflare R2 for private source documents
- Sites identity headers for per-user ownership and private access

## Local setup

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run dev
```

Add a project API key to `OPENAI_API_KEY` in `.env.local`. Never commit that
file. The default models are `gpt-5.6` for analysis and `gpt-5.6-terra` for the
faster extraction stage.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm test
```

The generated D1 migration is in `drizzle/`. Production environment variables
are managed by Sites and are separate from `.env.local`.

## API surface

- `GET/POST /api/workspaces`
- `GET/PATCH/DELETE /api/workspaces/:id`
- `POST /api/workspaces/:id/documents`
- `DELETE /api/documents/:id`
- `POST /api/workspaces/:id/analyze`
- `GET /api/reviews/:id`
- `GET /api/reviews/:id/export?format=markdown|json`
- `POST /api/workspaces/:id/corrections`
- `GET /api/health`
