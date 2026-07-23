"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Workspace = {
  organization: string;
  funder: string;
  opportunity: string;
  deadline: string;
  amount: string;
  geography: string;
  organizationType: string;
  proposal: string;
  funderMaterials: string;
  evidence: string;
};

type Claim = {
  id: string;
  text: string;
  type: string;
  importance: "Load-bearing" | "High" | "Medium";
  status: "Supported" | "Partially supported" | "Unsupported" | "Aspirational";
  issue: string;
  fix: string;
};

type Dimension = {
  name: string;
  weight: number;
  rating: number;
  confidence: "High" | "Medium" | "Low";
  reason: string;
};

type Revision = {
  priority: number;
  title: string;
  category: string;
  severity: "Blocker" | "High" | "Medium";
  effort: "Low" | "Medium" | "High";
  why: string;
};

type Result = {
  runAt: string;
  eligibility: "Eligible" | "Likely eligible" | "Unclear" | "Likely ineligible" | "Ineligible";
  eligibilityReason: string;
  confidence: "High" | "Medium" | "Low";
  score: number;
  verdict: string;
  recommendation: "GO" | "CONDITIONAL GO" | "NO-GO";
  strongestCase: string;
  strongestRejection: string;
  dimensions: Dimension[];
  claims: Claim[];
  revisions: Revision[];
  penalties: string[];
  questions: string[];
};

const EMPTY_WORKSPACE: Workspace = {
  organization: "",
  funder: "",
  opportunity: "",
  deadline: "",
  amount: "",
  geography: "",
  organizationType: "",
  proposal: "",
  funderMaterials: "",
  evidence: "",
};

const EXAMPLE_WORKSPACE: Workspace = {
  organization: "Community Health Access Network",
  funder: "Example Health Foundation",
  opportunity: "Community Maternal Health Innovation Fund",
  deadline: "2026-09-30",
  amount: "450000",
  geography: "Northern Region",
  organizationType: "Registered nonprofit",
  funderMaterials:
    "Eligible applicants must be registered nonprofit organizations operating in the Northern Region. Grants range from $250,000 to $500,000 for projects lasting 24 months. Applicants must provide a monitoring plan, a line-item budget, and signed letters from implementation partners. The fund prioritizes measurable improvements in maternal health access and does not fund stand-alone technology development.",
  proposal:
    "Community Health Access Network requests $450,000 for a 24-month maternal health referral program in the Northern Region. Rural women currently travel long distances to reach qualified maternal care, but the proposal does not yet cite a regional baseline or recent service-use data. The project will train 60 community health workers, establish referral protocols with four clinics, and provide a lightweight case-tracking tool. We expect to reach 6,000 women and increase completed antenatal referrals by 25 percent. The baseline and measurement method will be established during project inception. Four clinics have expressed interest in participating, and signed partnership letters are being requested. The program will employ one program manager, two field coordinators, and a monitoring specialist. Quarterly referral data and patient follow-up interviews will inform adaptation. The tracking tool supports the referral workflow and is not the primary intervention. After the grant, district health offices will be asked to absorb supervision costs.",
  evidence:
    "Applicant annual report, 2025: organization delivered community health programs in 18 districts. Prior evaluation, 2024: referral completion improved during a smaller pilot, but the evaluation did not include a comparison group. Draft budget: personnel $210,000; partner subawards $90,000; training $55,000; technology $35,000; monitoring $40,000; indirect costs $20,000. No signed partner letters are included.",
};

const DIMENSION_WEIGHTS = [
  ["Funder fit", 15],
  ["Problem evidence and user need", 10],
  ["Solution fit and theory of change", 15],
  ["Differentiation and additionality", 10],
  ["Organizational and partner capacity", 10],
  ["Implementation feasibility", 10],
  ["Outcomes and measurement", 10],
  ["Budget and value for money", 8],
  ["Sustainability", 5],
  ["Risk, governance, and compliance", 5],
  ["Proposal integrity and clarity", 2],
] as const;

const sentenceSplit = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24);

const containsAny = (text: string, terms: string[]) =>
  terms.some((term) => text.toLowerCase().includes(term));

