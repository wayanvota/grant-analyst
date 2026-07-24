import { FormEvent, useEffect, useState } from "react";
import { api, apiBase, download } from "./api";
import type { Analysis, Bundle, FactRow, Workspace } from "./types";

const emptyForm = {
  organization: "", funder: "", opportunity: "", deadline: "", requestedAmount: "",
  geography: "", programArea: "", organizationType: "", proposalVersion: "1",
};

const reviewStages = [
  ["analyzing_inputs", "Analyzing proposal and funder", "Reading the proposal while checking cached or current funder intelligence."],
  ["making_decision", "Building the decision", "Combining due diligence, skeptical review, citation audit, and revision priorities."],
] as const;
const completedReviewStates = new Set(["completed", "complete", "complete_with_warnings", "partial"]);

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [paste, setPaste] = useState({ proposal: "", funder_material: "", evidence: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewProgress, setReviewProgress] = useState<{
    id: string; stage: string; startedAt: number;
  } | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [tab, setTab] = useState<"decision" | "scorecard" | "claims" | "stress" | "sources" | "facts">("decision");
  const [meta, setMeta] = useState<{ sessionReviewLimit?: number; maxUploadMb?: number }>({});

  const refreshList = async () => {
    const data = await api<{ workspaces: Workspace[] }>("/api/workspaces");
    setWorkspaces(data.workspaces);
    return data.workspaces;
  };

  const openWorkspace = async (id: string) => {
    setBusy("Loading workspace");
    setError("");
    try {
      const data = await api<Bundle>(`/api/workspaces/${id}`);
      setBundle(data);
      setAnalysis(null);
      setReviewId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load workspace.");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ workspaces: Workspace[] }>("/api/workspaces"),
      fetch(`${apiBase}/api/meta`).then((response) => response.json()),
    ]).then(async ([workspaceData, metaData]) => {
      if (!active) return;
      setWorkspaces(workspaceData.workspaces);
      setMeta(metaData);
      if (workspaceData.workspaces[0]) {
        const data = await api<Bundle>(`/api/workspaces/${workspaceData.workspaces[0].id}`);
        if (active) setBundle(data);
      }
    }).catch((cause) => active && setError(
      cause instanceof Error ? cause.message : "The API could not be reached.",
    ));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!reviewProgress) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [reviewProgress?.id]);

  useEffect(() => {
    if (!bundle || analysis || reviewProgress) return;
    const running = bundle.reviews.find((review) => review.status === "running");
    if (running) {
      setReviewId(running.id);
      setReviewProgress({
        id: running.id,
        stage: running.stage,
        startedAt: new Date(running.created_at).getTime(),
      });
    }
  }, [bundle, analysis, reviewProgress]);

  useEffect(() => {
    if (!reviewProgress || !bundle) return;
    let active = true;
    const workspaceId = bundle.workspace.id;
    const progressId = reviewProgress.id;

    async function pollReview() {
      try {
        for (let attempt = 0; active && attempt < 720; attempt += 1) {
          const current = await api<{ review: {
            status: string; stage: string; error_message?: string; result: Analysis | null;
          } }>(`/api/reviews/${progressId}`);
          if (!active) return;
          setReviewProgress((progress) => progress?.id === progressId
            ? { ...progress, stage: current.review.stage }
            : progress);
          if (current.review.status === "failed") {
            throw new Error(current.review.error_message || "Review failed.");
          }
          if (completedReviewStates.has(current.review.status) && current.review.result) {
            const latestBundle = await api<Bundle>(`/api/workspaces/${workspaceId}`);
            if (!active) return;
            setBundle(latestBundle);
            setAnalysis(current.review.result);
            setReviewId(progressId);
            setReviewProgress(null);
            setTab("decision");
            await refreshList();
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
        }
        if (active) throw new Error("The review is taking longer than expected. Reopen this workspace to check its status.");
      } catch (cause) {
        if (!active) return;
        setReviewProgress(null);
        setError(cause instanceof Error ? cause.message : "Review failed.");
        const latestBundle = await api<Bundle>(`/api/workspaces/${workspaceId}`).catch(() => null);
        if (latestBundle && active) setBundle(latestBundle);
      }
    }

    pollReview();
    return () => { active = false; };
  }, [reviewProgress?.id]);

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    setBusy("Creating workspace");
    setError("");
    try {
      const data = await api<{ workspace: Workspace }>("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm(emptyForm);
      await refreshList();
      await openWorkspace(data.workspace.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create workspace.");
    } finally {
      setBusy("");
    }
  }

  async function upload(file: File, category: string, sourceType = "user_supplied") {
    if (!bundle) return;
    setBusy(`Uploading ${file.name}`);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("category", category);
      body.set("sourceType", sourceType);
      await api(`/api/workspaces/${bundle.workspace.id}/documents`, { method: "POST", body });
      await openWorkspace(bundle.workspace.id);
      await refreshList();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy("");
    }
  }

  async function uploadPaste(category: keyof typeof paste) {
    const value = paste[category].trim();
    if (!value) return;
    await upload(new File([value], `${category}-${Date.now()}.txt`, { type: "text/plain" }), category, "pasted_text");
    setPaste((current) => ({ ...current, [category]: "" }));
  }

  async function runReview() {
    if (!bundle) return;
    setBusy("Starting review");
    setError("");
    try {
      const data = await api<{ review: { id: string } }>(`/api/workspaces/${bundle.workspace.id}/analyze`, {
        method: "POST",
      });
      setReviewId(data.review.id);
      setReviewProgress({ id: data.review.id, stage: "queued", startedAt: Date.now() });
      const latestBundle = await api<Bundle>(`/api/workspaces/${bundle.workspace.id}`);
      setBundle(latestBundle);
      await refreshList();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review failed.");
    } finally {
      setBusy("");
    }
  }

  async function openReview(id: string) {
    setBusy("Loading review");
    try {
      const data = await api<{ review: { result: Analysis | null } }>(`/api/reviews/${id}`);
      if (!data.review.result) throw new Error("This review has not completed.");
      setAnalysis(data.review.result);
      setReviewId(id);
      setTab("decision");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load review.");
    } finally {
      setBusy("");
    }
  }

  async function confirmFact(fact: FactRow, correctedValue: string) {
    if (!bundle) return;
    setBusy("Saving correction");
    try {
      await api(`/api/workspaces/${bundle.workspace.id}/corrections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "fact", targetId: fact.id, field: "confirmed_value", correctedValue, reviewId,
        }),
      });
      await openWorkspace(bundle.workspace.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save correction.");
    } finally {
      setBusy("");
    }
  }

  async function removeDocument(id: string) {
    if (!bundle || !confirm("Remove this document from the workspace?")) return;
    setBusy("Removing document");
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      await openWorkspace(bundle.workspace.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove document.");
    } finally {
      setBusy("");
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" disabled={!!reviewProgress}
        onClick={() => { setBundle(null); setAnalysis(null); }}>
        <span className="brand-mark">GA</span> Grant Analyst
      </button>
      <div className="topbar-actions">
        <span className="saved-state"><i /> Pseudonymous browser session</span>
        {bundle && <button className="button button-outline" disabled={!!reviewProgress}
          onClick={() => setBundle(null)}>New review</button>}
      </div>
    </header>

    <div className="workspace-layout">
      <aside className="sidebar">
        <span className="sidebar-label">Your workspaces</span>
        <nav>{workspaces.map((workspace) =>
          <button className={`nav-item ${bundle?.workspace.id === workspace.id ? "active" : ""}`}
            disabled={!!reviewProgress && bundle?.workspace.id !== workspace.id}
            key={workspace.id} onClick={() => openWorkspace(workspace.id)}>
            <span>{workspace.review_count ?? 0}</span>
            <div>{workspace.organization}<small>{workspace.funder}</small></div>
          </button>)}</nav>
        <div className="sidebar-note">
          <strong>Public demo limits</strong>
          Up to {meta.sessionReviewLimit ?? 2} reviews per browser each day. Files may be up to {meta.maxUploadMb ?? 15} MB.
          Clearing browser storage removes access to saved workspaces.
        </div>
      </aside>

      <section className="content">
        {error && <div className="notice" role="alert"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        {busy && <div className="guardrail" role="status">{busy}</div>}
        {reviewProgress && <ReviewProgress stage={reviewProgress.stage}
          startedAt={reviewProgress.startedAt} now={clock} />}

        {!bundle ? <NewWorkspace form={form} setForm={setForm} onSubmit={createWorkspace} busy={busy} />
          : analysis ? <Results
            bundle={bundle} analysis={analysis} reviewId={reviewId} tab={tab} setTab={setTab}
            confirmFact={confirmFact} close={() => setAnalysis(null)}
          />
            : <WorkspaceView
              bundle={bundle} paste={paste} setPaste={setPaste} busy={busy}
              reviewRunning={!!reviewProgress}
              upload={upload} uploadPaste={uploadPaste} runReview={runReview}
              removeDocument={removeDocument} openReview={openReview}
              deleteWorkspace={async () => {
                if (!confirm("Permanently delete this workspace, its reviews, and its uploaded files?")) return;
                setBusy("Deleting workspace");
                try {
                  await api(`/api/workspaces/${bundle.workspace.id}`, { method: "DELETE" });
                  setBundle(null);
                  setAnalysis(null);
                  await refreshList();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Could not delete workspace.");
                } finally {
                  setBusy("");
                }
              }}
            />}
      </section>
    </div>
  </main>;
}

function NewWorkspace({ form, setForm, onSubmit, busy }: {
  form: typeof emptyForm; setForm: (form: typeof emptyForm) => void;
  onSubmit: (event: FormEvent) => void; busy: string;
}) {
  const fields = [
    ["organization", "Organization *"], ["funder", "Funder *"], ["opportunity", "Opportunity *"],
    ["deadline", "Deadline"], ["requestedAmount", "Requested amount"], ["geography", "Geography"],
    ["programArea", "Program area"], ["organizationType", "Organization type"], ["proposalVersion", "Proposal version"],
  ] as const;
  return <>
    <div className="page-heading"><div>
      <span className="eyebrow">Pre-submission due diligence</span>
      <h1>Find the rejection case before the funder does.</h1>
      <p>Create a pseudonymous browser workspace for one proposal and one funding opportunity.</p>
    </div></div>
    <div className="guardrail">
      Public demo: uploaded files are sent to OpenAI and workspace data is stored in Neon. Do not submit
      confidential proposals. Delete the workspace when finished.
    </div>
    <form className="panel" onSubmit={onSubmit}>
      <div className="panel-heading"><div><span className="step">01</span><h2>New review workspace</h2></div></div>
      <div className="form-grid">{fields.map(([key, title]) => <label key={key}>{title}
        <input required={title.endsWith("*")} value={form[key]}
          onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
      </label>)}</div>
      <div className="action-row"><button disabled={!!busy} className="button button-orange">Create workspace</button></div>
    </form>
    <section className="about-section" aria-labelledby="about-grant-analyst">
      <div>
        <span className="eyebrow">About this tool</span>
        <h2 id="about-grant-analyst">Built to make grant proposals harder to reject.</h2>
      </div>
      <div className="about-copy">
        <p>
          I’m Wayan Vota, and I created Grant Analyst because proposal teams need a fast,
          evidence-first way to expose weak claims, eligibility risks, and likely rejection
          arguments before a funder sees them.
        </p>
        <p>
          The tool turns that scrutiny into practical revision priorities. It supports human
          judgment rather than replacing it, and its assessment is not a prediction of a
          funder’s decision.
        </p>
        <a className="button button-outline" href="https://wayan.com/portfolio/">
          See my other work
        </a>
      </div>
    </section>
  </>;
}

function ReviewProgress({ stage, startedAt, now }: { stage: string; startedAt: number; now: number }) {
  const activeIndex = reviewStages.findIndex(([key]) => key === stage);
  const visibleIndex = activeIndex >= 0 ? activeIndex : 0;
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const progress = stage === "completed" ? 100 : stage === "queued"
    ? Math.min(8, 4 + elapsedSeconds)
    : stage === "analyzing_inputs"
      ? Math.min(55, 8 + (elapsedSeconds / 45) * 47)
      : Math.min(96, 55 + (Math.max(0, elapsedSeconds - 30) / 55) * 41);
  const elapsed = elapsedSeconds < 60
    ? `${elapsedSeconds}s`
    : `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, "0")}s`;
  const current = reviewStages[visibleIndex];
  const activity = stage === "queued"
    ? "Securing the workspace and preparing your source files."
    : stage === "analyzing_inputs"
      ? elapsedSeconds < 15
        ? "Reading the proposal and mapping its core claims."
        : elapsedSeconds < 35
          ? "Testing evidence, feasibility, budget, and eligibility."
          : "Verifying public funder sources and resolving evidence gaps."
      : elapsedSeconds < 65
        ? "Building the strongest funding and rejection cases."
        : "Auditing citations and ranking the revisions that could change the decision.";

  return <section className="review-progress" role="status" aria-live="polite">
    <div className="review-progress-head">
      <div><span className="working-dot" aria-hidden="true" />
        <div><span className="eyebrow">Review in progress</span>
          <h2>{stage === "queued" ? "Preparing the review" : current[1]}</h2></div>
      </div>
      <div className="review-timing"><strong>{stage === "queued" ? "Queued" : `Layer ${visibleIndex + 1} of ${reviewStages.length}`}</strong>
        <span>{elapsed} elapsed</span></div>
    </div>
    <div className="progress-track" role="progressbar" aria-label="Grant review progress"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
      <span style={{ width: `${progress}%` }} />
    </div>
    <ol className="progress-stages">{reviewStages.map(([key, title], index) => {
      const complete = activeIndex > index || stage === "completed";
      const active = key === stage;
      return <li key={key} className={complete ? "complete" : active ? "active" : "pending"}>
        <span>{complete ? "✓" : String(index + 1).padStart(2, "0")}</span><strong>{title}</strong>
      </li>;
    })}</ol>
    <p>{activity}</p>
    <small>{current[2]} The full review may take up to 90 seconds and continues safely if this page refreshes.</small>
  </section>;
}

function WorkspaceView({ bundle, paste, setPaste, busy, reviewRunning, upload, uploadPaste, runReview, removeDocument, openReview, deleteWorkspace }: {
  bundle: Bundle; paste: { proposal: string; funder_material: string; evidence: string };
  setPaste: (value: { proposal: string; funder_material: string; evidence: string }) => void;
  busy: string; reviewRunning: boolean; upload: (file: File, category: string) => Promise<void>;
  uploadPaste: (category: keyof typeof paste) => Promise<void>; runReview: () => Promise<void>;
  removeDocument: (id: string) => Promise<void>; openReview: (id: string) => Promise<void>;
  deleteWorkspace: () => Promise<void>;
}) {
  const categories = [
    ["proposal", "Proposal", "Paste the complete proposal or upload the file."],
    ["funder_material", "Funder materials", "Paste guidelines, eligibility criteria, or the call for proposals."],
    ["evidence", "Evidence", "Paste research, evaluation notes, budget context, or partner evidence."],
  ] as const;
  return <>
    <div className="page-heading compact"><div><span className="eyebrow">Review workspace</span>
      <h1>{bundle.workspace.organization}</h1><p>{bundle.workspace.opportunity} · {bundle.workspace.funder}</p>
    </div><button className="button button-ghost danger-button" disabled={reviewRunning}
      onClick={deleteWorkspace}>Delete workspace</button></div>
    <section className="panel">
      <div className="panel-heading"><div><span className="step">01</span><h2>Source materials</h2></div>
        <p>{bundle.documents.length} document{bundle.documents.length === 1 ? "" : "s"}</p></div>
      <div className="document-grid">{categories.map(([category, title, placeholder]) => <div className="document-card" key={category}>
        <div className="document-card-head"><div><span className="doc-icon">§</span><strong>{title}</strong></div>
          {category === "proposal" && <span className="badge required">Required</span>}</div>
        <textarea value={paste[category]} onChange={(event) => setPaste({ ...paste, [category]: event.target.value })}
          placeholder={placeholder} />
        <div className="document-footer">
          <button className="text-button" disabled={!paste[category].trim() || !!busy || reviewRunning}
            onClick={() => uploadPaste(category)}>Save pasted text</button>
          <label className={`file-button ${reviewRunning ? "disabled" : ""}`}>Upload file<input type="file"
            disabled={reviewRunning}
            accept=".pdf,.txt,.md,.json,.html,.xml,.doc,.docx,.rtf,.odt,.ppt,.pptx,.csv,.xls,.xlsx"
            onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], category)} /></label>
        </div>
      </div>)}</div>
    </section>
    {!!bundle.documents.length && <section className="panel">
      <div className="panel-heading"><h2>Uploaded documents</h2></div>
      <div className="source-list">{bundle.documents.map((document) => <article key={document.id}>
        <span>{label(document.category)}</span><div><strong>{document.filename}</strong>
          <p>{Math.ceil(document.size_bytes / 1024)} KB · {label(document.source_type)}</p></div>
        <button className="text-button danger" disabled={reviewRunning}
          onClick={() => removeDocument(document.id)}>Remove</button>
      </article>)}</div>
    </section>}
    <div className="run-panel"><div><span className="eyebrow">Two-layer fast analysis</span>
      <h2>Analyze in parallel, then make the decision.</h2>
      <p>Your proposal and funder context are reviewed together, with cached public research when available.</p></div>
      <button className="button button-orange" disabled={!!busy || reviewRunning || !bundle.documents.some((doc) => doc.category === "proposal")}
        onClick={runReview}>{reviewRunning ? "Review in progress" : "Run full review"}</button></div>
    {!!bundle.reviews.length && <section className="panel">
      <div className="panel-heading"><h2>Version history</h2></div>
      <div className="source-list">{bundle.reviews.map((review) => {
        const openable = completedReviewStates.has(review.status);
        const stateLabel = review.completion_state && review.completion_state !== "complete"
          ? `${label(review.completion_state)} · `
          : "";
        return <article key={review.id}>
          <span>V{review.version}</span><div><strong>{openable
            ? `${stateLabel}${label(review.recommendation || "")} · ${review.score}/100`
            : label(review.stage)}</strong>
            <p>{new Date(review.created_at).toLocaleString()}</p></div>
          {openable && <button className="text-button" onClick={() => openReview(review.id)}>Open</button>}
        </article>;
      })}</div>
    </section>}
  </>;
}

function Results({ bundle, analysis, reviewId, tab, setTab, confirmFact, close }: {
  bundle: Bundle; analysis: Analysis; reviewId: string | null;
  tab: "decision" | "scorecard" | "claims" | "stress" | "sources" | "facts";
  setTab: (value: typeof tab) => void;
  confirmFact: (fact: FactRow, value: string) => Promise<void>; close: () => void;
}) {
  const final = analysis.adjudication;
  return <>
    <div className="page-heading compact result-heading"><div>
      <span className="eyebrow">Review completed {new Date(analysis.generated_at).toLocaleDateString()}</span>
      <h1>{bundle.workspace.organization}</h1><p>{bundle.workspace.opportunity} · {bundle.workspace.funder}</p>
    </div><div className={`recommendation ${final.recommendation === "no_go" ? "no-go" : ""}`}>
      <span>Recommendation</span><strong>{label(final.recommendation)}</strong>
    </div></div>
    <div className="guardrail">Assessment, not prediction. Correct material facts and re-run after changing the proposal.</div>
    {analysis.pipeline?.partial && <div className="guardrail warning">
      Fast review completed with limitations: {analysis.pipeline.warnings.join(" ")}
    </div>}
    <div className="result-tabs">{(["decision", "scorecard", "claims", "stress", "sources", "facts"] as const)
      .map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{label(name)}</button>)}</div>
    {tab === "decision" && <><div className="metric-grid">
      <div className="metric"><span>Eligibility</span><strong>{label(final.eligibility)}</strong><p>{final.eligibility_basis}</p></div>
      <div className="metric"><span>Diagnostic score</span><strong>{final.diagnostic_score}/100</strong><p>{label(final.proposal_merit)}</p></div>
      <div className="metric"><span>Competitive readiness</span><strong>{label(final.competitive_readiness)}</strong><p>Confidence: {final.confidence}</p></div>
    </div><div className="decision-grid">
      <article className="finding-card positive"><span className="finding-label">Strongest case</span><h2>Why a funder might say yes</h2><p>{final.strongest_reason_to_fund}</p></article>
      <article className="finding-card negative"><span className="finding-label">Rejection case</span><h2>Why a funder might say no</h2><p>{final.strongest_reason_to_reject}</p></article>
    </div><section className="panel"><div className="panel-heading"><h2>Revision priorities</h2></div>
      <div className="revision-list">{final.revision_priorities.map((item) => <article key={item.rank}>
        <span className="revision-number">{String(item.rank).padStart(2, "0")}</span>
        <div><h3>{item.title}</h3><p>{item.required_fix}</p></div>
        <div className="revision-meta"><span className={`severity ${item.severity}`}>{item.severity}</span><span>{label(item.fix_category)}</span></div>
      </article>)}</div></section></>}
    {tab === "scorecard" && <section className="panel"><div className="score-header">
      <span>Dimension</span><span>Rating</span><span>Weight</span><span>Confidence</span></div>
      {analysis.due_diligence.dimensions.map((item) => <div className="score-row" key={item.name}>
        <div><strong>{item.name}</strong><p>{item.rationale}</p></div><div className="rating"><strong>{item.rating}</strong>/5</div>
        <div>{item.weight}%</div><div><span className={`confidence ${item.confidence}`}>{item.confidence}</span></div>
      </div>)}</section>}
    {tab === "claims" && <div className="claims-list">{analysis.due_diligence.claims.map((claim) => <article className="claim-card" key={claim.claim_id}>
      <div className="claim-top"><span className="claim-id">{claim.claim_id}</span><span className={`claim-status ${claim.evidence_status}`}>{label(claim.evidence_status)}</span></div>
      <blockquote>{claim.claim_text}</blockquote><div className="claim-grid"><div><span>Importance</span><strong>{label(claim.importance)}</strong></div>
        <div><span>Source quality</span><strong>{label(claim.source_quality)} · {claim.confidence} confidence</strong></div></div>
      <div className="claim-analysis"><div><span>Issue</span><p>{claim.issue}</p></div><div><span>Required fix</span><p>{claim.required_fix}</p></div></div>
    </article>)}</div>}
    {tab === "stress" && <><div className="rejection-memo"><span className="eyebrow">Adversarial review</span>
      <h2>{final.strongest_reason_to_reject}</h2><p>{final.decision_logic}</p></div>
      <section className="panel"><div className="panel-heading"><h2>Five damaging questions</h2></div>
        <ol className="question-list">{analysis.reviewer_panel.five_damaging_questions.map((question, index) =>
          <li key={question}><span>Q{index + 1}</span><p>{question}</p></li>)}</ol></section></>}
    {tab === "sources" && <section className="panel"><div className="panel-heading"><h2>Public funder sources</h2></div>
      <div className="source-list">{analysis.funder_research.sources.map((source) => <article key={`${source.url}-${source.title}`}>
        <span>Tier {source.reliability_tier}</span><div><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
          <p>{source.publisher} · {source.publication_date || "Date unavailable"}</p></div></article>)}</div></section>}
    {tab === "facts" && <FactEditor key={`${reviewId}-${bundle.facts.map((fact) => fact.updated_at).join("-")}`}
      facts={bundle.facts} onSave={confirmFact} />}
    <div className="export-bar"><div><strong>Versioned review</strong><span>Download the analysis and source audit.</span></div>
      <div><button className="button button-ghost" onClick={() => reviewId && download(`/api/reviews/${reviewId}/export?format=json`, "grant-review.json")}>JSON</button>
        <button className="button button-dark" onClick={() => reviewId && download(`/api/reviews/${reviewId}/export?format=markdown`, "grant-review.md")}>Markdown</button>
        <button className="button button-outline" onClick={close}>Workspace</button></div></div>
  </>;
}

function FactEditor({ facts, onSave }: { facts: FactRow[]; onSave: (fact: FactRow, value: string) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(facts.map((fact) => [fact.id, fact.confirmed_value ?? fact.extracted_value ?? ""])),
  );
  return <section className="panel"><div className="panel-heading"><div><h2>Extracted facts</h2></div>
    <p>Correct material facts, then re-run the review.</p></div><div className="fact-list">
      {facts.length ? facts.map((fact) => <label key={fact.id}><span>{label(fact.fact_key)} · {fact.confidence} confidence</span>
        <div><input value={values[fact.id] ?? ""} onChange={(event) => setValues({ ...values, [fact.id]: event.target.value })} />
          <button className="button button-ghost" onClick={() => onSave(fact, values[fact.id] ?? "")}>Confirm</button></div>
      </label>) : <div className="empty-state">Facts appear after the first completed review.</div>}</div></section>;
}
