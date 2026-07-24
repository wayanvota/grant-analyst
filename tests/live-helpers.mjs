import crypto from "node:crypto";

export const frontendBase = new URL(
  process.env.LIVE_FRONTEND_URL || "https://wayan.com/grant-analyst/",
);
export const apiBase = new URL(
  process.env.LIVE_API_URL || "https://grant-analyst-api.onrender.com/",
);

export function newSession() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function apiRequest(path, {
  session,
  method = "GET",
  body,
  headers = {},
} = {}) {
  const requestHeaders = new Headers(headers);
  if (session) requestHeaders.set("x-grant-session", session);
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set("content-type", "application/json");
  }
  return fetch(new URL(path, apiBase), {
    method,
    headers: requestHeaders,
    body: body === undefined
      ? undefined
      : body instanceof FormData
        ? body
        : JSON.stringify(body),
  });
}

export async function responseJson(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Expected JSON from ${response.url}, received: ${text.slice(0, 300)}`);
  }
  return { response, data };
}

export async function createWorkspace(session, overrides = {}) {
  const { response, data } = await responseJson(await apiRequest("/api/workspaces", {
    session,
    method: "POST",
    body: {
      organization: "Grant Analyst automated test",
      funder: "Synthetic Test Fund",
      opportunity: "Production verification",
      deadline: "2030-12-31",
      requestedAmount: "USD 10,000",
      geography: "Timor-Leste",
      programArea: "Energy access",
      organizationType: "Nonprofit",
      proposalVersion: "test",
      ...overrides,
    },
  }));
  if (response.status !== 201) {
    throw new Error(`Workspace creation failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data.workspace;
}

export async function deleteWorkspace(session, workspaceId) {
  const response = await apiRequest(`/api/workspaces/${workspaceId}`, {
    session,
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Workspace cleanup failed (${response.status}): ${await response.text()}`);
  }
}

export async function uploadTextDocument(session, workspaceId, {
  category,
  filename,
  text,
}) {
  const form = new FormData();
  form.set("category", category);
  form.set("sourceType", "pasted_text");
  form.set("file", new Blob([text], { type: "text/plain" }), filename);
  const { response, data } = await responseJson(await apiRequest(
    `/api/workspaces/${workspaceId}/documents`,
    { session, method: "POST", body: form },
  ));
  if (response.status !== 201) {
    throw new Error(`Document upload failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data.document;
}
