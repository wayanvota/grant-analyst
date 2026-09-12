import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import multer from "multer";

const app = express();
const port = Number(process.env.PORT || 4187);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "frontend/dist");
const allowedExtensions = new Set(["pdf", "txt", "md", "json", "html", "xml", "doc", "docx", "rtf", "odt", "ppt", "pptx", "csv", "xls", "xlsx"]);
const allowedCategories = new Set(["proposal", "funder_material", "evidence", "budget", "attachment", "other"]);
const workspaces = new Map();
const documents = new Map();
const reviews = new Map();
const facts = new Map();

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function owner(request) {
  const token = request.get("x-grant-session") || "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    const error = new Error("A valid private browser session is required.");
    error.status = 401;
    throw error;
  }
  return crypto.createHash("sha256").update(`fixture:${token}`).digest("hex");
}

function clean(value, label, { required = false, max = 500 } = {}) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) {
    const error = new Error(`${label} is required.`);
    error.status = 400;
    throw error;
  }
  if (result.length > max) {
    const error = new Error(`${label} is too long.`);
    error.status = 400;
    throw error;
  }
  return result || null;
}

function requireWorkspace(workspaceId, ownerHash) {
  const workspace = workspaces.get(workspaceId);
  if (!workspace || workspace.owner_hash !== ownerHash) {
    const error = new Error("Workspace not found.");
    error.status = 404;
    throw error;
  }
  return workspace;
}

function publicWorkspace(workspace) {
  return {
    ...workspace,
    owner_hash: undefined,
    document_count: [...documents.values()].filter((item) => item.workspace_id === workspace.id).length,
    review_count: [...reviews.values()].filter((item) => item.workspace_id === workspace.id).length,
  };
}

function bundle(workspace) {
  return {
    workspace: publicWorkspace(workspace),
    documents: [...documents.values()].filter((item) => item.workspace_id === workspace.id)
      .map(({ openai_file_id: _fileId, owner_hash: _ownerHash, workspace_id: _workspaceId, ...item }) => item),
    reviews: [...reviews.values()].filter((item) => item.workspace_id === workspace.id)
      .map(({ owner_hash: _ownerHash, result: _result, workspace_id: _workspaceId, ...item }) => item),
    facts: [...facts.values()].filter((item) => item.workspace_id === workspace.id)
      .map(({ workspace_id: _workspaceId, ...item }) => item),
    corrections: [],
  };
}

function analysisFor(workspace) {
  return {
    schema_version: "2.0",
    generated_at: new Date().toISOString(),
    pipeline: {
      version: "two_layer_fast_v1", status: "complete", partial: false, warnings: [], errors: [],
      funder_cache: "fixture", layer_1_ms: 8, layer_2_ms: 4, total_ms: 12,
    },
    facts: {
      applicant_identity: workspace.organization,
      requested_amount: workspace.requested_amount || "Not supplied",
      geography: workspace.geography || "Not supplied",
    },
    due_diligence: {
      dimensions: [{
        name: "Evidence completeness", weight: 100, rating: 3, confidence: "medium",
        rationale: "The synthetic proposal documents its main activity but needs an independent outcome baseline.",
      }],
      findings: [],
      claims: [{
        claim_id: "CLM-1", claim_text: "The applicant can deliver the proposed pilot.",
        importance: "high", evidence_status: "partially_supported", source_quality: "mixed",
        confidence: "medium", issue: "The delivery claim lacks an independently verified baseline.",
        required_fix: "Add the baseline source and accountable owner.",
      }],
    },
    funder_research: {
      sources: [{
        title: "Synthetic opportunity guidelines", publisher: "Fixture Foundation",
        publication_date: "2030-01-01", accessed_date: "2030-01-02", source_type: "primary",
        url: "https://example.org/guidelines", reliability_tier: 1, notes: "Deterministic fixture only.",
      }],
    },
    reviewer_panel: {
      reviewers: [{ persona: "Skeptical program officer", recommendation: "revise", rejection_reasons: ["Baseline gap"] }],
      five_damaging_questions: [
        "Does the applicant meet every current eligibility requirement?",
        "Which load-bearing claims have primary evidence?",
        "Does the budget support the delivery model?",
        "Are outcomes measurable and attributable?",
        "What current evidence establishes funder fit?",
      ],
    },
    adjudication: {
      recommendation: "revise", proposal_merit: "promising", eligibility: "eligible",
      eligibility_basis: "The supplied synthetic guidelines document the applicant type.",
      funder_fit: "moderate", competitive_readiness: "needs_revision", confidence: "medium",
      diagnostic_score: 68,
      decision_logic: "The concept is plausible, but the evidence gap weakens competitive readiness.",
      strongest_reason_to_fund: "The proposal addresses a documented program priority.",
      strongest_reason_to_reject: "The outcome baseline is not independently supported.",
      submission_blockers: ["Verify the outcome baseline."],
      revision_priorities: [{
        rank: 1, title: "Document the baseline", severity: "high", fix_category: "missing_evidence",
        required_fix: "Add a dated primary source and accountable measurement owner.",
      }],
      limitations: ["This deterministic fixture is not a funding prediction."],
    },
  };
}

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use((request, response, next) => {
  response.set("X-Correlation-ID", id("req"));
  const origin = request.get("origin");
  if (origin && origin !== `http://127.0.0.1:${port}`) {
    return response.status(403).json({ error: "This website is not allowed to use the API." });
  }
  if (origin) response.set("Access-Control-Allow-Origin", origin);
  return next();
});
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => response.json({ ok: true, service: "grant-analyst-fixture" }));
app.get("/api/meta", (_request, response) => response.json({
  service: "grant-analyst-api", reviewStages: ["analyzing_inputs", "making_decision"],
  manifestVersion: "fixture", dailyReviewLimit: 20, sessionReviewLimit: 2, maxUploadMb: 1,
}));

