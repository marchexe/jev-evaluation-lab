# First six-case evidence experiment

The workspace now supports editable question configurations. For this original
procedure, reset evidence questions to `oversight-evidence-1` before execution and
select that exact configuration in evaluation. Edited configurations are separate
experiments; their runs remain exportable but are not pooled with the original.
The separately recorded live research study is documented in
[jev-study/README.md](jev-study/README.md).

This is a passage-classification exercise using synthetic documents, not a legal
compliance assessment or a validated benchmark. The manifest is
[`experiment.json`](experiment.json); source text is in
[`documents.json`](documents.json). Reference labels are entered by a reviewer,
not loaded from case names or copied from Jev.

Keep experiment `oversight-evidence-cases-1`, dataset `synthetic-oversight-1`,
document revisions `1`, control `human-oversight`, and question configuration
`oversight-evidence-1` unchanged for this experiment. The control statement is:

> A human must approve every recommendation before the system executes it.

## Review scope and proposed expectations

Label the exact paragraph shown in **Passage to judge**, relative to this control.
Jev receives that paragraph and its source references, not adjacent paragraphs or
other documents. Do not use the conflicting runbook to change the policy
paragraph's label. These are separate passage judgments, not a combined system
verdict. Use **Full source documents** to check provenance, but record ambiguity
if a conclusion requires context that is absent from the selected paragraph.

The table is a proposed annotation guide, not verified ground truth or model
output. An independent reviewer should read the criteria and passages before
consulting these expectations and record reasons for any different judgment.

| Case ID | Documented system / document / section | Proposed judgment | Retrieval relevance | Term matcher |
| --- | --- | --- | --- | --- |
| `approval-gate` | dispatch / Dispatch assistant policy / Recommendation approval | supported: every recommendation requires human approval before execution | relevant | retrieved |
| `automatic-execution` | dispatch / Dispatch assistant runbook / Execution | contradicted: automatic execution explicitly excludes approval and override | relevant | retrieved |
| `vague-control` | tutor / Study tutor overview / Responsibility | ambiguous: generic human control does not specify the approval arrangement | relevant | retrieved |
| `missing-oversight` | ledger / Ledger summarizer overview / Purpose | insufficient evidence: describes summarization, says nothing about oversight | not relevant | missed |
| `editorial-distractor` | dispatch / Dispatch release notes procedure / Editorial checks | insufficient evidence: spelling review is a different process; it does not establish absence of recommendation approval | not relevant | retrieved |
| `retrieval-miss` | dispatch / Dispatch queue procedure / Final gate | ambiguous under a strict passage-only reading: countersigning each proposal is a gate, but queue release is not explicitly execution | relevant | missed |

The last case is deliberately useful for retrieval but underspecified for this
exact control. “A staff member must countersign each proposal before it leaves the
queue” does not itself establish that every executable recommendation passes this
queue. Do not assume `supported` from the case name. If a reviewer interprets the
gate as sufficient, document that assumption before inference; if the reviewer
cannot choose a reference category, use **uncertain** and exclude the case from
quantitative agreement. Do not rewrite the source mid-experiment to obtain a
preferred result.

**Ambiguous** is a definite category about the passage; reviewer **uncertain** is
an abstention. Retrieval relevance asks whether the paragraph addresses the
relevant approval/control arrangement, regardless of whether it supports it.
Do not set relevance from keyword matches, Jev's Choice, or its Noul value.
The Noul has no numeric human target or threshold in this experiment.

## Manual UI procedure

1. Preserve previous work. If this browser already contains runs/reviews, export
   them and use a fresh browser profile for the new baseline. Do not clear the
   existing profile. Use a reviewer who has not seen the model outputs; opening a
   clean profile cannot undo exposure to a prediction. The current UI is not a
   blinded-review system: saved results and statistics remain visible.
2. Start the app with `JEV_LIVE_INFERENCE_ENABLED=false` in the server environment
   (`$env:JEV_LIVE_INFERENCE_ENABLED='false'` followed by `npm.cmd run dev` in
   PowerShell). Open `http://127.0.0.1:3000`. Keep this exact origin and browser
   profile throughout; localhost and 127.0.0.1 have separate browser storage.
3. Open **Evidence**, choose **Human Oversight**, and check **Inspect all source
   passages, including retrieval misses**. Keep that checkbox checked while
   changing systems. The default retrieved-only view omits two fixed cases.
