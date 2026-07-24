import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { classifyAnalysisError, analysisErrorCodes } from "./analysis-errors.mjs";
import { createAnalysisManifest, MANIFEST_VERSION, snapshotId } from "./analysis-manifest.mjs";
import { config, assertRuntimeConfig } from "./config.mjs";
import { healthcheck, query } from "./db.mjs";
import {
  assignCorrelationId, asyncRoute, cleanText, errorMiddleware, HttpError, newId, requestOwner,
} from "./http.mjs";
import { deleteDocumentFile, uploadDocument } from "./openai-client.mjs";
import { audit, ownedWorkspace, persistAnalysis } from "./persistence.mjs";
import { markdownReport } from "./report.mjs";
import { runAnalysisPipeline } from "./review-pipeline.mjs";
import { persistedReviewState } from "./review-state.mjs";

const allowedExtensions = new Set([
  "pdf", "txt", "md", "json", "html", "xml", "doc", "docx", "rtf", "odt",
  "ppt", "pptx", "csv", "xls", "xlsx",
]);
const documentCategories = new Set(["proposal", "funder_material", "evidence", "budget", "attachment", "other"]);
const workspaceColumns = new Map([
  ["organization", "organization"], ["funder", "funder"], ["opportunity", "opportunity"],
  ["deadline", "deadline"], ["requestedAmount", "requested_amount"], ["geography", "geography"],
  ["programArea", "program_area"], ["organizationType", "organization_type"],
  ["proposalVersion", "proposal_version"],
]);
const activeReviews = new Set();

function requireWorkspace(workspaceId, ownerHash) {
  return ownedWorkspace(workspaceId, ownerHash).then((workspace) => {
    if (!workspace) throw new HttpError(404, "Workspace not found.");
    return workspace;
  });
}

async function workspaceBundle(workspaceId, ownerHash) {
  const workspace = await requireWorkspace(workspaceId, ownerHash);
  const [documents, reviews, facts, corrections] = await Promise.all([
    query(`SELECT id, category, source_type, filename, mime_type, size_bytes, processing_status, created_at
           FROM documents WHERE workspace_id = $1 AND owner_hash = $2 ORDER BY created_at DESC`, [workspaceId, ownerHash]),
    query(`SELECT id, version, status, stage, completion_state, review_type, eligibility_result, final_verdict,
                  recommendation, confidence, score, error_code, error_message, correlation_id, created_at, completed_at
           FROM reviews WHERE workspace_id = $1 AND owner_hash = $2 ORDER BY version DESC`, [workspaceId, ownerHash]),
    query(`SELECT id, fact_key, extracted_value, confirmed_value, source_ref, confidence, confirmed_at, updated_at
           FROM facts WHERE workspace_id = $1 ORDER BY fact_key`, [workspaceId]),
    query(`SELECT id, review_id, target_type, target_id, field, previous_value,
                  corrected_value, reason, created_at
           FROM corrections WHERE workspace_id = $1 AND owner_hash = $2 ORDER BY created_at DESC`, [workspaceId, ownerHash]),
  ]);
  return { workspace, documents, reviews, facts, corrections };
}

async function enforceReviewQuota(ownerHash) {
  const [globalRows, ownerRows] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM reviews WHERE created_at >= CURRENT_DATE"),
    query("SELECT COUNT(*)::int AS count FROM reviews WHERE owner_hash = $1 AND created_at >= CURRENT_DATE", [ownerHash]),
  ]);
  if ((globalRows[0]?.count || 0) >= config.maxDailyReviews) {
    throw new HttpError(429, "The public demo has reached its review limit for today.");
  }
  if ((ownerRows[0]?.count || 0) >= config.maxSessionDailyReviews) {
    throw new HttpError(429, "This browser session has reached its review limit for today.");
  }
}

