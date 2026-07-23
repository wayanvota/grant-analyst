import { runtimeEnv } from "./runtime";

export type RequestUser = {
  email: string;
  displayName: string;
};

export function requestUser(request: Request): RequestUser | null {
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");

  if (email) {
    let displayName = email;
    if (encodedName && encoding === "percent-encoded-utf-8") {
      try {
        displayName = decodeURIComponent(encodedName);
      } catch {
        displayName = email;
      }
    }
    return { email, displayName };
  }

  const host = request.headers.get("host") ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return { email: "local-developer@grant-analyst.test", displayName: "Local developer" };
  }
  return null;
}

export function requireUser(request: Request): RequestUser {
  const user = requestUser(request);
  if (!user) throw new HttpError(401, "Sign in with ChatGPT to continue.");
  return user;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, { status: error.status });
  console.error("Grant Analyst API error", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "The request could not be completed." }, { status: 500 });
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function now() {
  return new Date().toISOString();
}

export async function ownedWorkspace(workspaceId: string, ownerEmail: string) {
  const row = await runtimeEnv().DB.prepare(
    "SELECT * FROM workspaces WHERE id = ? AND owner_email = ?",
  ).bind(workspaceId, ownerEmail).first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "Workspace not found.");
  return row;
}

export async function audit(
  ownerEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  workspaceId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const env = runtimeEnv();
  await env.DB.prepare(
    `INSERT INTO audit_events
      (id, workspace_id, owner_email, action, entity_type, entity_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id("aud"), workspaceId, ownerEmail, action, entityType, entityId, JSON.stringify(metadata), now())
    .run();
}

export async function safetyIdentifier(email: string) {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
