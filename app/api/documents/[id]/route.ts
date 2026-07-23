import { deleteOpenAIFile } from "../../../../lib/openai";
import { audit, errorResponse, HttpError, json, now, requireUser } from "../../../../lib/server";
import { runtimeEnv } from "../../../../lib/runtime";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const env = runtimeEnv();
    const document = await env.DB.prepare(
      "SELECT * FROM documents WHERE id = ? AND owner_email = ?",
    ).bind(id, user.email).first<Record<string, string>>();
    if (!document) throw new HttpError(404, "Document not found.");
    await env.DOCUMENTS.delete(document.r2_key);
    if (document.openai_file_id) await deleteOpenAIFile(document.openai_file_id);
    await env.DB.prepare("DELETE FROM documents WHERE id = ? AND owner_email = ?").bind(id, user.email).run();
    await env.DB.prepare(
      "UPDATE workspaces SET status = 'needs_rerun', updated_at = ? WHERE id = ? AND owner_email = ?",
    ).bind(now(), document.workspace_id, user.email).run();
    await audit(user.email, "document.deleted", "document", id, document.workspace_id, {
      filename: document.filename,
    });
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
