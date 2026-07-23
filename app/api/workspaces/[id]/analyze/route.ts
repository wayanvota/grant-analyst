import { waitUntil } from "cloudflare:workers";
import { runAnalysisPipeline, type AnalysisDocument, type AnalysisWorkspace } from "../../../../../lib/openai";
import { persistFullAnalysis } from "../../../../../lib/reviews";
import { audit, errorResponse, HttpError, id as newId, json, now, ownedWorkspace, requireUser } from "../../../../../lib/server";
import { runtimeEnv } from "../../../../../lib/runtime";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = requireUser(request);
  const { id: workspaceId } = await context.params;
  const env = runtimeEnv();
  let reviewId: string | null = null;
  try {
    const row = await ownedWorkspace(workspaceId, user.email) as Record<string, string | null>;
    type DocumentRecord = {
      id: string;
      filename: string;
      category: string;
      source_type: string;
      openai_file_id: string | null;
    };
    const docs = await env.DB.prepare(
      `SELECT id, filename, category, source_type, openai_file_id
       FROM documents WHERE workspace_id = ? AND owner_email = ? ORDER BY created_at`,
    ).bind(workspaceId, user.email).all<DocumentRecord>();
    if (!docs.results.length) throw new HttpError(400, "Add at least one proposal or supporting document first.");
    if (!docs.results.some((document) => document.category === "proposal")) {
      throw new HttpError(400, "Label at least one document as the proposal.");
    }
    if (docs.results.some((document) => !document.openai_file_id)) {
      throw new HttpError(409, "One or more documents are still processing.");
    }
    const versionRow = await env.DB.prepare(
      "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM reviews WHERE workspace_id = ?",
    ).bind(workspaceId).first<{ next_version: number }>();
    const version = versionRow?.next_version ?? 1;
    reviewId = newId("rev");
    const timestamp = now();
    const model = env.OPENAI_ANALYSIS_MODEL || "gpt-5.6";
    await env.DB.prepare(
      `INSERT INTO reviews
       (id, workspace_id, owner_email, version, status, stage, review_type, model,
        configuration_json, source_snapshot_json, created_at)
       VALUES (?, ?, ?, ?, 'running', 'queued', 'full', ?, ?, ?, ?)`,
    ).bind(
      reviewId, workspaceId, user.email, version, model,
      JSON.stringify({ analysisModel: model, fastModel: env.OPENAI_FAST_MODEL || "gpt-5.6-terra" }),
      JSON.stringify(docs.results.map((document) => ({
        id: document.id, filename: document.filename, category: document.category,
        sourceType: document.source_type,
      }))),
      timestamp,
    ).run();
    await env.DB.prepare(
      "UPDATE workspaces SET status = 'reviewing', updated_at = ? WHERE id = ? AND owner_email = ?",
    ).bind(timestamp, workspaceId, user.email).run();

    const workspace: AnalysisWorkspace = {
      id: workspaceId,
      organization: String(row.organization),
      funder: String(row.funder),
      opportunity: String(row.opportunity),
      deadline: row.deadline,
      requestedAmount: row.requested_amount,
      geography: row.geography,
      programArea: row.program_area,
      organizationType: row.organization_type,
      proposalVersion: String(row.proposal_version),
    };
    const documents = docs.results.map((document) => ({
      id: String(document.id),
      filename: String(document.filename),
      category: String(document.category),
      sourceType: String(document.source_type),
      openaiFileId: String(document.openai_file_id),
    })) satisfies AnalysisDocument[];
    waitUntil(processReview({
      reviewId, workspaceId, ownerEmail: user.email, version, workspace, documents,
    }));
    return json({ review: { id: reviewId, version, status: "running", stage: "queued" } }, { status: 202 });
  } catch (error) {
    if (reviewId) {
      await env.DB.prepare(
        "UPDATE reviews SET status = 'failed', stage = 'failed', error_message = ?, completed_at = ? WHERE id = ?",
      ).bind(error instanceof Error ? error.message.slice(0, 500) : "Unknown analysis error", now(), reviewId).run();
      await env.DB.prepare(
        "UPDATE workspaces SET status = 'review_failed', updated_at = ? WHERE id = ? AND owner_email = ?",
      ).bind(now(), workspaceId, user.email).run();
    }
    return errorResponse(error);
  }
}

async function processReview({
  reviewId,
  workspaceId,
  ownerEmail,
  version,
  workspace,
  documents,
}: {
  reviewId: string;
  workspaceId: string;
  ownerEmail: string;
  version: number;
  workspace: AnalysisWorkspace;
  documents: AnalysisDocument[];
}) {
  const env = runtimeEnv();
  try {
    const analysis = await runAnalysisPipeline({
      workspace,
      documents,
      ownerEmail,
      onStage: async (stage) => {
        await env.DB.prepare("UPDATE reviews SET stage = ? WHERE id = ?").bind(stage, reviewId).run();
      },
    });
    await persistFullAnalysis(reviewId, workspaceId, analysis);
    const final = analysis.adjudication;
    const completed = now();
    await env.DB.prepare(
      `UPDATE reviews SET status = 'completed', stage = 'completed', eligibility_result = ?,
       final_verdict = ?, recommendation = ?, confidence = ?, score = ?, result_json = ?,
       completed_at = ? WHERE id = ?`,
    ).bind(
      final.eligibility, final.proposal_merit, final.recommendation, final.confidence,
      final.diagnostic_score, JSON.stringify(analysis), completed, reviewId,
    ).run();
    await env.DB.prepare(
      "UPDATE workspaces SET status = 'reviewed', updated_at = ? WHERE id = ? AND owner_email = ?",
    ).bind(completed, workspaceId, ownerEmail).run();
    await audit(ownerEmail, "review.completed", "review", reviewId, workspaceId, {
      version, recommendation: final.recommendation, score: final.diagnostic_score,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown analysis error";
    await env.DB.prepare(
      "UPDATE reviews SET status = 'failed', stage = 'failed', error_message = ?, completed_at = ? WHERE id = ?",
    ).bind(message, now(), reviewId).run();
    await env.DB.prepare(
      "UPDATE workspaces SET status = 'review_failed', updated_at = ? WHERE id = ? AND owner_email = ?",
    ).bind(now(), workspaceId, ownerEmail).run();
    await audit(ownerEmail, "review.failed", "review", reviewId, workspaceId, { error: message });
  }
}
