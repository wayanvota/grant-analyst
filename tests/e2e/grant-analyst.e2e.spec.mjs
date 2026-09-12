import { expect, test } from "@playwright/test";

const validSession = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const otherSession = "987654321HGFEDCBAzyxwvutsrqponmlkjihgfedcba";

async function createWorkspace(page, suffix = Date.now()) {
  await page.goto("/");
  await page.getByLabel("Organization *").fill(`Fixture Applicant ${suffix}`);
  await page.getByLabel("Funder *").fill("Fixture Foundation");
  await page.getByLabel("Opportunity *").fill("Evidence Pilot");
  await page.getByLabel("Requested amount").fill("USD 10,000");
  await page.getByLabel("Geography").fill("Timor-Leste");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: `Fixture Applicant ${suffix}` })).toBeVisible();
}

async function saveProposal(page) {
  await page.getByPlaceholder("Paste the complete proposal or upload the file.").fill(
    "The applicant will deliver a documented pilot with human review and a measurable outcome baseline.",
  );
  await page.getByRole("button", { name: "Save pasted text" }).first().click();
  await expect(page.getByText(/proposal-\d+\.txt/)).toBeVisible();
}

async function createApiWorkspace(request, session = validSession, overrides = {}) {
  return request.post("/api/workspaces", {
    headers: { "x-grant-session": session },
    data: {
      organization: "API Fixture Applicant",
      funder: "Fixture Foundation",
      opportunity: "Evidence Pilot",
      ...overrides,
    },
  });
}

test("U01 public interface loads with purpose, safeguards, and no exposed secret", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find the rejection case before the funder does." })).toBeVisible();
  await expect(page.getByText(/Do not submit confidential proposals/)).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain("OPENAI_API_KEY");
  expect(html).not.toContain("DATABASE_URL");
});

test("U02 required workspace fields block an incomplete submission", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByLabel("Organization *")).toBeFocused();
  expect(await page.getByLabel("Organization *").evaluate((input) => input.validity.valueMissing)).toBe(true);
});

test("U03 a user creates and reopens a private browser workspace", async ({ page }) => {
  await createWorkspace(page, "U03");
  await page.getByRole("button", { name: "New review" }).click();
  await page.getByRole("button", { name: /Fixture Applicant U03/ }).click();
  await expect(page.getByRole("heading", { name: "Fixture Applicant U03" })).toBeVisible();
});

test("U04 pasted proposal text becomes a labeled source document", async ({ page }) => {
  await createWorkspace(page, "U04");
  await saveProposal(page);
  await expect(page.locator(".source-list article p")).toContainText("Pasted Text");
  await expect(page.getByText("1 document")).toBeVisible();
});

test("U05 a supported proposal file uploads through the browser", async ({ page }) => {
  await createWorkspace(page, "U05");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "proposal.md", mimeType: "text/markdown", buffer: Buffer.from("# Synthetic proposal\nEvidence-backed pilot."),
  });
  await expect(page.getByText("proposal.md")).toBeVisible();
  await expect(page.getByText("User Supplied")).toBeVisible();
});

test("U06 a user can remove a document after confirmation", async ({ page }) => {
  await createWorkspace(page, "U06");
  await saveProposal(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Uploaded documents")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run full review" })).toBeDisabled();
});

