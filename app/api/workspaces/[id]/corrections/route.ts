import { audit, errorResponse, HttpError, id as newId, json, now, ownedWorkspace, requireUser } from "../../../../../lib/server";
import { runtimeEnv } from "../../../../../lib/runtime";
import { WORKSPACE_FIELDS } from "../../../../../lib/workspaces";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = requireUser(request);
    const { id: workspaceId } = await context.params;
    await ownedWorkspace(workspaceId, user.email);
    const body = await request.json() as Record<string, unknown>;
    const targetType = String(body.targetType ?? "");
    const targetId = String(body.targetId ?? "");
    const field = String(body.field ?? "");
    const correctedValue = String(body.correctedValue ?? "").trim();
    const reason = typeof body.reason === "string" ? body.reason.trim() : null;
    if (!targetId || !field || !correctedValue) throw new HttpError(400, "Target, field, and corrected value are required.");
    const env = runtimeEnv();
    let previousValue: string | null = null;
    const timestamp = now();

    if (targetType === "fact" && field === "confirmed_value") {
      const fact = await env.DB.prepare(
        "SELECT extracted_value, confirmed_value FROM facts WHERE id = ? AND workspace_id = ?",
      ).bind(targetId, workspaceId).first<{ extracted_value: string | null; confirmed_value: string | null }>();
      if (!fact) throw new HttpError(404, "Fact not found.");
      previousValue = fact.confirmed_value ?? fact.extracted_value;
      await env.DB.prepare(
        `UPDATE facts SET confirmed_value = ?, confirmed_by = ?, confirmed_at = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
      ).bind(correctedValue, user.email, timestamp, timestamp, targetId, workspaceId).run();
    } else if (targetType === "workspace" && WORKSPACE_FIELDS.includes(field as never)) {
      const workspace = await ownedWorkspace(workspaceId, user.email);
      previousValue = workspace[field] == null ? null : String(workspace[field]);
      await env.DB.prepare(
        `UPDATE workspaces SET ${field} = ?, status = 'needs_rerun', updated_at = ?
         WHERE id = ? AND owner_email = ?`,
      ).bind(correctedValue, timestamp, workspaceId, user.email).run();
    } else {
      throw new HttpError(400, "That correction target is not supported.");
    }
    const correctionId = newId("cor");
    await env.DB.prepare(
      `INSERT INTO corrections
       (id, workspace_id, review_id, owner_email, target_type, target_id, field,
        previous_value, corrected_value, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      correctionId, workspaceId, body.reviewId ? String(body.reviewId) : null, user.email,
      targetType, targetId, field, previousValue, correctedValue, reason, timestamp,
    ).run();
    await audit(user.email, "correction.recorded", "correction", correctionId, workspaceId, {
      targetType, targetId, field,
    });
    return json({ correction: { id: correctionId, previousValue, correctedValue, createdAt: timestamp } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
