# Deployment

Grant Analyst has three distinct deployment targets. Verify each one
separately. A healthy Render API does not prove that the FTP copy at
`wayan.com/grant-analyst/` is current.

## 1. Create the Neon database

1. Create a Neon project and database.
2. In Neon, select **Connect** and copy a pooled connection string.
3. Keep `sslmode=require` and `channel_binding=require` in the URL when Neon
   supplies them.
4. Save the value for Render as `DATABASE_URL`.

The API applies versioned SQL migrations at startup. You can also run them
manually:

```bash
DATABASE_URL="postgresql://..." npm run migrate
```

Neon documents its JavaScript driver and connection strings at
[Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)
and [connection pooling](https://neon.com/docs/connect/connection-pooling).

## 2. Deploy the Render API

The repository includes `render.yaml`.

1. Push the repository to GitHub.
2. In Render, choose **New > Blueprint**.
3. Connect the GitHub repository and use the root `render.yaml`.
4. Supply the two protected values that the Blueprint intentionally leaves
   unsynchronized:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
5. Deploy the service.
6. Confirm:
   - `https://YOUR-SERVICE.onrender.com/health`
   - `https://YOUR-SERVICE.onrender.com/api/meta`

Render creates `SESSION_PEPPER` automatically. Do not move it to the frontend.
The service binds to `0.0.0.0` and uses Render's `PORT`.

Render's official references are
[Blueprint YAML](https://render.com/docs/blueprint-spec) and
[Web Services](https://render.com/docs/web-services).

## 3. Point the static frontend at Render

Edit `public/config.js`:

```js
window.GRANT_ANALYST_CONFIG = {
  apiBase: "https://YOUR-SERVICE.onrender.com"
};
```

Also set Render's `CORS_ORIGINS` to the exact public origins:

```text
https://wayan.com,https://www.wayan.com
```

Do not include a path such as `/grant-analyst` in a CORS origin.

## 4. Build the FTP files

```bash
npm install
npm run build:ftp
```

Upload the contents of `frontend/dist/` into:

```text
wayan.com/grant-analyst/
```

Required files include:

- `index.html`
- `config.js`
- `.htaccess`
- `assets/`
- `og.png`
- `favicon.svg`

Upload hidden files so `.htaccess` is not skipped.

## 5. Verify the public site

Check all of these:

1. `https://YOUR-SERVICE.onrender.com/health` returns database status.
2. `https://YOUR-SERVICE.onrender.com/api/meta` returns public limits.
3. `https://wayan.com/grant-analyst/` loads without a CORS error.
4. Create a disposable workspace.
5. Paste a short proposal and label it **Proposal**.
6. Run one paid end-to-end review.
7. Open version history and export Markdown.
8. Delete the test workspace when finished.

The public site and Render should be treated as separate release targets.

## Cost controls

Defaults are intentionally conservative:

- 20 reviews globally per UTC day
- 2 reviews per browser session per UTC day
- 12 documents per workspace
- 15 MB per uploaded document
- 14 days for cached funder research
- 45 seconds for proposal assessment
- 45 seconds for uncached funder research
- 40 seconds for the final decision layer

Adjust `MAX_DAILY_REVIEWS`, `MAX_SESSION_DAILY_REVIEWS`, `MAX_UPLOAD_MB`,
`FUNDER_CACHE_DAYS`, `PROPOSAL_TIMEOUT_MS`, `FUNDER_TIMEOUT_MS`, and
`DECISION_TIMEOUT_MS` in Render. Keep global limits low until you have observed
real token use.

The two sequential layer budgets total 85 seconds because proposal assessment
and funder research share the first 45-second window. Database and network
overhead can add a few seconds, so the production test treats 90 seconds as the
maximum acceptable analysis runtime recorded by the backend.