async function processReview({
  reviewId,
  workspace,
  documents,
  ownerHash,
  version,
  correlationId,
  analysisStartedAt,
}) {
  if (activeReviews.has(reviewId)) return;
  activeReviews.add(reviewId);
  try {
    const analysis = await runAnalysisPipeline({
      workspace,
      documents,
      ownerHash,
      reviewId,
      correlationId,
      onStage: async (stage) => {
        await query("UPDATE reviews SET stage = $1 WHERE id = $2", [stage, reviewId]);
      },
    });
    await persistAnalysis(reviewId, workspace.id, analysis);
    const final = analysis.adjudication;
    const persistedState = persistedReviewState(analysis);
    await query(
      `UPDATE reviews SET status=$1, stage=$2, completion_state=$3, eligibility_result=$4,
       final_verdict=$5, recommendation=$6, confidence=$7, score=$8, result=$9::jsonb,
       analysis_manifest=$10::jsonb, error_code=$11, completed_at=NOW() WHERE id=$12`,
      [persistedState.status, persistedState.stage, persistedState.completionState,
        final.eligibility, final.proposal_merit, final.recommendation, final.confidence,
        final.diagnostic_score, JSON.stringify(analysis), JSON.stringify(analysis.manifest),
        analysis.pipeline.errors[0]?.code || null, reviewId],
    );
    await query("UPDATE workspaces SET status=$1, updated_at=NOW() WHERE id=$2", [
      persistedState.workspaceStatus, workspace.id,
    ]);
    await audit(ownerHash, "review.completed", "review", reviewId, workspace.id, {
      version,
      completionState: persistedState.completionState,
      recommendation: final.recommendation,
      score: final.diagnostic_score,
      correlationId,
    });
  } catch (error) {
    console.error(`Review ${reviewId} failed`, error);
    const classified = classifyAnalysisError(error, "orchestrator");
    const completedAt = new Date().toISOString();
    const failureManifest = createAnalysisManifest({
      reviewId,
      workspace,
      documents,
      correlationId,
      startedAt: analysisStartedAt,
      completedAt,
      completionState: "failed",
      moduleRuns: [{
        module_id: "orchestrator",
        status: "failed",
        started_at: analysisStartedAt,
        completed_at: completedAt,
        duration_ms: Math.max(0, Date.parse(completedAt) - Date.parse(analysisStartedAt)),
        error_code: classified.code,
      }],
      providerRequests: [],
      errors: [classified.toRecord()],
    });
    await query(
      `UPDATE reviews SET status='failed', stage='failed', completion_state='failed',
       error_code=$1, error_message=$2, analysis_manifest=$3::jsonb,
       completed_at=NOW() WHERE id=$4`,
      [classified.code, classified.message, JSON.stringify(failureManifest), reviewId],
    );
    await query("UPDATE workspaces SET status='review_failed', updated_at=NOW() WHERE id=$1", [workspace.id]);
    await audit(ownerHash, "review.failed", "review", reviewId, workspace.id, {
      errorCode: classified.code,
      correlationId,
    });
  } finally {
    activeReviews.delete(reviewId);
  }
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(assignCorrelationId);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new HttpError(403, "This website is not allowed to use the API."));
    },
    allowedHeaders: ["Content-Type", "X-Grant-Session"],
    exposedHeaders: ["X-Correlation-ID"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }));
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 240,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", asyncRoute(async (_request, response) => {
    response.json({ ok: await healthcheck(), service: "grant-analyst-api" });
  }));

  app.get("/api/meta", (_request, response) => response.json(publicMeta()));

  app.use("/api", (request, _response, next) => {
    try {
      request.ownerHash = requestOwner(request);
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces", asyncRoute(async (request, response) => {
    const rows = await query(
      `SELECT w.*,
       (SELECT COUNT(*)::int FROM documents d WHERE d.workspace_id=w.id) AS document_count,
       (SELECT COUNT(*)::int FROM reviews r WHERE r.workspace_id=w.id) AS review_count
       FROM workspaces w WHERE owner_hash=$1 ORDER BY updated_at DESC`,
      [request.ownerHash],
    );
    response.json({ workspaces: rows });
  }));

  app.post("/api/workspaces", asyncRoute(async (request, response) => {
    const id = newId("wrk");
    const values = {
      organization: cleanText(request.body.organization, "Organization", { required: true }),
      funder: cleanText(request.body.funder, "Funder", { required: true }),
      opportunity: cleanText(request.body.opportunity, "Opportunity", { required: true }),
      deadline: cleanText(request.body.deadline, "Deadline", { max: 100 }),
      requestedAmount: cleanText(request.body.requestedAmount, "Requested amount", { max: 100 }),
      geography: cleanText(request.body.geography, "Geography"),
      programArea: cleanText(request.body.programArea, "Program area"),
      organizationType: cleanText(request.body.organizationType, "Organization type"),
      proposalVersion: cleanText(request.body.proposalVersion, "Proposal version", { max: 100 }) || "1",
    };
    const rows = await query(
      `INSERT INTO workspaces
       (id,owner_hash,organization,funder,opportunity,deadline,requested_amount,geography,
        program_area,organization_type,proposal_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, request.ownerHash, values.organization, values.funder, values.opportunity, values.deadline,
        values.requestedAmount, values.geography, values.programArea, values.organizationType, values.proposalVersion],
    );
    await audit(request.ownerHash, "workspace.created", "workspace", id, id, {
      correlationId: request.correlationId,
    });
    response.status(201).json({ workspace: rows[0] });
  }));

  app.get("/api/workspaces/:id", asyncRoute(async (request, response) => {
    response.json(await workspaceBundle(request.params.id, request.ownerHash));
  }));

  app.patch("/api/workspaces/:id", asyncRoute(async (request, response) => {
    await requireWorkspace(request.params.id, request.ownerHash);
    const entries = Object.entries(request.body)
      .filter(([key]) => workspaceColumns.has(key))
      .map(([key, value]) => [workspaceColumns.get(key), cleanText(value, key, {
        required: ["organization", "funder", "opportunity"].includes(key),
      })]);
    if (!entries.length) throw new HttpError(400, "No supported workspace fields were supplied.");
    const assignments = entries.map(([column], index) => `${column}=$${index + 1}`).join(",");
    await query(
      `UPDATE workspaces SET ${assignments}, status='needs_rerun', updated_at=NOW()
       WHERE id=$${entries.length + 1} AND owner_hash=$${entries.length + 2}`,
      [...entries.map(([, value]) => value), request.params.id, request.ownerHash],
    );
    await audit(request.ownerHash, "workspace.updated", "workspace", request.params.id, request.params.id, {
      correlationId: request.correlationId,
    });
    response.json(await workspaceBundle(request.params.id, request.ownerHash));
  }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1 },
    fileFilter(_request, file, callback) {
      const extension = file.originalname.split(".").pop()?.toLowerCase();
      callback(null, Boolean(extension && allowedExtensions.has(extension)));
    },
  });

  app.post("/api/workspaces/:id/documents", upload.single("file"), asyncRoute(async (request, response) => {
    const workspace = await requireWorkspace(request.params.id, request.ownerHash);
    if (!request.file) throw new HttpError(400, "Choose a supported document to upload.");
    const countRows = await query("SELECT COUNT(*)::int AS count FROM documents WHERE workspace_id=$1", [workspace.id]);
    if ((countRows[0]?.count || 0) >= 12) throw new HttpError(400, "A workspace can contain at most 12 documents.");
    const category = String(request.body.category || "other");
    if (!documentCategories.has(category)) throw new HttpError(400, "Invalid document category.");
    const sourceType = request.body.sourceType === "pasted_text" ? "pasted_text" : "user_supplied";
    const uploaded = await uploadDocument({
      buffer: request.file.buffer,
      filename: request.file.originalname,
      mimeType: request.file.mimetype,
    });
    const documentId = newId("doc");
    try {
      const rows = await query(
        `INSERT INTO documents
         (id,workspace_id,owner_hash,category,source_type,filename,mime_type,size_bytes,
          content_sha256,openai_file_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id,category,source_type,filename,mime_type,size_bytes,processing_status,created_at`,
        [documentId, workspace.id, request.ownerHash, category, sourceType, request.file.originalname,
          request.file.mimetype || "application/octet-stream", request.file.size,
          crypto.createHash("sha256").update(request.file.buffer).digest("hex"), uploaded.id],
      );
      await query("UPDATE workspaces SET status='needs_rerun', updated_at=NOW() WHERE id=$1", [workspace.id]);
      await audit(request.ownerHash, "document.uploaded", "document", documentId, workspace.id, {
        filename: request.file.originalname,
        category,
        sizeBytes: request.file.size,
        correlationId: request.correlationId,
      });
      response.status(201).json({ document: rows[0] });
    } catch (error) {
      await deleteDocumentFile(uploaded.id);
      throw error;
    }
  }));

  app.delete("/api/documents/:id", asyncRoute(async (request, response) => {
    const rows = await query(
      "SELECT * FROM documents WHERE id=$1 AND owner_hash=$2", [request.params.id, request.ownerHash],
    );
    const document = rows[0];
    if (!document) throw new HttpError(404, "Document not found.");
    await deleteDocumentFile(document.openai_file_id);
    await query("DELETE FROM documents WHERE id=$1 AND owner_hash=$2", [document.id, request.ownerHash]);
    await query("UPDATE workspaces SET status='needs_rerun', updated_at=NOW() WHERE id=$1", [document.workspace_id]);
    await audit(request.ownerHash, "document.deleted", "document", document.id, document.workspace_id, {
      correlationId: request.correlationId,
    });
    response.json({ deleted: true });
  }));

  app.post("/api/workspaces/:id/analyze", asyncRoute(async (request, response) => {
    const workspace = await requireWorkspace(request.params.id, request.ownerHash);
    await enforceReviewQuota(request.ownerHash);
    const running = await query(
      "SELECT id FROM reviews WHERE workspace_id=$1 AND status='running' LIMIT 1", [workspace.id],
    );
    if (running.length) throw new HttpError(409, "A review is already running for this workspace.");
    const documents = await query(
      `SELECT id,filename,category,source_type,content_sha256,openai_file_id FROM documents
       WHERE workspace_id=$1 AND owner_hash=$2 ORDER BY created_at`,
      [workspace.id, request.ownerHash],
    );
    if (!documents.some((document) => document.category === "proposal")) {
      throw new HttpError(400, "Add at least one document labeled as the proposal.");
    }
    const versionRows = await query(
      "SELECT COALESCE(MAX(version),0)::int+1 AS version FROM reviews WHERE workspace_id=$1", [workspace.id],
    );
    const version = versionRows[0]?.version || 1;
    const reviewId = newId("rev");
    const analysisStartedAt = new Date().toISOString();
    await query(
      `INSERT INTO reviews
       (id,workspace_id,owner_hash,version,status,stage,completion_state,model,configuration,
        source_snapshot,correlation_id,analysis_started_at)
       VALUES ($1,$2,$3,$4,'running','queued','awaiting_analysis',$5,$6::jsonb,$7::jsonb,$8,$9)`,
      [reviewId, workspace.id, request.ownerHash, version, config.fastModel,
        JSON.stringify({
          pipeline: "two_layer_fast_v1",
          analysisModel: config.analysisModel,
          fastModel: config.fastModel,
          proposalTimeoutMs: config.proposalTimeoutMs,
          funderTimeoutMs: config.funderTimeoutMs,
          decisionTimeoutMs: config.decisionTimeoutMs,
          funderCacheDays: config.funderCacheDays,
        }),
        JSON.stringify(documents.map(({ id, filename, category, source_type, content_sha256 }) => ({
          id, filename, category, source_type, content_sha256,
        }))),
        request.correlationId,
        analysisStartedAt],
    );
    await query("UPDATE workspaces SET status='reviewing', updated_at=NOW() WHERE id=$1", [workspace.id]);
    await audit(request.ownerHash, "review.started", "review", reviewId, workspace.id, {
      version,
      correlationId: request.correlationId,
      sourceSnapshotId: snapshotId(documents),
    });
    setImmediate(() => processReview({
      reviewId,
      workspace,
      documents,
      ownerHash: request.ownerHash,
      version,
      correlationId: request.correlationId,
      analysisStartedAt,
    }));
    response.status(202).json({
      review: {
        id: reviewId,
        version,
        status: "running",
        stage: "queued",
        completion_state: "awaiting_analysis",
        correlation_id: request.correlationId,
      },
    });
  }));

  app.get("/api/reviews/:id", asyncRoute(async (request, response) => {
    const rows = await query("SELECT * FROM reviews WHERE id=$1 AND owner_hash=$2", [request.params.id, request.ownerHash]);
    if (!rows[0]) throw new HttpError(404, "Review not found.");
    response.json({ review: rows[0] });
  }));

  app.get("/api/reviews/:id/export", asyncRoute(async (request, response) => {
    const rows = await query("SELECT * FROM reviews WHERE id=$1 AND owner_hash=$2", [request.params.id, request.ownerHash]);
    const review = rows[0];
    if (!review) throw new HttpError(404, "Review not found.");
    if (!review.result) throw new HttpError(409, "This review is not complete.");
    const workspace = await requireWorkspace(review.workspace_id, request.ownerHash);
    const format = request.query.format === "json" ? "json" : "markdown";
    await audit(request.ownerHash, "review.exported", "review", review.id, workspace.id, {
      format,
      correlationId: request.correlationId,
      reviewCorrelationId: review.correlation_id,
    });
    if (format === "json") {
      response.attachment(`grant-review-v${review.version}.json`).type("application/json")
        .send(JSON.stringify({ workspace, review: { ...review, result: undefined }, analysis: review.result }, null, 2));
      return;
    }
    response.attachment(`grant-review-v${review.version}.md`).type("text/markdown")
      .send(markdownReport(workspace, review.result));
  }));

  app.post("/api/workspaces/:id/corrections", asyncRoute(async (request, response) => {
    const workspace = await requireWorkspace(request.params.id, request.ownerHash);
    const targetType = cleanText(request.body.targetType, "Target type", { required: true, max: 40 });
    const targetId = cleanText(request.body.targetId, "Target", { required: true, max: 100 });
    const field = cleanText(request.body.field, "Field", { required: true, max: 100 });
    const correctedValue = cleanText(request.body.correctedValue, "Corrected value", { required: true, max: 2000 });
    const reason = cleanText(request.body.reason, "Reason", { max: 1000 });
    let previousValue;
    if (targetType === "fact" && field === "confirmed_value") {
      const facts = await query(
        "SELECT extracted_value,confirmed_value FROM facts WHERE id=$1 AND workspace_id=$2", [targetId, workspace.id],
      );
      if (!facts[0]) throw new HttpError(404, "Fact not found.");
      previousValue = facts[0].confirmed_value || facts[0].extracted_value;
      await query(
        "UPDATE facts SET confirmed_value=$1, confirmed_at=NOW(), updated_at=NOW() WHERE id=$2 AND workspace_id=$3",
        [correctedValue, targetId, workspace.id],
      );
    } else {
      throw new HttpError(400, "That correction target is not supported.");
    }
    const correctionId = newId("cor");
    await query(
      `INSERT INTO corrections
       (id,workspace_id,review_id,owner_hash,target_type,target_id,field,previous_value,corrected_value,reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [correctionId, workspace.id, request.body.reviewId || null, request.ownerHash, targetType,
        targetId, field, previousValue || null, correctedValue, reason],
    );
    await query("UPDATE workspaces SET status='needs_rerun', updated_at=NOW() WHERE id=$1", [workspace.id]);
    await audit(request.ownerHash, "correction.recorded", "correction", correctionId, workspace.id, {
      correlationId: request.correlationId,
    });
    response.status(201).json({ correction: { id: correctionId, previousValue, correctedValue } });
  }));

  app.delete("/api/workspaces/:id", asyncRoute(async (request, response) => {
    const workspace = await requireWorkspace(request.params.id, request.ownerHash);
    const documents = await query(
      "SELECT openai_file_id FROM documents WHERE workspace_id=$1 AND owner_hash=$2", [workspace.id, request.ownerHash],
    );
    for (const document of documents) await deleteDocumentFile(document.openai_file_id);
    await query("DELETE FROM workspaces WHERE id=$1 AND owner_hash=$2", [workspace.id, request.ownerHash]);
    response.json({ deleted: true });
  }));

  app.use((_request, response) => response.status(404).json({ error: "Not found." }));
  app.use(errorMiddleware);
  return app;
}

export function publicMeta() {
  return {
    service: "grant-analyst-api",
    reviewStages: ["analyzing_inputs", "making_decision"],
    manifestVersion: MANIFEST_VERSION,
    dailyReviewLimit: config.maxDailyReviews,
    sessionReviewLimit: config.maxSessionDailyReviews,
    maxUploadMb: Math.round(config.maxUploadBytes / 1024 / 1024),
  };
}

export async function startServer() {
  assertRuntimeConfig();
  await import("../scripts/migrate.mjs");
  const abandonedReviews = await query(
    `SELECT r.id, r.workspace_id, r.correlation_id, r.source_snapshot, r.created_at,
            r.analysis_started_at, w.proposal_version
     FROM reviews r
     JOIN workspaces w ON w.id=r.workspace_id
     WHERE r.status='running' AND r.created_at < NOW() - INTERVAL '30 minutes'`,
  );
  for (const review of abandonedReviews) {
    const completedAt = new Date().toISOString();
    const startedAt = new Date(review.analysis_started_at || review.created_at).toISOString();
    const errorRecord = {
      code: analysisErrorCodes.serviceRestart,
      module_id: "orchestrator",
      message: "The server restarted before this review completed.",
      retryable: true,
      provider_request_id: null,
    };
    const manifest = createAnalysisManifest({
      reviewId: review.id,
      workspace: {
        id: review.workspace_id,
        proposal_version: review.proposal_version,
      },
      documents: Array.isArray(review.source_snapshot) ? review.source_snapshot : [],
      correlationId: review.correlation_id,
      startedAt,
      completedAt,
      completionState: "failed",
      moduleRuns: [{
        module_id: "orchestrator",
        status: "failed",
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
        error_code: analysisErrorCodes.serviceRestart,
      }],
      providerRequests: [],
      errors: [errorRecord],
    });
    await query(
      `UPDATE reviews SET status='failed', stage='failed', completion_state='failed',
       error_code=$1, error_message=$2, analysis_manifest=$3::jsonb, completed_at=NOW()
       WHERE id=$4`,
      [analysisErrorCodes.serviceRestart, errorRecord.message, JSON.stringify(manifest), review.id],
    );
  }
  const app = createApp();
  return app.listen(config.port, "0.0.0.0", () => {
    console.log(`Grant Analyst API listening on port ${config.port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
