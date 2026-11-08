# Jev Evaluation Lab

**Live demo:** https://jev-evaluation-lab-lovat.vercel.app/

An independent research workspace for TypeSafe Jev assessments, evidence search,
and evaluation. It helps inspect what AI-system documentation says, compare model
outputs, and record human reviews. It makes no legal compliance or high-risk decisions
and is not an official TypeSafe product.

## What I want to explore

Can a model reliably make structured decisions about descriptions of AI systems?
I am particularly interested in missing, ambiguous, and contradictory information:
does a description actually rule something out, or does it simply leave it unsaid?

How much do predictions and probabilities change when the same description is
rephrased? Can human review reveal recurring mistakes and help turn individual
observations into cases we can evaluate systematically?

More broadly, how useful are explicit probabilities and typed outputs for building
more reliable AI workflows? These are open questions, not established results.
The governance assessment is a starting point for exploring evaluation methods
that could eventually apply to other structured AI tasks.

## What works

- **Assess:** classify a system description with five governance questions using
  native Choice, Noul and Score. Choose from 15 synthetic examples or enter text.
  Inspect full probabilities, the actual model, token usage and latency.
- **Compare:** compare two saved assessments offline, including every available
  probability, missing values, question-definition changes and performance metadata.
- **Evaluate:** record field reviews and expected Choice/Score labels; inspect
  descriptive agreement/error with explicit denominators and model/question filters.
  Noul review remains qualitative. Overall feedback is preserved separately.
- **History:** browser-local saved assessments, feedback, validated JSON import and
  export. Import rejects conflicts and preserves original numeric precision.
- **Evidence:** inspect synthetic Human Oversight documents with deterministic
  Text Search or bounded Graph Search. See exact passages, immutable revisions,
  source references and traversal paths; record separate relevance/evidence reviews.
  An explicit action can ask Jev about one of six fixed passages.
- **Question experiments:** edit instructions, Choice criteria, Noul criteria and
  four-level Score rubrics. Apply/reset explicitly, import/export versioned JSON,
  and preserve the exact executed wording with saved runs. Browsing or editing
  never starts inference.

There is one Next.js application, using React and assistant-ui. The TypeSafe SDK
runs on the server. No graph database, LLM, embeddings, chat agent or Graph RAG
layer is involved. Data and reviews stay in browser storage until exported.

## Run locally

Use **Node.js 24.x** and the committed lockfile. In PowerShell:

```powershell
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

Open **http://127.0.0.1:3000** (localhost also works). On other systems use `npm`
in place of `npm.cmd`. Offline browsing, comparisons, reviews, recorded experiments
and exports require no API key. Live web inference is disabled by default.

For intentional paid inference, set the ignored `.env` or server environment:

```dotenv
TYPESAFE_API_KEY=your-server-key
TYPESAFE_DEFAULT_MODEL=jev-latest
JEV_LIVE_INFERENCE_ENABLED=true
```

Restart after changing settings. **Analyze with Jev** and **Judge selected passage
with Jev** each make one request; retries are disabled. Cancellation may still incur
usage. Never expose the key through `NEXT_PUBLIC_*`. Protect hosted access and set
provider budgets before enabling inference. CLI `--live` is a separate explicit opt-in.

## Why Graph Search?

The Dispatch queue procedure says a staff member must countersign each proposal
before it leaves the queue. The Human Oversight keyword list does not match that
paragraph. Graph Search follows a quoted control alias and a pinned cross-document
reference to retrieve the exact source through five hops.

That demonstrates candidate discovery, not proven relevance or compliance. The
source ranks seventh with the original ranking. The workspace's experimental
document-diversity ranking moves it to fifth, while moving another register
paragraph to sixth. [Ranking rules and limitations](docs/graph-ranking.md) explain
the tradeoff. This is not a human-validated relevance gain. Graph also misses an
unlinked approval policy under many query configurations and retains lexical
false matches. See the [graph model and source-path example](examples/evidence/GRAPH_SEARCH.md).

## Experiments and current evidence

The [frozen retrieval experiment](examples/evidence/retrieval-eval/README.md) contains
18 related configurations and 159 blank relevance judgments. The separate AI-assisted
analysis is explicitly provisional; no independent human reference exists.

A [recorded live Jev study](examples/evidence/jev-study/README.md) compares two fixed
question configurations on 17 development and 12 held-out synthetic passages. All
58 raw responses are available for offline replay. The alternative improves some
classification boundaries but still promotes a known editorial distractor in its
relevance Noul. **Production retrieval remains deterministic**; no model filter or
reranker was adopted. These results use AI design expectations, not human validation.

```powershell
# Preview the original CLI without inference:
npm.cmd run classify -- --profile governance --case hr-recruitment-reviewed
# Preview an evidence request:
npm.cmd run lab -- evidence --case approval-gate
# Reproduce the explicitly provisional retrieval audit offline:
npm.cmd run audit:retrieval
# Preview the separately versioned live-study protocol:
npm.cmd run experiment:evidence -- preview
```

The original technical CLI remains the default `npm.cmd run classify` profile.
[Experiment instructions](docs/experiments.md) explain frozen replay, independent
review and intentional paid repetitions. Builds and tests never automatically bill Jev.

## Documentation

- [Architecture and data flow](docs/architecture.md)
- [Jev integration and editable configurations](docs/jev-integration.md)
- [Graph Search, provenance and a verifiable example](examples/evidence/GRAPH_SEARCH.md)
- [Experimental methodology and reproducibility](docs/experiments.md)
- [API/CLI and validated JSON interchange](docs/api-cli.md)
- [Limitations and future research](docs/limitations.md)
- [Publication, security and manual Vercel deployment](docs/publication.md)
- [Research preparation findings and verification](docs/research-review.md)

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
# Install Chromium once if necessary: npx.cmd playwright install chromium
npm.cmd run test:browser
```

Offline tests disable fetch; production browser tests block provider transport and
replay labeled real recordings. Arithmetic examples are not invented model responses.
Browser storage is origin-specific, bounded and not a backup. Export before clearing
or moving domains. Reviews and descriptions can be sensitive; keep personal data out
of public exports. Hosting authentication remains outside the application.

Project metadata is `UNLICENSED` and `private: true`; no open-source license is granted.
Third-party license notices and existing authorship remain intact. Integration and
architectural references identify dependencies and inspirations, not endorsements.
