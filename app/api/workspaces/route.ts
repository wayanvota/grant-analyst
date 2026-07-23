import { audit, errorResponse, id, json, now, requireUser } from "../../../lib/server";
import { runtimeEnv } from "../../../lib/runtime";
import { optionalString, requiredString } from "../../../lib/workspaces";

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    const rows = await runtimeEnv().DB.prepare(
      `SELECT w.*,
        (SELECT COUNT(*) FROM documents d WHERE d.workspace_id = w.id) AS document_count,
        (SELECT COUNT(*) FROM reviews r WHERE r.workspace_id = w.id) AS review_count
       FROM workspaces w WHERE owner_email = ? ORDER BY updated_at DESC`,
    ).bind(user.email).all();
    return json({ workspaces: rows.results });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const workspaceId = id("wrk");
    const timestamp = now();
    const values = {
      organization: requiredString(body.organization, "Organization"),
      funder: requiredString(body.funder, "Funder"),
      opportunity: requiredString(body.opportunity, "Opportunity"),
      deadline: optionalString(body.deadline),
      requestedAmount: optionalString(body.requestedAmount),
      geography: optionalString(body.geography),
      programArea: optionalString(body.programArea),
      organizationType: optionalString(body.organizationType),
      proposalVersion: optionalString(body.proposalVersion) ?? "1",
    };
    await runtimeEnv().DB.prepare(
      `INSERT INTO workspaces
       (id, owner_email, organization, funder, opportunity, deadline, requested_amount,
        geography, program_area, organization_type, proposal_version, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    ).bind(
      workspaceId, user.email, values.organization, values.funder, values.opportunity,
      values.deadline, values.requestedAmount, values.geography, values.programArea,
      values.organizationType, values.proposalVersion, timestamp, timestamp,
    ).run();
    await audit(user.email, "workspace.created", "workspace", workspaceId, workspaceId);
    return json({ workspace: { id: workspaceId, owner_email: user.email, ...values } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
