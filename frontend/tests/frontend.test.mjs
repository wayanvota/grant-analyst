import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

test("static frontend keeps secrets behind the Render API", async () => {
  const [api, app, config] = await Promise.all([
    readFile(new URL("../src/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../public/config.js", import.meta.url), "utf8"),
  ]);
  assert.match(api, /x-grant-session/);
  assert.match(api, /GRANT_ANALYST_CONFIG/);
  assert.match(app, /Five damaging questions/);
  assert.match(app, /Grant review progress/);
  assert.match(app, /Layer \$\{visibleIndex \+ 1\} of \$\{reviewStages\.length\}/);
  assert.match(app, /full review may take up to 90 seconds/);
  assert.match(app, /I’m Wayan Vota, and I created Grant Analyst/);
  assert.match(app, /https:\/\/wayan\.com\/portfolio\//);
  assert.match(app, /supports human\s+judgment rather than replacing it/);
  assert.match(config, /onrender\.com/);
  assert.doesNotMatch(`${api}${app}${config}`, /OPENAI_API_KEY|DATABASE_URL/);
});

test("FTP build contains relative assets and runtime API config", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /src="\.\/config\.js"/);
  assert.match(html, /src="\.\/assets\//);
  await access(new URL("../dist/config.js", import.meta.url));
  await access(new URL("../dist/.htaccess", import.meta.url));
});