4. Select **dispatch** in **Documented system**. For the four dispatch entries in
   the table, find the exact document/section card, expand **Review passage: not
   reviewed**, choose **Evidence judgment** and **Retrieval relevance**, add a
   short rationale in **Reviewer comment**, then click **Save evidence review**.
   Review only the listed sections, not Inputs, Scope, or Publication paragraphs.
5. Select **tutor** and review Responsibility; select **ledger** and review Purpose
   in the same way. There should now be six saved passage/control reviews. Check
   **Evaluate** and export **Export complete experiment**. Rename the downloaded
   file to `human-reference-before-inference.json` and keep it unchanged. It should
   contain six `humanReviewsAtExport`, zero runs, and zero classification samples.
   With the table's relevance annotations, retrieval reports **3 / 4 relevant
   passages retrieved; 1 missed**. The editorial match is a retrieval distractor,
   not a classification error. Extra reviewed paragraphs change this retrieval
   denominator; use the exact six-case pool for this first experiment.
6. When you are ready to spend API usage yourself, stop the server, set
   `JEV_LIVE_INFERENCE_ENABLED=true`, ensure the ignored `.env` or server environment
   contains `TYPESAFE_API_KEY`, and restart. Keep the requested model setting,
   corpus, control, and question wording fixed. Reopen the same origin/profile.
   This guide does not run inference or authorize background calls.
7. Open **Evidence** and recheck **Inspect all source passages**. For each row below,
   choose **Documented system**, choose the exact case ID in **Passage to judge**,
   verify the paragraph, and click **Judge selected passage with Jev** once. Wait
   for the result, check its actual model/request metadata, and export the complete
   experiment as a checkpoint. Do not change human labels after seeing results.

   | System | Case IDs to run, one explicit click each |
   | --- | --- |
   | dispatch | `approval-gate`, `automatic-execution`, `editorial-distractor`, `retrieval-miss` |
   | tutor | `vague-control` |
   | ledger | `missing-oversight` |

8. After six successful requests, open **Evaluate** and choose the single actual
   model ID in **Actual model filter**. Expect six saved runs, zero cases without
   predictions, and agreement denominator **6** only if all six human references
   are categorical. Uncertain/unlabeled references reduce the denominator and are
   counted separately. The matrix rows are human labels; columns are Jev labels.
   Expand **Cases compared** to inspect disagreements and exact citations.
9. Export **Export complete experiment** as the final artifact. Confirm each run
   has its pre-request human snapshot and that the final human labels still match
   the baseline. Disable live inference and restart when finished; saved-data
   views continue to work. Keep both baseline and final exports outside Git.

## Comparison checks and limitations

- Each successful click is one paid request; six cases require six successful
  requests. No automatic batch or retry exists. If a request fails or is cancelled,
  stop and inspect the error; it may already have incurred usage. Do not click
  repeatedly to chase a preferred answer. Failed attempts do not become model
  predictions or saved successful runs.
- `jev-latest` is a requested alias, not a guarantee of one actual model version.
  If actual model IDs differ, export the partial experiment and report separate
  model subsets. A model filter with fewer than six predictions is incomplete;
  do not describe an all-model pooled result as a single-model experiment.
- Metrics compare the latest appended run per case after the model filter with
  **current** human labels. Repeated runs replace which prediction counts, and
  editing labels changes agreement. All raw runs and the human snapshots at
  request/export remain in the export. Preserve separate files rather than
  overwriting the first experiment or tuning references to predictions.
- Retrieval reporting uses manually relevant passages in the reviewed pool;
  classification reporting uses cases with a saved prediction and a categorical
  reference. Missing predictions are not disagreements. An irrelevant retrieved
  passage classified as insufficient evidence can be a correct classification.
- Exports retain the manifest, full corpus, revisions, control IDs/statements,
  exact snippets/offsets/sections, retrieval settings and versions, full question
  configuration/version, requested and actual models, SDK/request metadata,
  numeric probabilities, usage, latency, and separate reviews. Invalid saved
  snapshots or unavailable review storage block a complete export instead of
  silently substituting missing labels. Raw-storage recovery exports remain
  available. Changed sources and inconsistent question metadata are rejected on
  load. Valid edited question configurations load separately and can be selected
  with the exact configuration filter; there is no side-by-side evidence-run
  comparison UI.
- Six hand-selected synthetic cases, one contradiction reference, and provisional
  labels cannot establish general accuracy or calibration. The original fixture
  covers `approval-gate`; additional real recordings belong to the separate
  documented Jev study. None are automatically loaded as user runs.
