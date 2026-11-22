# Experimental methodology and reproduction

Use Node.js 24.x and `npm ci`. Windows commands use `npm.cmd`; on other systems use `npm`. Preview, replay, validation, unit tests and browser tests make no paid requests. Live CLI commands require `--live`; web execution additionally requires the server switch. Commands refuse to overwrite frozen review packs or research runs.

## Three distinct evaluation tasks

1. **Candidate discovery:** whether a source appears anywhere in a returned list.
2. **Top-five retrieval:** source relevance at a fixed inspection budget, using the entire eligible pool as the recall denominator.
3. **Evidence classification:** supported/contradicted/insufficient/ambiguous relative to a control, compared with separately recorded reviewer judgments.

Do not substitute one for another. No task establishes legal compliance.

## Original frozen retrieval experiment

The original retrieval manifest pins source files from commit
`d7b4123`. Current ranking changes intentionally fail those hashes. Run the
original commands below in a separate historical worktree, leaving your current
work untouched:

```powershell
git worktree add --detach ../jev-retrieval-replay d7b4123
Set-Location ../jev-retrieval-replay
npm.cmd ci
```

Do not copy your API key to that worktree. Return to the main project for current
application checks. New retrieval experiments need a new manifest; never replace
the original frozen inputs.

The [protocol and review instructions](../examples/evidence/retrieval-eval/README.md) specify 18 related configurations, 17 distinct passages and 159 eligible query/passage judgments. All original labels remain null/unconfirmed. The original corpus, relationships, software hashes, rules and eligible pools are unchanged.

```powershell
npm.cmd run eval:retrieval -- run --manifest examples/evidence/retrieval-eval/frozen-inputs/manifest.json --labels examples/evidence/retrieval-eval/frozen-inputs/relevance-labels.json --out results/retrieval-replay-new
# Keep npm's banner and Windows PowerShell's UTF-16 redirection out of JSON:
cmd /d /c "npm.cmd run --silent audit:retrieval > results\exploratory-audit-replay.json"
```

Choose a fresh output directory for every replay. The first command reproduces rankings and paths while leaving official relevance metrics unavailable. The second reproduces the separate ZIP audit's provisional arithmetic using a compact categorical transcription, explicitly non-blinded and AI-authored. It never freezes a human reference.

Under those AI labels only, macro Recall@5 is Text 33.41% / Graph 55.24% broad, or Text 36.25% / Graph 76.67% strict. Broad has 14 positive configurations; strict has 12 and changes relevance semantics. They are sensitivity analyses, not validated performance. Removing curated relationships reduces Graph to 35.79% broad / 42.50% strict; only two cases still expand beyond Text. Twelve cases reuse Dispatch, so these are not independent population samples.

Failures reproduce: the explicit policy is absent from the full Graph list in 9/12 Dispatch configurations; the five-hop queue source ranks seventh in case 001 and eighth with archived revisions; the Ledger no-evidence query returns two irrelevant lexical candidates. The depth-4/5 ablation changes queue discoverability but not its top-five membership. No default search exhausts its budgets.

Only a genuinely independent human review of the complete pools can produce the original experiment's reference. Do not rebrand AI labels, case names or exposed reviewers as independent human validation. New corpus, queries, retrieval methods or question wording require separate identified experiments; never silently regenerate the frozen reference.

## Live Jev study

[`oversight-jev-study-1`](../examples/evidence/jev-study/README.md) freezes 17 development passages and 12 newly written held-out synthetic cases, two question configurations and `jev-1.14.0` before inference. Design expectations are AI-authored, not human reference labels. Both configurations use the same exact state. Each gets one request per case, no retries: 58 calls. No edits were made after viewing held-out results.

Replay the recorded run without a key by copying it to a fresh ignored directory, omitting only its already-generated analysis:

```powershell
$dest = 'results/jev-study-replay-new'
New-Item -ItemType Directory -Path $dest -ErrorAction Stop | Out-Null
Get-ChildItem examples/evidence/jev-study/recorded -Filter '*.json' | Where-Object Name -ne 'analysis.json' | Copy-Item -Destination $dest
npm.cmd run experiment:evidence -- report --out $dest
```

