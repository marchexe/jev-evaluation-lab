# Reproducible retrieval evaluation

**Historical source required:** use commit `d7b4123` for the commands below.
The current graph ranking has different implementation hashes. Follow the
[separate-worktree instructions](../../../docs/experiments.md) first; do not
regenerate or weaken the original manifest.

The original frozen inputs below are unchanged. A separate, explicitly non-blinded
AI-label transcription is retained in `exploratory-ai-judgments.json` solely to
reproduce the preliminary audit with `npm.cmd run audit:retrieval`. It is not a
human reference and is never passed through the human-confirmation gate. The
[experiment guide](../../../docs/experiments.md) separates those sensitivity
calculations from official measured retrieval and live Jev classification studies.

This evaluates the existing Text Search and Graph Search offline, separately from
Jev evidence classification. It adds no product UI, model calls, automatic relevance
labels, corpus documents, or new search algorithm. Node.js 24.x and the repository's
existing dependencies are required.

## Frozen inputs and current status

- `queries.json`: 18 synthetic control-scoped query configurations. They vary
  system, selected control, lexical wording, and current/all-revision scope.
- `rules.json`: relevance instructions, Precision@5/Recall@5 conventions,
  incomplete-reference handling, no-answer behavior, ranking and ablation rules.
- `frozen-inputs/manifest.json`: complete corpus snapshots, exact passages and
  eligible pool IDs, controls, graph configuration, effective lexical terms,
  query budgets, rules and implementation hashes.
- `frozen-inputs/relevance-labels.json`: **159 blank, unconfirmed human judgments**
  across all eligible query/passage pairs. No relevance label is prefilled.

The original six evidence-classification cases and recorded SDK responses are
unchanged. These 18 retrieval cases are related wording/configuration variants,
not 18 independent real-world population samples. `queryText` explains the review
intent; exact `lexicalTerms` configure the existing retrievers equally through
their existing control input. There is no new natural-language query parser.

The initial diagnostic report is generated at
`results/retrieval-evaluation/initial-unreviewed/`. It contains `report.md`,
`results.json`, copied frozen inputs, `checksums.json`, and 18 `cases/*.md` analyses.
It is intentionally **awaiting human confirmation**, with all relevance metrics
unavailable. Result differences do not establish errors or superiority.

## Independent human review

Give the reviewer only the blank relevance packet and its source/query context,
before they read reports, graph paths, rankings, Jev outputs, or illustrative
labels elsewhere in the repository. The packet has every eligible paragraph in
stable passage-ID order, not result-rank order. Current-revision pools exclude
archived paragraphs; all-revision pools preserve each revision separately.
Broken-link targets that do not exist are not fabricated as eligible passages.

1. Copy the template to an ignored location. Do not edit the published blank pack:

   ```powershell
   New-Item -ItemType Directory -Force results/retrieval-evaluation/review | Out-Null
   if (Test-Path -LiteralPath results/retrieval-evaluation/review/human-labels.json) { throw 'Human labels already exist; choose a new filename.' }
   Copy-Item examples/evidence/retrieval-eval/frozen-inputs/relevance-labels.json results/retrieval-evaluation/review/human-labels.json
   ```

2. In `human-labels.json`, review **all 159 query/passage pairs**. For each row,
   change only `label`, `confirmed`, and `comment`:

   ```json
   { "label": "relevant", "confirmed": true, "comment": "Reviewer rationale." }
   ```

   This fragment illustrates editable fields, not a suggested label for any case.
   Allowed labels are `relevant`, `not_relevant`, and `uncertain`; `null` is pending.
   Read the exact query/control statement and passage before deciding. Contradictory
   or vague approval documentation may be relevant retrieval evidence, even if
   it does not support the control. Retrieval relevance is not a supports/contradicts
   classification. A broken reference is not proof of the missing target's contents.
   Confirm each pair explicitly; the runner does not copy labels between variants.

3. Keep IDs, source text, offsets, revisions, contexts, instructions and hashes
   unchanged. Set top-level `confirmation.reviewerAlias` to a reviewer alias,
   `confirmedAt` to the actual review's ISO timestamp, and `independentReview` to
   `true` only if that statement is accurate. An agent must not impersonate the
   reviewer or fill labels from rankings to satisfy this gate.
4. Every row must have a non-null label and `confirmed: true` before freezing.
   Confirmed `uncertain` labels are preserved but make their whole query ineligible
   for precision/recall. Adjudicate them independently if complete metrics are
   needed; never force an uncertain passage to irrelevant.

Existing browser reviews are not automatically imported: they do not attest to
query-specific independent review and may have been written after model exposure.
Hashes establish consistency, not proof of who reviewed or what they saw.

## Freeze the human reference and produce measured results