test("U07 the full browser workflow produces a review decision", async ({ page }) => {
  await createWorkspace(page, "U07");
  await saveProposal(page);
  await page.getByRole("button", { name: "Run full review" }).click();
  await expect(page.getByText("Recommendation", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Revise", { exact: true })).toBeVisible();
  await expect(page.getByText("68/100")).toBeVisible();
});

test("U08 completed results expose scorecard, claims, stress test, and sources", async ({ page }) => {
  await createWorkspace(page, "U08");
  await saveProposal(page);
  await page.getByRole("button", { name: "Run full review" }).click();
  await expect(page.getByText("Recommendation", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Scorecard" }).click();
  await expect(page.getByText("Evidence completeness")).toBeVisible();
  await page.getByRole("button", { name: "Claims" }).click();
  await expect(page.getByText("CLM-1")).toBeVisible();
  await page.getByRole("button", { name: "Stress" }).click();
  await expect(page.getByRole("heading", { name: "Five damaging questions" })).toBeVisible();
  await page.getByRole("button", { name: "Sources" }).click();
  await expect(page.getByRole("link", { name: "Synthetic opportunity guidelines" })).toHaveAttribute("href", "https://example.org/guidelines");
});

test("U09 a confirmed fact persists after returning to the review", async ({ page }) => {
  await createWorkspace(page, "U09");
  await saveProposal(page);
  await page.getByRole("button", { name: "Run full review" }).click();
  await expect(page.getByText("Recommendation", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Facts" }).click();
  const factInput = page.getByLabel(/Requested Amount/);
  await factInput.fill("USD 12,500 verified");
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("button", { name: "Open" }).click();
  await page.getByRole("button", { name: "Facts" }).click();
  await expect(page.getByLabel(/Requested Amount/)).toHaveValue("USD 12,500 verified");
});

test("U10 deleting a workspace removes it from the browser session", async ({ page }) => {
  await createWorkspace(page, "U10");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete workspace" }).click();
  await expect(page.getByRole("heading", { name: "Find the rejection case before the funder does." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fixture Applicant U10/ })).toHaveCount(0);
});

test("A01 API requests without a browser session are rejected", async ({ request }) => {
  const response = await request.get("/api/workspaces");
  expect(response.status()).toBe(401);
  expect((await response.json()).error).toMatch(/private browser session/i);
});

test("A02 weak or malformed browser sessions are rejected", async ({ request }) => {
  const response = await request.get("/api/workspaces", { headers: { "x-grant-session": "short" } });
  expect(response.status()).toBe(401);
});

test("A03 one browser session cannot read another session's workspace", async ({ request }) => {
  const created = await createApiWorkspace(request);
  const workspace = (await created.json()).workspace;
  const isolated = await request.get(`/api/workspaces/${workspace.id}`, { headers: { "x-grant-session": otherSession } });
  expect(isolated.status()).toBe(404);
});

test("A04 a disallowed web origin is rejected before API access", async ({ request }) => {
  const response = await request.get("/api/workspaces", {
    headers: { origin: "https://attacker.example", "x-grant-session": validSession },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error).toMatch(/not allowed/i);
});

test("A05 the API rejects missing required workspace values", async ({ request }) => {
  const response = await createApiWorkspace(request, validSession, { organization: "" });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/Organization is required/i);
});

test("A06 oversized text fields are rejected instead of truncated", async ({ request }) => {
  const response = await createApiWorkspace(request, validSession, { organization: "x".repeat(501) });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/too long/i);
});

test("A07 malformed JSON returns a bounded error without a stack trace", async ({ request }) => {
  const response = await request.post("/api/workspaces", {
    headers: { "x-grant-session": validSession, "content-type": "application/json" },
    data: "{",
  });
  expect(response.status()).toBe(400);
  const body = await response.text();
  expect(body).not.toContain("node_modules");
  expect(body).not.toContain("at ");
});

test("A08 unsupported executable uploads are rejected", async ({ request }) => {
  const created = await createApiWorkspace(request);
  const workspace = (await created.json()).workspace;
  const response = await request.post(`/api/workspaces/${workspace.id}/documents`, {
    headers: { "x-grant-session": validSession },
    multipart: {
      category: "proposal",
      file: { name: "payload.exe", mimeType: "application/octet-stream", buffer: Buffer.from("not executable") },
    },
  });
  expect(response.status()).toBe(400);
});

test("A09 analysis cannot start without a proposal-labeled source", async ({ request }) => {
  const created = await createApiWorkspace(request);
  const workspace = (await created.json()).workspace;
  const response = await request.post(`/api/workspaces/${workspace.id}/analyze`, {
    headers: { "x-grant-session": validSession },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/proposal/i);
});

test("A10 unknown routes, unsupported methods, and encoded traversal fail closed", async ({ request }) => {
  const headers = { "x-grant-session": validSession };
  const [unknown, method, traversal] = await Promise.all([
    request.get("/api/not-a-route", { headers }),
    request.put("/api/workspaces", { headers, data: {} }),
    request.get("/api/%252e%252e/%252e%252e/config.js", { headers }),
  ]);
  expect(unknown.status()).toBe(404);
  expect(method.status()).toBe(404);
  expect(traversal.status()).toBe(404);
  expect(unknown.headers()["x-content-type-options"]).toBe("nosniff");
  const combined = `${await unknown.text()}${await method.text()}${await traversal.text()}`;
  expect(combined).not.toMatch(/OPENAI_API_KEY|DATABASE_URL|fixture:/);
});