function analyze(workspace: Workspace): Result {
  const proposal = workspace.proposal;
  const funder = workspace.funderMaterials;
  const evidence = workspace.evidence;
  const combined = `${proposal} ${evidence}`.toLowerCase();
  const allInputs = `${combined} ${funder.toLowerCase()}`;
  const evidenceRichness =
    (evidence.length > 250 ? 1 : 0) +
    (containsAny(combined, ["evaluation", "audit", "annual report", "baseline"]) ? 1 : 0) +
    (containsAny(allInputs, ["http://", "https://", "source:", "report, 20"]) ? 1 : 0);

  let eligibility: Result["eligibility"] = "Unclear";
  let eligibilityReason =
    "The supplied materials do not establish every material eligibility requirement.";
  const requiresNonprofit = containsAny(funder, ["nonprofit", "non-profit", "501(c)(3)", "charity"]);
  const isNonprofit = containsAny(workspace.organizationType, [
    "nonprofit",
    "non-profit",
    "501(c)(3)",
    "charity",
    "ngo",
  ]);
  const invitationOnly = containsAny(funder, ["invitation only", "by invitation"]);
  const invited = containsAny(proposal, ["invited", "invitation received"]);
  const geographyConflict =
    workspace.geography.length > 2 &&
    containsAny(funder, ["only", "must operate", "operating in"]) &&
    !funder.toLowerCase().includes(workspace.geography.toLowerCase());

  if (invitationOnly && !invited) {
    eligibility = "Likely ineligible";
    eligibilityReason =
      "The opportunity appears invitation-only, and the submitted materials do not confirm an invitation.";
  } else if (requiresNonprofit && !isNonprofit) {
    eligibility = workspace.organizationType ? "Likely ineligible" : "Unclear";
    eligibilityReason = workspace.organizationType
      ? "The funder requires nonprofit status, but the stated organization type does not confirm it."
      : "Nonprofit status appears material and has not been confirmed.";
  } else if (geographyConflict) {
    eligibility = "Likely ineligible";
    eligibilityReason =
      "The stated project geography does not appear in the supplied geographic eligibility language.";
  } else if (funder.length > 180 && workspace.organizationType && workspace.geography) {
    eligibility = requiresNonprofit ? "Likely eligible" : "Eligible";
    eligibilityReason =
      "No disqualifier was found in the supplied criteria. Confirm registration, exclusions, and required attachments before submission.";
  }

  const metric = containsAny(proposal, ["baseline", "indicator", "measure", "survey", "evaluation"]);
  const userGrounding = containsAny(proposal, [
    "interview",
    "co-design",
    "community",
    "consulted",
    "feedback",
    "patient",
  ]);
  const implementation = containsAny(proposal, [
    "work plan",
    "month",
    "coordinator",
    "manager",
    "procurement",
    "training",
  ]);
  const budget = containsAny(combined, ["budget", "$", "cost", "personnel", "indirect"]);
  const sustainability = containsAny(proposal, [
    "after the grant",
    "sustain",
    "revenue",
    "government",
    "contract",
    "absorb",
  ]);
  const partners = containsAny(proposal, ["partner", "clinic", "ministry", "coalition"]);
  const signedPartners = containsAny(combined, [
    "signed letter",
    "memorandum of understanding",
    "mou",
    "agreement executed",
  ]);
  const exactNumbers = (proposal.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g) || []).length;
  const outcomes = containsAny(proposal, [
    "increase",
    "decrease",
    "reduce",
    "improve",
    "outcome",
    "completion",
  ]);
  const citations = containsAny(combined, [
    "http://",
    "https://",
    "source:",
    "according to",
    "evaluation,",
    "report,",
  ]);

  const dimensionInputs: Record<string, { positives: boolean[]; reason: string }> = {
    "Funder fit": {
      positives: [
        funder.length > 180,
        workspace.opportunity.length > 3,
        proposal.toLowerCase().includes(workspace.geography.toLowerCase()),
        !containsAny(funder, ["does not fund stand-alone technology"]) ||
          containsAny(proposal, ["not the primary intervention", "supports the"]),
      ],
      reason:
        funder.length > 180
          ? "The proposal can be compared with supplied eligibility and priority language."
          : "No adequate funder criteria were supplied, so fit cannot be defended.",
    },
    "Problem evidence and user need": {
      positives: [proposal.length > 700, exactNumbers >= 3, userGrounding, citations],
      reason:
        userGrounding && citations
          ? "The need is specific and connected to user or source evidence."
          : "The need case lacks either direct user evidence or traceable external support.",
    },
    "Solution fit and theory of change": {
      positives: [implementation, outcomes, containsAny(proposal, ["because", "therefore", "so that"]), exactNumbers >= 4],
      reason:
        implementation && outcomes
          ? "Activities and intended outcomes are visible, but the causal mechanism still needs testing."
          : "The proposal describes intent without a complete activity-to-outcome chain.",
    },
    "Differentiation and additionality": {
      positives: [
        containsAny(proposal, ["alternative", "existing", "unique", "instead", "additional"]),
        containsAny(proposal, ["pilot", "prior"]),
        containsAny(proposal, ["without this grant", "would not"]),
      ],
      reason: "The case for choosing this applicant over credible alternatives is thin.",
    },
    "Organizational and partner capacity": {
      positives: [
        containsAny(combined, ["prior", "track record", "delivered"]),
        implementation,
        partners,
        signedPartners,
      ],
      reason:
        partners && !signedPartners
          ? "Delivery roles are visible, but material partnerships are not yet documented."
          : "The delivery case is supported by named roles and prior experience.",
    },
    "Implementation feasibility": {
      positives: [
        implementation,
        containsAny(proposal, ["24-month", "timeline", "quarter"]),
        containsAny(proposal, ["risk", "contingency", "dependency"]),
        exactNumbers >= 5,
      ],
      reason:
        implementation
          ? "The operating model is concrete, but dependencies and contingencies need more detail."
          : "The work lacks named owners, sequence, or operating constraints.",
    },
    "Outcomes and measurement": {
      positives: [metric, outcomes, containsAny(proposal, ["baseline"]), containsAny(proposal, ["target", "percent", "%"])],
      reason:
        metric && outcomes
          ? "An outcome and measurement approach are present, but attribution and baseline quality remain uncertain."
          : "Activity measures are doing too much work in place of outcome evidence.",
    },
    "Budget and value for money": {
      positives: [
        budget,
        containsAny(combined, ["personnel", "indirect"]),
        containsAny(combined, ["cost per", "unit cost"]),
        workspace.amount.length > 0,
      ],
      reason:
        budget
          ? "A cost structure is visible, but unit economics and budget-to-work-plan checks are incomplete."
          : "No usable budget evidence was supplied.",
    },
    Sustainability: {
      positives: [
        sustainability,
        containsAny(proposal, ["who pays", "revenue", "contract"]),
        containsAny(proposal, ["commit", "approved", "budgeted"]),
      ],
      reason:
        sustainability
          ? "A post-grant direction is named, but no binding financing commitment is shown."
          : "The proposal does not explain what continues or who pays.",
    },
    "Risk, governance, and compliance": {
      positives: [
        containsAny(combined, ["safeguard", "privacy", "risk", "compliance"]),
        containsAny(combined, ["data protection", "security", "consent"]),
        containsAny(combined, ["audit", "financial control"]),
      ],
      reason: "Material delivery, safeguarding, privacy, and compliance controls are not sufficiently evidenced.",
    },
    "Proposal integrity and clarity": {
      positives: [proposal.length > 500, exactNumbers >= 3, !containsAny(proposal, ["tbd", "to be determined"])],
      reason: "The narrative is readable, but several commitments remain provisional.",
    },
  };

  const dimensions: Dimension[] = DIMENSION_WEIGHTS.map(([name, weight]) => {
    const input = dimensionInputs[name];
    const positiveCount = input.positives.filter(Boolean).length;
    const denominator = input.positives.length;
    const rating = Math.max(1, Math.min(5, Math.round(1 + (positiveCount / denominator) * 4)));
    return {
      name,
      weight,
      rating,
      confidence: evidenceRichness >= 3 ? "High" : evidenceRichness >= 1 ? "Medium" : "Low",
      reason: input.reason,
    };
  });

  const claimCandidates = sentenceSplit(proposal)
    .filter((sentence) =>
      /\b(will|expect|has|have|increase|reduce|improve|percent|%|partner|delivered|reach)\b/i.test(sentence),
    )
    .slice(0, 8);

  const claims: Claim[] = claimCandidates.map((text, index) => {
    const hasNumber = /\d|%/.test(text);
    const isFuture = /\b(will|expect|plan|intend|asked|being requested)\b/i.test(text);
    const supportNearby = sentenceSplit(evidence).some((item) => {
      const keywords = text
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => word.length > 6)
        .slice(0, 4);
      return keywords.some((word) => item.toLowerCase().includes(word));
    });
    const status: Claim["status"] = supportNearby
      ? "Partially supported"
      : isFuture
        ? "Aspirational"
        : "Unsupported";
    return {
      id: `CLM-${String(index + 1).padStart(3, "0")}`,
      text,
      type: hasNumber ? "Quantitative outcome" : partners && /partner|clinic/i.test(text) ? "Partnership" : "Delivery claim",
      importance: index < 2 ? "Load-bearing" : hasNumber ? "High" : "Medium",
      status,
      issue:
        status === "Partially supported"
          ? "Related evidence exists, but it does not fully establish the claim in this context."
          : status === "Aspirational"
            ? "A future commitment is presented without confirmed evidence or an accountable condition."
            : "No supporting source was identified in the supplied evidence.",
      fix:
        hasNumber
          ? "Add the baseline, source, method, comparison, and measurement owner."
          : "Attach a dated source or rewrite the statement as a bounded assumption.",
    };
  });

  const penalties: string[] = [];
  if (claims.some((claim) => claim.importance === "Load-bearing" && claim.status === "Unsupported")) {
    penalties.push("Unsourced load-bearing claim");
  }
  if (partners && !signedPartners) penalties.push("Aspirational partnerships are not documented as secured");
  if (outcomes && !metric) penalties.push("Outcome claims lack a measurement method");
  if (!budget) penalties.push("Proposed scope is not supported by a usable budget");
  if (containsAny(proposal, ["ai", "artificial intelligence"]) && !containsAny(proposal, ["human oversight", "privacy", "bias", "governance"])) {
    penalties.push("Technology claims lack governance controls");
  }

  const rawScore = dimensions.reduce(
    (total, dimension) => total + (dimension.rating / 5) * dimension.weight,
    0,
  );
  const score = Math.max(0, Math.round(rawScore - penalties.length * 3));
  const confidence: Result["confidence"] =
    funder.length > 300 && evidenceRichness >= 2 ? "Medium" : "Low";
  let verdict = "Does not yet deserve funding";
  let recommendation: Result["recommendation"] = "NO-GO";
  if (score >= 82 && confidence !== "Low") {
    verdict = "Deserves serious funding consideration";
    recommendation = "GO";
  } else if (score >= 66) {
    verdict = "Competitive, with fixable weaknesses";
    recommendation = "CONDITIONAL GO";
  } else if (score >= 50) {
    verdict = "Borderline";
    recommendation = "CONDITIONAL GO";
  }
  if (["Likely ineligible", "Ineligible"].includes(eligibility)) {
    verdict = "Do not submit to this funder under current conditions";
    recommendation = "NO-GO";
  }

  const weakDimensions = [...dimensions].sort((a, b) => a.rating - b.rating || b.weight - a.weight);
  const revisions: Revision[] = weakDimensions.slice(0, 5).map((dimension, index) => ({
    priority: index + 1,
    title:
      dimension.name === "Differentiation and additionality"
        ? "Prove why this grant creates additional value"
        : dimension.name === "Risk, governance, and compliance"
          ? "Document the controls that protect delivery and users"
          : `Strengthen ${dimension.name.toLowerCase()}`,
    category:
      dimension.name.includes("Budget")
        ? "Budget"
        : dimension.name.includes("Funder")
          ? "Funder mismatch"
          : dimension.name.includes("Capacity")
            ? "Partnership"
            : dimension.name.includes("Outcomes")
              ? "Monitoring and evaluation"
              : "Missing evidence",
    severity: index === 0 && dimension.rating <= 2 ? "Blocker" : index < 3 ? "High" : "Medium",
    effort: dimension.name.includes("clarity") ? "Low" : dimension.name.includes("Funder") ? "Medium" : "High",
    why: dimension.reason,
  }));

  const questions = [
    "What direct evidence shows that the stated problem affects the intended users in this geography now?",
    "Why should this organization receive the grant instead of an existing provider or lower-cost alternative?",
    "Which result would fail to occur without this grant, and what evidence supports that counterfactual?",
    "Which partner, budget line, or implementation dependency is most likely to break the plan?",
    "What baseline and measurement method would let an independent reviewer test the main outcome claim?",
  ];

  const strongestDimension = [...dimensions].sort((a, b) => b.rating - a.rating || b.weight - a.weight)[0];
  return {
    runAt: new Date().toISOString(),
    eligibility,
    eligibilityReason,
    confidence,
    score,
    verdict,
    recommendation,
    strongestCase: `The strongest case rests on ${strongestDimension.name.toLowerCase()}: ${strongestDimension.reason}`,
    strongestRejection: `The weakest joint is ${weakDimensions[0].name.toLowerCase()}: ${weakDimensions[0].reason}`,
    dimensions,
    claims,
    revisions,
    penalties,
    questions,
  };
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function markdownReport(workspace: Workspace, result: Result) {
  return `# Grant Analyst Decision Memo

## ${workspace.organization || "Applicant"} → ${workspace.funder || "Funder"}

**Opportunity:** ${workspace.opportunity || "Not supplied"}  
**Run:** ${new Date(result.runAt).toLocaleString()}  
**Recommendation:** ${result.recommendation}  
**Verdict:** ${result.verdict}  
**Eligibility:** ${result.eligibility}  
**Confidence:** ${result.confidence}  

> This is a merit and fit assessment, not a prediction of funding.

## Decision

${result.strongestCase}

${result.strongestRejection}

## Eligibility

${result.eligibilityReason}

## Merit scorecard

| Dimension | Rating | Weight | Confidence | Finding |
|---|---:|---:|---|---|
${result.dimensions.map((item) => `| ${item.name} | ${item.rating}/5 | ${item.weight} | ${item.confidence} | ${item.reason} |`).join("\n")}

## Explicit penalties

${result.penalties.length ? result.penalties.map((item) => `- ${item}`).join("\n") : "- None detected in supplied materials"}

## Revision priorities

${result.revisions.map((item) => `${item.priority}. **${item.title}** (${item.severity}, ${item.category})\n   ${item.why}`).join("\n")}

## Five damaging questions

${result.questions.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Claim ledger

${result.claims.map((claim) => `### ${claim.id}: ${claim.status}\n\n${claim.text}\n\n- Importance: ${claim.importance}\n- Issue: ${claim.issue}\n- Required fix: ${claim.fix}`).join("\n\n")}

## Limitations

This evaluation uses only the materials supplied in this workspace. It does not conduct live funder research, verify external facts, read inaccessible files, or know the funder's internal portfolio decisions. Missing evidence is not treated as proof of failure.
`;
}

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<"intake" | "decision" | "scorecard" | "claims" | "stress">("intake");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("grant-analyst-workspace");
      if (saved) setWorkspace(JSON.parse(saved));
    } catch {
      setNotice("A saved local workspace could not be restored.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem("grant-analyst-workspace", JSON.stringify(workspace));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [workspace]);

  const completeness = useMemo(() => {
    const fields = [
      workspace.organization,
      workspace.funder,
      workspace.opportunity,
      workspace.proposal,
      workspace.funderMaterials,
      workspace.evidence,
    ];
    return Math.round((fields.filter((field) => field.trim().length > 0).length / fields.length) * 100);
  }, [workspace]);

  const update = (field: keyof Workspace, value: string) => {
    setWorkspace((current) => ({ ...current, [field]: value }));
    setResult(null);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>, field: "proposal" | "funderMaterials" | "evidence") => {
    const file = event.target.files?.[0];
    if (!file) return;
    const supported = /\.(txt|md|markdown|html|htm|csv|json)$/i.test(file.name);
    if (!supported) {
      setNotice("This prototype reads text, Markdown, HTML, CSV, and JSON. Paste extracted PDF or DOCX text for this version.");
      event.target.value = "";
      return;
    }
    update(field, await file.text());
    setNotice(`${file.name} added to the workspace.`);
    event.target.value = "";
  };

  const runAnalysis = () => {
    if (!workspace.proposal.trim() || !workspace.funder.trim() || !workspace.opportunity.trim()) {
      setNotice("Add a proposal, funder, and opportunity before running the review.");
      return;
    }
    setResult(analyze(workspace));
    setView("decision");
    setNotice("Review complete. Treat low-confidence findings as questions, not conclusions.");
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const tabs = [
    ["intake", "Intake"],
    ["decision", "Decision"],
    ["scorecard", "Scorecard"],
    ["claims", "Claim ledger"],
    ["stress", "Stress test"],
  ] as const;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("intake")} aria-label="Grant Analyst home">
          <span className="brand-mark">GA</span>
          <span>Grant Analyst</span>
        </button>
        <div className="topbar-actions">
          <span className="saved-state"><i /> Saved on this device</span>
          <button className="button button-ghost mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-expanded={mobileNav}>
            Menu
          </button>
          <button className="button button-dark" onClick={runAnalysis}>Run review</button>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
          <div className="sidebar-label">Analysis workspace</div>
          <div className="workspace-name">{workspace.organization || "Untitled applicant"}</div>
          <div className="workspace-funder">{workspace.funder || "No funder selected"}</div>
          <div className="completion">
            <div className="completion-copy"><span>Input coverage</span><strong>{completeness}%</strong></div>
            <div className="completion-track"><span style={{ width: `${completeness}%` }} /></div>
          </div>
          <nav aria-label="Workspace sections">
            {tabs.map(([id, label], index) => (
              <button
                key={id}
                className={view === id ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setView(id);
                  setMobileNav(false);
                }}
                disabled={id !== "intake" && !result}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>{label}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <strong>No fabricated odds</strong>
            This tool evaluates merit, fit, and readiness. It does not predict a grant decision.
          </div>
        </aside>

        <section className="content">
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button>
            </div>
          )}

          {view === "intake" && (
            <>
              <div className="page-heading intake-heading">
                <div>
                  <span className="eyebrow">Evidence before synthesis</span>
                  <h1>Does this proposal<br />deserve to win?</h1>
                  <p>Put the funding case under pressure before a reviewer does.</p>
                </div>
                <button className="button button-outline" onClick={() => {
                  setWorkspace(EXAMPLE_WORKSPACE);
                  setResult(null);
                  setNotice("Example workspace loaded. Run the review to inspect the analysis.");
                }}>Load worked example</button>
              </div>

              <section className="panel">
                <div className="panel-heading">
                  <div><span className="step">01</span><h2>Set the decision context</h2></div>
                  <p>Minimum facts used to test eligibility and fit.</p>
                </div>
                <div className="form-grid three">
                  <label>Applicant organization<input value={workspace.organization} onChange={(e) => update("organization", e.target.value)} placeholder="Organization name" /></label>
                  <label>Funder<input value={workspace.funder} onChange={(e) => update("funder", e.target.value)} placeholder="Foundation or donor" /></label>
                  <label>Funding opportunity<input value={workspace.opportunity} onChange={(e) => update("opportunity", e.target.value)} placeholder="Program or RFP name" /></label>
                  <label>Organization type<input value={workspace.organizationType} onChange={(e) => update("organizationType", e.target.value)} placeholder="Registered nonprofit" /></label>
                  <label>Project geography<input value={workspace.geography} onChange={(e) => update("geography", e.target.value)} placeholder="Country or region" /></label>
                  <label>Requested amount<input type="number" value={workspace.amount} onChange={(e) => update("amount", e.target.value)} placeholder="USD" /></label>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><span className="step">02</span><h2>Add the evidence package</h2></div>
                  <p>Private materials stay in this browser for the prototype.</p>
                </div>
                <div className="document-grid">
                  <DocumentInput
                    title="Proposal narrative"
                    badge="Required"
                    value={workspace.proposal}
                    placeholder="Paste the proposal narrative here..."
                    onChange={(value) => update("proposal", value)}
                    onFile={(event) => handleFile(event, "proposal")}
                  />
                  <DocumentInput
                    title="Funder criteria"
                    badge="Required"
                    value={workspace.funderMaterials}
                    placeholder="Paste eligibility rules, selection criteria, and what-we-fund language..."
                    onChange={(value) => update("funderMaterials", value)}
                    onFile={(event) => handleFile(event, "funderMaterials")}
                  />
                  <DocumentInput
                    title="Supporting evidence"
                    badge="Recommended"
                    value={workspace.evidence}
                    placeholder="Paste budget notes, evaluations, annual report evidence, partner commitments, and source links..."
                    onChange={(value) => update("evidence", value)}
                    onFile={(event) => handleFile(event, "evidence")}
                  />
                </div>
              </section>

              <div className="run-panel">
                <div>
                  <span className="eyebrow">Transparent evaluation</span>
                  <h2>Run the skeptical review</h2>
                  <p>Every rating shows its weight, evidence basis, confidence, and explicit penalties.</p>
                </div>
                <button className="button button-orange" onClick={runAnalysis}>Analyze proposal <span>→</span></button>
              </div>
            </>
          )}

          {result && view === "decision" && <DecisionView result={result} workspace={workspace} setView={setView} />}
          {result && view === "scorecard" && <ScorecardView result={result} />}
          {result && view === "claims" && <ClaimsView claims={result.claims} />}
          {result && view === "stress" && <StressView result={result} />}

          {result && view !== "intake" && (
            <div className="export-bar">
              <div><strong>Export this review</strong><span>Includes limitations and evidence status.</span></div>
              <div>
                <button className="button button-outline" onClick={() => downloadFile("grant-analyst-review.json", JSON.stringify({ workspace, result }, null, 2), "application/json")}>JSON</button>
                <button className="button button-dark" onClick={() => downloadFile("grant-analyst-decision-memo.md", markdownReport(workspace, result), "text/markdown")}>Markdown memo</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DocumentInput({
  title,
  badge,
  value,
  placeholder,
  onChange,
  onFile,
}: {
  title: string;
  badge: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <article className="document-card">
      <div className="document-card-head">
        <div><span className="doc-icon">¶</span><strong>{title}</strong></div>
        <span className={badge === "Required" ? "badge required" : "badge"}>{badge}</span>
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <div className="document-footer">
        <span>{value ? `${value.split(/\s+/).filter(Boolean).length.toLocaleString()} words` : "No material added"}</span>
        <label className="file-button">Add file<input type="file" accept=".txt,.md,.markdown,.html,.htm,.csv,.json" onChange={onFile} /></label>
      </div>
    </article>
  );
}

function DecisionView({ result, workspace, setView }: { result: Result; workspace: Workspace; setView: (view: "scorecard" | "claims" | "stress") => void }) {
  return (
    <>
      <div className="page-heading result-heading">
        <div>
          <span className="eyebrow">Executive decision memo</span>
          <h1>{result.verdict}</h1>
          <p>{workspace.organization} → {workspace.funder}</p>
        </div>
        <div className={`recommendation ${result.recommendation === "NO-GO" ? "no-go" : ""}`}>
          <span>Recommendation</span><strong>{result.recommendation}</strong>
        </div>
      </div>

      <div className="guardrail">This is a merit and fit assessment, not a prediction of funding.</div>

      <div className="metric-grid">
        <Metric label="Eligibility" value={result.eligibility} detail={result.eligibilityReason} />
        <Metric label="Evidence-adjusted score" value={`${result.score} / 100`} detail="A diagnostic score, not a win probability." />
        <Metric label="Overall confidence" value={result.confidence} detail="Limited by source completeness and no live research." />
      </div>

      <div className="decision-grid">
        <article className="finding-card positive">
          <span className="finding-label">Strongest reason to fund</span>
          <h2>The case that survives</h2>
          <p>{result.strongestCase}</p>
        </article>
        <article className="finding-card negative">
          <span className="finding-label">Strongest reason to reject</span>
          <h2>The weakest joint</h2>
          <p>{result.strongestRejection}</p>
        </article>
      </div>

      <section className="panel revisions-panel">
        <div className="panel-heading">
          <div><span className="step">!</span><h2>Ranked revision plan</h2></div>
          <p>Ordered by likely effect on the funding decision.</p>
        </div>
        <div className="revision-list">
          {result.revisions.map((item) => (
            <article key={item.priority}>
              <span className="revision-number">{String(item.priority).padStart(2, "0")}</span>
              <div><h3>{item.title}</h3><p>{item.why}</p></div>
              <div className="revision-meta"><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span><span>{item.category}</span><span>{item.effort} effort</span></div>
            </article>
          ))}
        </div>
      </section>

      <div className="jump-grid">
        <button onClick={() => setView("scorecard")}><span>01</span><strong>Inspect the scorecard</strong><small>See weights, ratings, confidence, and penalties.</small></button>
        <button onClick={() => setView("claims")}><span>02</span><strong>Audit the claims</strong><small>Find unsupported and aspirational statements.</small></button>
        <button onClick={() => setView("stress")}><span>03</span><strong>Read the rejection case</strong><small>Face the five questions most likely to damage the bid.</small></button>
      </div>
    </>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function ScorecardView({ result }: { result: Result }) {
  return (
    <>
      <div className="page-heading compact">
        <div><span className="eyebrow">No hidden scoring logic</span><h1>Merit scorecard</h1><p>Default weights from the Grant Analyst framework.</p></div>
      </div>
      <section className="panel scorecard">
        <div className="score-header"><span>Dimension</span><span>Rating</span><span>Weight</span><span>Confidence</span></div>
        {result.dimensions.map((dimension) => (
          <article key={dimension.name} className="score-row">
            <div><strong>{dimension.name}</strong><p>{dimension.reason}</p></div>
            <div className="rating"><strong>{dimension.rating}</strong><span>/5</span></div>
            <div><strong>{dimension.weight}</strong><span> points</span></div>
            <div><span className={`confidence ${dimension.confidence.toLowerCase()}`}>{dimension.confidence}</span></div>
          </article>
        ))}
      </section>
      <section className="panel penalties">
        <div className="panel-heading"><div><span className="step">−</span><h2>Explicit penalties</h2></div><p>Each penalty subtracts three diagnostic points.</p></div>
        {result.penalties.length ? result.penalties.map((penalty) => <div className="penalty" key={penalty}><span>−3</span>{penalty}</div>) : <div className="empty-state">No mandatory penalty was detected in the supplied text.</div>}
      </section>
    </>
  );
}

function ClaimsView({ claims }: { claims: Claim[] }) {
  return (
    <>
      <div className="page-heading compact">
        <div><span className="eyebrow">Claim and evidence ledger</span><h1>Show me the proof</h1><p>Material claims extracted from the proposal. Status reflects only supplied evidence.</p></div>
      </div>
      <section className="claims-list">
        {claims.length ? claims.map((claim) => (
          <article key={claim.id} className="claim-card">
            <div className="claim-top"><span className="claim-id">{claim.id}</span><span className={`claim-status ${claim.status.toLowerCase().replace(" ", "-")}`}>{claim.status}</span></div>
            <blockquote>{claim.text}</blockquote>
            <div className="claim-grid">
              <div><span>Importance</span><strong>{claim.importance}</strong></div>
              <div><span>Claim type</span><strong>{claim.type}</strong></div>
            </div>
            <div className="claim-analysis"><div><span>Issue</span><p>{claim.issue}</p></div><div><span>Required fix</span><p>{claim.fix}</p></div></div>
          </article>
        )) : <div className="empty-state">No material claims were detected. Add a fuller proposal narrative and rerun the review.</div>}
      </section>
    </>
  );
}

function StressView({ result }: { result: Result }) {
  return (
    <>
      <div className="page-heading compact">
        <div><span className="eyebrow">Adversarial review</span><h1>The rejection case</h1><p>A skeptical reviewer should not be easy to satisfy.</p></div>
      </div>
      <article className="rejection-memo">
        <span className="eyebrow">Draft rejection memo</span>
        <h2>Recommendation: do not approve without resolving the leading evidence gaps.</h2>
        <p>{result.strongestRejection}</p>
        <p>The current record leaves material uncertainty about additionality, execution risk, and whether the proposed outcomes can be independently tested. Evidence that directly resolves those points could change this assessment.</p>
      </article>
      <section className="panel question-panel">
        <div className="panel-heading"><div><span className="step">05</span><h2>Five damaging questions</h2></div><p>Ranked by potential to change a funding decision.</p></div>
        <ol className="question-list">
          {result.questions.map((question, index) => <li key={question}><span>{String(index + 1).padStart(2, "0")}</span><p>{question}</p></li>)}
        </ol>
      </section>
      <div className="reviewer-grid">
        {[
          ["Program officer", "Fit and differentiation", result.dimensions[0].rating],
          ["Evidence reviewer", "Causal logic and measurement", result.dimensions[6].rating],
          ["Finance reviewer", "Budget and sustainability", result.dimensions[7].rating],
          ["Implementation reviewer", "Capacity and delivery risk", result.dimensions[5].rating],
        ].map(([name, focus, rating]) => (
          <article key={String(name)}><span className="reviewer-icon">{String(name).charAt(0)}</span><h3>{name}</h3><p>{focus}</p><strong>{rating}/5</strong></article>
        ))}
      </div>
    </>
  );
}
