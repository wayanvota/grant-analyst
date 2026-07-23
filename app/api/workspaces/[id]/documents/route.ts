import { deleteOpenAIFile, uploadFileToOpenAI } from "../../../../../lib/openai";
import { audit, errorResponse, HttpError, id as newId, json, now, ownedWorkspace, requireUser, safetyIdentifier } from "../../../../../lib/server";
import { runtimeEnv } from "../../../../../lib/runtime";

type Context = { params: Promise<{ id: string }> };
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "txt", "md", "json", "html", "xml", "doc", "docx", "rtf", "odt",
  "ppt", "pptx", "csv", "xls", "xlsx",
]);
const CATEGORIES = new Set(["proposal", "funder_material", "evidence", "budget", "attachment", "other"]);

export async function POST(request: Request, context: Context) {
  let r2Key: string | null = null;
  let openaiFileId: string | null = null;
  try {
    const user = requireUser(request);
    const { id: workspaceId } = await context.params;
    await ownedWorkspace(workspaceId, user.email);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a document to upload.");
    if (!file.size || file.size > MAX_BYTES) throw new HttpError(400, "Documents must be between 1 byte and 25 MB.");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new HttpError(400, "That document type is not supported.");
    const category = String(form.get("category") ?? "other");
    if (!CATEGORIES.has(category)) throw new HttpError(400, "Invalid document category.");
    const sourceType = String(form.get("sourceType") ?? "user_supplied") === "pasted_text"
      ? "pasted_text"
      : "user_supplied";
    const documentId = newId("doc");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-140);
    r2Key = `${await safetyIdentifier(user.email)}/${workspaceId}/${documentId}/${safeName}`;
    const env = runtimeEnv();
    await env.DOCUMENTS.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { originalFilename: file.name, category },
    });
    const uploaded = await uploadFileToOpenAI(file);
    openaiFileId = uploaded.id;
    const timestamp = now();
    await env.DB.prepare(
      `INSERT INTO documents
       (id, workspace_id, owner_email, category, source_type, filename, mime_type,
        size_bytes, r2_key, openai_file_id, processing_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
    ).bind(
      documentId, workspaceId, user.email, category, sourceType, file.name,
      file.type || "application/octet-stream", file.size, r2Key, openaiFileId, timestamp,
    ).run();
    await env.DB.prepare(
      "UPDATE workspaces SET status = 'needs_rerun', updated_at = ? WHERE id = ? AND owner_email = ?",
    ).bind(timestamp, workspaceId, user.email).run();
    await audit(user.email, "document.uploaded", "document", documentId, workspaceId, {
      filename: file.name, category, sizeBytes: file.size,
    });
    return json({
      document: {
        id: documentId, category, source_type: sourceType, filename: file.name,
        mime_type: file.type, size_bytes: file.size, processing_status: "ready",
        created_at: timestamp,
      },
    }, { status: 201 });
  } catch (error) {
    const env = runtimeEnv();
    if (r2Key) await env.DOCUMENTS.delete(r2Key);
    if (openaiFileId) await deleteOpenAIFile(openaiFileId);
    return errorResponse(error);
  }
}