app.use("/api", (request, _response, next) => {
  try {
    request.ownerHash = owner(request);
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/api/workspaces", (request, response) => response.json({
  workspaces: [...workspaces.values()].filter((item) => item.owner_hash === request.ownerHash).map(publicWorkspace),
}));

app.post("/api/workspaces", (request, response, next) => {
  try {
    const workspace = {
      id: id("wrk"), owner_hash: request.ownerHash,
      organization: clean(request.body.organization, "Organization", { required: true }),
      funder: clean(request.body.funder, "Funder", { required: true }),
      opportunity: clean(request.body.opportunity, "Opportunity", { required: true }),
      deadline: clean(request.body.deadline, "Deadline", { max: 100 }),
      requested_amount: clean(request.body.requestedAmount, "Requested amount", { max: 100 }),
      geography: clean(request.body.geography, "Geography"),
      program_area: clean(request.body.programArea, "Program area"),
      organization_type: clean(request.body.organizationType, "Organization type"),
      proposal_version: clean(request.body.proposalVersion, "Proposal version", { max: 100 }) || "1",
      status: "draft", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    workspaces.set(workspace.id, workspace);
    response.status(201).json({ workspace: publicWorkspace(workspace) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/workspaces/:id", (request, response, next) => {
  try {
    response.json(bundle(requireWorkspace(request.params.id, request.ownerHash)));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/workspaces/:id", (request, response, next) => {
  try {
    const workspace = requireWorkspace(request.params.id, request.ownerHash);
    const mappings = {
      organization: "organization", funder: "funder", opportunity: "opportunity", deadline: "deadline",
      requestedAmount: "requested_amount", geography: "geography", programArea: "program_area",
      organizationType: "organization_type", proposalVersion: "proposal_version",
    };
    const entries = Object.entries(request.body).filter(([key]) => key in mappings);
    if (!entries.length) {
      const error = new Error("No supported workspace fields were supplied.");
      error.status = 400;
      throw error;
    }
    for (const [key, value] of entries) workspace[mappings[key]] = clean(value, key, {
      required: ["organization", "funder", "opportunity"].includes(key),
    });
    workspace.status = "needs_rerun";
    workspace.updated_at = new Date().toISOString();
    response.json(bundle(workspace));
  } catch (error) {
    next(error);
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter(_request, file, callback) {
    const extension = file.originalname.split(".").pop()?.toLowerCase();
    callback(null, Boolean(extension && allowedExtensions.has(extension)));
  },
});

app.post("/api/workspaces/:id/documents", upload.single("file"), (request, response, next) => {
  try {
    const workspace = requireWorkspace(request.params.id, request.ownerHash);
    if (!request.file) {
      const error = new Error("Choose a supported document to upload.");
      error.status = 400;
      throw error;
    }
    const category = String(request.body.category || "other");
    if (!allowedCategories.has(category)) {
      const error = new Error("Invalid document category.");
      error.status = 400;
      throw error;
    }
    const document = {
      id: id("doc"), workspace_id: workspace.id, owner_hash: request.ownerHash,
      category, source_type: request.body.sourceType === "pasted_text" ? "pasted_text" : "user_supplied",
      filename: request.file.originalname, mime_type: request.file.mimetype,
      size_bytes: request.file.size, processing_status: "ready", created_at: new Date().toISOString(),
      openai_file_id: "fixture_file",
    };
    documents.set(document.id, document);
    workspace.status = "needs_rerun";
    response.status(201).json({ document });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/documents/:id", (request, response) => {
  const document = documents.get(request.params.id);
  if (!document || document.owner_hash !== request.ownerHash) return response.status(404).json({ error: "Document not found." });
  documents.delete(document.id);
  return response.json({ deleted: true });
});

app.post("/api/workspaces/:id/analyze", (request, response, next) => {
  try {
    const workspace = requireWorkspace(request.params.id, request.ownerHash);
    const proposalDocuments = [...documents.values()].filter((item) => item.workspace_id === workspace.id && item.category === "proposal");
    if (!proposalDocuments.length) {
      const error = new Error("Add at least one document labeled as the proposal.");
      error.status = 400;
      throw error;
    }
    const result = analysisFor(workspace);
    const review = {
      id: id("rev"), workspace_id: workspace.id, owner_hash: request.ownerHash, version: 1,
      status: "completed", stage: "completed", completion_state: "complete", recommendation: "revise",
      score: 68, result, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      correlation_id: response.get("X-Correlation-ID"),
    };
    reviews.set(review.id, review);
    const fact = {
      id: id("fac"), workspace_id: workspace.id, fact_key: "requested_amount",
      extracted_value: workspace.requested_amount || "Not supplied", confirmed_value: null,
      confidence: "medium", updated_at: new Date().toISOString(),
    };
    facts.set(fact.id, fact);
    workspace.status = "reviewed";
    response.status(202).json({ review: { id: review.id, version: 1, status: "running", stage: "queued" } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reviews/:id", (request, response) => {
  const review = reviews.get(request.params.id);
  if (!review || review.owner_hash !== request.ownerHash) return response.status(404).json({ error: "Review not found." });
  return response.json({ review });
});

app.get("/api/reviews/:id/export", (request, response) => {
  const review = reviews.get(request.params.id);
  if (!review || review.owner_hash !== request.ownerHash) return response.status(404).json({ error: "Review not found." });
  if (request.query.format === "json") return response.attachment("grant-review-v1.json").json({ analysis: review.result });
  return response.attachment("grant-review-v1.md").type("text/markdown").send("# Grant review\n\nDeterministic E2E fixture.\n");
});

app.post("/api/workspaces/:id/corrections", (request, response, next) => {
  try {
    const workspace = requireWorkspace(request.params.id, request.ownerHash);
    const fact = facts.get(request.body.targetId);
    if (request.body.targetType !== "fact" || request.body.field !== "confirmed_value" || !fact || fact.workspace_id !== workspace.id) {
      const error = new Error("That correction target is not supported.");
      error.status = 400;
      throw error;
    }
    const correctedValue = clean(request.body.correctedValue, "Corrected value", { required: true, max: 2000 });
    const previousValue = fact.confirmed_value || fact.extracted_value;
    fact.confirmed_value = correctedValue;
    fact.updated_at = new Date().toISOString();
    workspace.status = "needs_rerun";
    response.status(201).json({ correction: { id: id("cor"), previousValue, correctedValue } });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/workspaces/:id", (request, response, next) => {
  try {
    const workspace = requireWorkspace(request.params.id, request.ownerHash);
    workspaces.delete(workspace.id);
    for (const [documentId, document] of documents) if (document.workspace_id === workspace.id) documents.delete(documentId);
    for (const [reviewId, review] of reviews) if (review.workspace_id === workspace.id) reviews.delete(reviewId);
    for (const [factId, fact] of facts) if (fact.workspace_id === workspace.id) facts.delete(factId);
    response.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

app.get("/config.js", (_request, response) => response.type("application/javascript").send(
  `window.GRANT_ANALYST_CONFIG = { apiBase: "http://127.0.0.1:${port}" };`,
));
app.use(express.static(dist, { index: "index.html", dotfiles: "allow" }));
app.use((_request, response) => response.status(404).json({ error: "Not found." }));
app.use((error, _request, response, _next) => {
  const status = error?.code === "LIMIT_FILE_SIZE" || error?.type === "entity.too.large" ? 413
    : Number.isInteger(error?.status) ? error.status : error instanceof SyntaxError ? 400 : 500;
  response.status(status).json({
    error: status >= 500 ? "The request could not be completed." : error.message,
    error_code: status >= 500 ? "INTERNAL_REQUEST_ERROR" : "REQUEST_REJECTED",
  });
});

app.listen(port, "127.0.0.1", () => console.log(`Grant Analyst E2E fixture listening on ${port}`));