From the repository root, after human review:

```powershell
npm.cmd run eval:retrieval -- freeze --manifest examples/evidence/retrieval-eval/frozen-inputs/manifest.json --labels results/retrieval-evaluation/review/human-labels.json --out results/retrieval-evaluation/review/frozen-reference.json
npm.cmd run eval:retrieval -- run --manifest examples/evidence/retrieval-eval/frozen-inputs/manifest.json --reference results/retrieval-evaluation/review/frozen-reference.json --out results/retrieval-evaluation/measured
```

Outputs never overwrite existing files/directories. Choose a new output name for
each report or revised human reference. Keep the initial and adjudicated artifacts
separately. Reviewer comments/reference files belong in ignored `results/`, not Git.
No command loads `.env`, creates an SDK client, or makes model calls. The npm script
also disables fetch through the existing offline guard.

To reproduce the current **unmeasured** observations without any human labels:

```powershell
npm.cmd run eval:retrieval -- run --manifest examples/evidence/retrieval-eval/frozen-inputs/manifest.json --labels examples/evidence/retrieval-eval/frozen-inputs/relevance-labels.json --out results/retrieval-evaluation/reproduced-unreviewed
```

Running with `--labels` always withholds relevance metrics, even if a draft packet
looks filled in. Only a validated `--reference` enables them. The measured output
copies the frozen reference alongside its manifest and results. Another developer
can rerun with those two files and a fresh output directory.

To prepare a **new** independent input pack from the current source definitions:

```powershell
npm.cmd run eval:retrieval -- prepare --out results/retrieval-evaluation/new-review-pack
```

Do not silently regenerate an already-confirmed experiment after changing its
corpus, query terms, relationships, rules, or code. Preserve the exact repository
source snapshot with experiment artifacts; hashes alone cannot reconstruct code.

## Metric and failure-analysis rules

The label pool is computed from system/revision eligibility before retrieval;
it is not the union of returned candidates. Both strategies use the same frozen
corpus, query terms, control and revision scope. Original ranking is unchanged.

- For a fully binary-reviewed query with at least one relevant passage:
  **Recall@5 = relevant returned in the first five / all relevant eligible passages**;
  **Precision@5 = relevant returned in the first five / 5**. Missing slots count
  zero. Small two-passage pools therefore cannot produce precision above 2/5.
- Queries with zero relevant passages have **null** precision and recall and a
  separate empty-return correctness check and false-positive passage lists.
  Zero relevant is established only by a complete human reference, not by search
  returning nothing. Before confirmation, observed empty lists have unknown
  correctness.
- A null, uncertain or unconfirmed eligible judgment blocks query-level relevance
  metrics. Known reviewed IDs and unjudged IDs remain visible; unknown is never
  counted as irrelevant. No draft/provisional label contributes to metrics.
- Paired macro and micro summaries use identical positive-reference query IDs.
  JSON includes query IDs, numerators and denominators. No-answer and incomplete
  samples are separate. Exhausted search limits remain explicit; metrics measure
  the actual bounded output, not an imaginary exhaustive search.
- Per-case files show exact query/control/settings, text and graph lists, full
  and top-five misses/irrelevant results when confirmed, exact source snippets,
  graph edge paths/provenance, diagnostics, and node/edge execution counts. Text
  Search reports eligible passages scanned; node/edge counts are inapplicable.
- A counterfactual removes curated manifest relationships while retaining source
  links and current-revision selections. It reports which candidates disappear
  under the same bounds, and which returned paths use curated edges. These
  relationships are synthetic experimental inputs, not verified findings.

The depth-4/depth-5 ablation uses `retrieval-001`. The queue paragraph
`dispatch-signoff@1:34-107` is absent at depth 4 and **rank 7 at depth 5**. It is
outside the top five in both. This demonstrates full-list reachability, not a
Recall@5 improvement. The initial report also shows different lists on 12/18
configurations; relevance and error conclusions remain pending human review.

## Integrity and verification

Manifest component hashes cover corpus/control snapshots, relation configuration,
queries and complete eligible IDs, rules, and software. JSON hashing recursively
sorts object keys, preserves array order and hashes canonical UTF-8 with SHA-256.
Implementation hashes normalize CRLF/CR to LF before SHA-256. The CLI verifies
the exact evaluator/search sources and package lock before execution. A mismatch
fails closed; restore the recorded source snapshot for reproduction instead of
relabeling an old reference for changed code. `checksums.json` adds result and
artifact checksums. Repeated runs on identical inputs produce identical reports.

Tests use categorical arithmetic examples and explicitly simulated reviewer
metadata only inside test processes; they are not actual human references and
are never written into the experiment's published label packet or reported as
measured ground truth.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:browser
git diff --check
```
