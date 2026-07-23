import { audit, errorResponse, HttpError, json, now, ownedWorkspace, requireUser } from "../../../../lib/server";
import { runtimeEnv } from "../../../../lib/runtime";
import { optionalString, requiredString, workspaceBundle } from "../../../../lib/workspaces";
import { deleteOpenAIFile } from "../../../../lib/openai";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    return json(await workspaceBundle(id, user.email));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    await ownedWorkspace(id, user.email);
    const body = await request.json() as Record<string, unknown>;
    const current = await ownedWorkspace(id, user.email);
    const organization = body.organization === undefined ? current.organization : requiredString(body.organization, "Organization");
    const funder = body.funder === undefined ? current.funder : requiredString(body.funder, "Funder");
    const opportunity = body.opportunity === undefined ? current.opportunity : requiredString(body.opportunity, "Opportunity");
    const pick = (camel: string, snake: string) =>
      body[camel] === undefined ? (current[snake] ?? null) : optionalString(body[camel]);
    await runtimeEnv().DB.prepare(
      `UPDATE workspaces SET organization = ?, funder = ?, opportunity = ?, deadline = ?,
       requested_amount = ?, geography = ?, program_area = ?, organization_type = ?,
       proposal_version = ?, status = 'needs_rerun', updated_at = ? WHERE id = ? AND owner_email = ?`,
    ).bind(
      organization, funder, opportunity, pick("deadline", "deadline"),
      pick("requestedAmount", "requested_amount"), pick("geography", "geography"),
      pick("programArea", "program_area"), pick("organizationType", "organization_type"),
      pick("proposalVersion", "proposal_version") ?? "1", now(), id, user.email,
    ).run();
    await audit(user.email, "workspace.updated", "workspace", id, id);
    return json(await workspaceBundle(id, user.email));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    await ownedWorkspace(id, user.email);
    const env = runtimeEnv();
    const docs = await env.DB.prepare(
      "SELECT r2_key, openai_file_id FROM documents WHERE workspace_id = ? AND owner_email = ?",
    ).bind(id, user.email).all<{ r2_key: string; openai_file_id: string | null }>();
    for (const doc of docs.results) {
      await env.DOCUMENTS.delete(doc.r2_key);
      if (doc.openai_file_id) await deleteOpenAIFile(doc.openai_file_id);
    }
    const tables = ["audit_events", "corrections", "sources", "claims", "findings", "facts", "reviews", "documents"];
    for (const table of tables) {
      if (!/^[a-z_]+$/.test(table)) throw new HttpError(500, "Invalid cleanup target.");
      await env.DB.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).bind(id).run();
    }
    await env.DB.prepare("DELETE FROM workspaces WHERE id = ? AND owner_email = ?").bind(id, user.email).run();
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
