import { FormEvent, useEffect, useState } from "react";
import { api, apiBase, download } from "./api";
import type { Analysis, Bundle, FactRow, Workspace } from "./types";

const emptyForm = {
  organization: "", funder: "", opportunity: "", deadline: "", requestedAmount: "",
  geography: "", programArea: "", organizationType: "", proposalVersion: "1",
};

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
      let completed: Analysis | null = null;
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const current = await api<{ review: {
          status: string; stage: string; error_message?: string; result: Analysis | null;
        } }>(`/api/reviews/${data.review.id}`);
        setBusy(`Review stage: ${label(current.review.stage)}`);
        if (current.review.status === "failed") throw new Error(current.review.error_message || "Review failed.");
        if (current.review.status === "completed" && current.review.result) {
          completed = current.review.result;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      if (!completed) throw new Error("The review is still running. Open it from version history shortly.");
      await openWorkspace(bundle.workspace.id);
      setAnalysis(completed);
      setReviewId(data.review.id);
      setTab("decision");
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
      <button className="brand" onClick={() => { setBundle(null); setAnalysis(null); }}>
        <span className="brand-mark">GA</span> Grant Analyst
      </button>
      <div className="topbar-actions">
        <span className="saved-state"><i /> Pseudonymous browser session</span>
        {bundle && <button className="button button-outline" onClick={() => setBundle(null)}>New review</button>}
      </div>
    </header>

    <div className="workspace-layout">
      <aside className="sidebar">
        <span className="sidebar-label">Your workspaces</span>
        <nav>{workspaces.map((workspace) =>
          <button className={`nav-item ${bundle?.workspace.id === workspace.id ? "active" : ""}`}
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

        {!bundle ? <NewWorkspace form={form} setForm={setForm} onSubmit={createWorkspace} busy={busy} />
          : analysis ? <Results
            bundle={bundle} analysis={analysis} reviewId={reviewId} tab={tab} setTab={setTab}
            confirmFact={confirmFact} close={() => setAnalysis(null)}
          />
            : <WorkspaceView
              bundle={bundle} paste={paste} setPaste={setPaste} busy={busy}
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
  </>;
}

function WorkspaceView({ bundle, paste, setPaste, busy, upload, uploadPaste, runReview, removeDocument, openReview, deleteWorkspace }: {
  bundle: Bundle; paste: { proposal: string; funder_material: string; evidence: string };
  setPaste: (value: { proposal: string; funder_material: string; evidence: string }) => void;
  busy: string; upload: (file: File, category: string) => Promise<void>;
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
    </div><button className="button button-ghost danger-button" onClick={deleteWorkspace}>Delete workspace</button></div>
    <section className="panel">
      <div className="panel-heading"><div><span className="step">01</span><h2>Source materials</h2></div>
        <p>{bundle.documents.length} document{bundle.documents.length === 1 ? "" : "s"}</p></div>
      <div className="document-grid">{categories.map(([category, title, placeholder]) => <div className="document-card" key={category}>
        <div className="document-card-head"><div><span className="doc-icon">§</span><strong>{title}</strong></div>
          {category === "proposal" && <span className="badge required">Required</span>}</div>
        <textarea value={paste[category]} onChange={(event) => setPaste({ ...paste, [category]: event.target.value })}
          placeholder={placeholder} />
        <div className="document-footer">
          <button className="text-button" disabled={!paste[category].trim() || !!busy}
            onClick={() => uploadPaste(category)}>Save pasted text</button>
          <label className="file-button">Upload file<input type="file"
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
        <button className="text-button danger" onClick={() => removeDocument(document.id)}>Remove</button>
      </article>)}</div>
    </section>}
    <div className="run-panel"><div><span className="eyebrow">Five-stage analysis</span>
      <h2>Extract, research, test, challenge, adjudicate.</h2>
      <p>Your documents are evaluated alongside current public funder sources.</p></div>
      <button className="button button-orange" disabled={!!busy || !bundle.documents.some((doc) => doc.category === "proposal")}
        onClick={runReview}>Run full review</button></div>
    {!!bundle.reviews.length && <section className="panel">
      <div className="panel-heading"><h2>Version history</h2></div>
      <div className="source-list">{bundle.reviews.map((review) => <article key={review.id}>
        <span>V{review.version}</span><div><strong>{review.status === "completed"
          ? `${label(review.recommendation || "")} · ${review.score}/100` : label(review.stage)}</strong>
          <p>{new Date(review.created_at).toLocaleString()}</p></div>
        {review.status === "completed" && <button className="text-button" onClick={() => openReview(review.id)}>Open</button>}
      </article>)}</div>
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