This validates protocol/request identities and regenerates the analysis, retaining all original response precision. A new live repetition is intentionally separate and costs money:

```powershell
npm.cmd run experiment:evidence -- preview
npm.cmd run experiment:evidence -- run --live --out results/jev-study-live-new
npm.cmd run experiment:evidence -- report --out results/jev-study-live-new
```

Review the checked-in protocol before authorizing a repetition. It sends synthetic passages and control statements, never design labels. `run` stops on the first failed request or write; there is no automatic retry or cache fill. Partial results remain distinguishable from complete runs. Repeating inference measures another run, not deterministic byte-for-byte replay.

## Selection and limitations

The alternative wording improves held-out classification agreement with AI expectations from 10/12 to 11/12. Both still classify a vague-control sentence as insufficient rather than the expected ambiguous category. The alternative corrects queue timing on development data and an internally conflicting held-out passage. These observations do not validate category boundaries.

The alternative relevance Noul fixes some contextual misses but still assigns the editorial distractor 0.82 and introduces a held-out training-review false positive at 0.57. At the predeclared diagnostic 0.5 threshold, held-out relevance errors are baseline 0/12 versus alternative 1/12. Their Noul meanings differ, so this is task sensitivity, not a calibration comparison. No model-assisted filter/reranker was added to production search. A reranker cannot recover an undiscovered policy, and filtering could hide relevant ambiguous evidence.

For future evaluation, independently review new complete source pools, freeze semantic boundaries before ranking/model exposure, keep corpus-level holdouts and curated-link ablations, and report missing predictions, unknown labels, source coverage, per-case failures and costs. Do not optimize thresholds on these exposed cases.

## Experimental document-diversity ranking

The Evidence workspace now defaults to `document-diversity-1` for the Graph Search
column. Search settings offer the previous `lexical-path-1` order for comparison.
Text Search, graph traversal, source text, paths and execution limits are unchanged.
This is a ranking experiment, not a relevance classifier or a proven quality gain.

## Rule

First produce the original lexical-count/path-length/source-ID order. Group its
hits by exact document ID and revision, preserving group order and order within
each group. Take one hit from each group, then a second hit from each group, and
continue until all candidates are ordered. Apply the result limit afterwards.
Archived and current revisions are distinct groups. No candidates or links are
added, removed or judged relevant by this pass. A misleading source may still rank
high. Multiple useful paragraphs from one document may move down.

For the default Dispatch/Human Oversight query, the queue countersignature source
moves from rank 7 to rank 5. The first five results cover five document revisions
instead of four. Seven candidates remain. The gate-rule paragraph moves from rank
5 to rank 6, so the tradeoff is visible. This does not establish better Recall@5:
the human relevance reference is still unconfirmed.

## Reproducibility and compatibility

`searchEvidenceGraph(graph, query)` keeps the original order by default. Opt in with
`query.ranking = 'document-diversity-1'`. The returned version then becomes
`bounded-evidence-bfs-diversity-1`. Query settings and ranking metadata are exported:
candidate count, document/revision count, original candidate order, and all changed
ranks before the result cap. The old API call has no new ranking metadata.

The original frozen data, questions, recordings and relevance templates are not
updated. Historical source hashes must continue to reject changed implementations.
Replay the historical experiment from its recorded Git revision, and freeze a new
manifest for any comparison of the new ranking. Do not replace historical hashes
or publish metrics from provisional AI labels as human-validated performance.
The existing frozen retrieval CLI has no diversity-ranking arm. A future measured
experiment must add that named arm and include `src/ui/graph-ranking.ts` in its
implementation fingerprint. A workspace JSON export is not itself a frozen benchmark.

## Fair next test

Have an independent reviewer label all eligible passages in separate document
bundles before viewing ranks, graph paths or model outputs. Freeze Text Search,
original Graph Search and diversity Graph Search with identical scope and budgets.
Measure Precision@5/Recall@5, no-answer behavior, source coverage and displaced
relevant passages separately. Include cases needing several paragraphs from one
document as well as cross-document evidence. Do not use the Dispatch example as
the held-out test. The offline tests verify ordering and provenance, not semantic
accuracy. No model calls are needed to run either ranking.
