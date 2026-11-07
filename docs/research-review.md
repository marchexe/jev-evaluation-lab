# Research preparation review

## Implemented and preserved

The existing Assess, Compare, Evaluate, History, Evidence Explorer, typed graph, provenance, six-case evidence workflow, reviews and technical CLI remain working. Added capabilities are local editing of Choice/Noul/Score questions, explicit apply/reset, portable versioned question JSON, narrow server validation, exact evidence-configuration grouping, assessment model/definition filters, validated history/evidence imports and browser-free agent CLIs.

Default governance wording now has one JSON source, built using the installed SDK. Confirmed unused imports were removed. SDK transport JSDoc was corrected, new CLI provider errors are sanitized, JSON media types are matched exactly, and a paid response is printed for recovery if research persistence fails. No retrieval architecture was replaced and no dependency was added. Valid earlier uncommitted work, reviews, recordings and experiments were preserved.

Human labels remain separate from raw predictions. Configuration grouping includes content, not just version names. Imported statistics are ignored; conflicting IDs/reviews and changed sources are rejected. The original five governance fields and six explicit web passage actions remain. Added graph-register sources remain human-reviewable rather than silently becoming new live cases.

## Reproduced retrieval findings

The original manifest, blank packet and initial results match the supplied audit archive byte-for-byte. Frozen source/dependency hashes, complete output, paths, ranking and bounds reproduce. The compact audit transcription is explicitly non-blinded and AI-authored; all 159 original human judgments remain null/unconfirmed.

| AI-label interpretation | Positive configurations | Text / Graph macro P@5 | Text / Graph macro R@5 |
|---|---:|---:|---:|
| Broad source-finding | 14 | 38.57% / 78.57% | 33.41% / 55.24% |
| Strict direct assertions | 12 | 31.67% / 65.00% | 36.25% / 76.67% |

This is exploratory arithmetic, not independently validated performance. Strict changes semantics and denominators. Without curated relationships Graph recall falls to 35.79% broad / 42.50% strict. The explicit policy is absent from the full Graph list in 9/12 Dispatch configurations; the five-hop queue source ranks seventh; Ledger topic matches remain false nonempty candidates. No default search hits its limits. Curated sources and correlated query variants do not demonstrate general superiority.

## Real Jev findings and usage

The new frozen protocol used 17 development passages, 12 predeclared held-out synthetic passages and two configurations on `jev-1.14.0`: 58 real responses preserving exact requests, distributions, actual models, usage and metadata. Against AI design expectations, classification agreement is development 14/16 → 15/16 and held-out 10/12 → 11/12. One uncertain development expectation is excluded. The alternative fixes queue timing and the conflicting held-out paragraph; both still disagree with the vague-control expectation. These are not independently validated accuracy claims.

The alternative relevance Noul still gives the editorial distractor 0.82 and adds a held-out training-review false positive at 0.57. It has broader source-finding semantics, so this is not a calibration comparison. A production model filter/reranker was not justified and was not implemented. No predictions or curated links became human-confirmed labels.

Two additional real integration checks exercised edited governance questions and the browser/API evidence path, including exact export, reload persistence and offline CLI validation. Total: 60 explicit requests, 45,724 input / 5,220 output tokens, estimated $0.001920408 at the checked published rate. This is not an invoice. The comparative study remains exactly 58 requests; smoke recordings are not additional benchmark samples.

## Verification

- Offline suite: 69 passing tests, including original behavior, real recordings, configuration/security validation, import conflicts, source pinning and CLI previews.
- Typecheck and production build: passing on Node.js 24.
- Production Playwright: 19 passing desktop/mobile tests, with provider transport blocked and real recordings replayed.
- Real browser/API smoke: one explicit action, HTTP 200, no page errors, exact result in export, persistence after reload, and valid agent-readable export.
- Original frozen retrieval/AI audit and the complete recorded study replay: passing offline. Study files have SHA-256 checksums.
- Installed dependency tree: consistent; npm production audit reports zero vulnerabilities. No dependency upgrades or lockfile rewrites were performed during this preparation.
- `git diff --check`: passing. Candidate-file and reachable-Git-object scan found no current-key/token/private-key matches, unintended public artifacts or broken relative Markdown links. This scan cannot prove the absence of every possible credential or confidential fact.

## Publication and next commit

Ready for technical owner review. Existing uncommitted changes remain intentionally present; this work staged, committed, pushed and deployed nothing. Review the coherent source change, including previously untracked Evidence/Graph/retrieval work: `app/`, `components/`, `src/`, `scripts/`, `examples/`, `test/`, `e2e/`, `docs/`, README, package metadata/lockfile, TypeScript configuration and ignore rules. Retain existing TypeSafe skill/license attribution. Exclude ignored `.env`, results, build/browser output, logs and source backups.

Publication integrates the feature work on top of the original independent repository history. Its supported governance profile, neutral environment settings and browser storage keys are retained; unrelated historical project commits are not replayed. Configure hosting protection and provider budgets before live public deployment.

Research limits remain: no independent human reference, no external corpus validation, no model repeatability measurement, unknown graph-curation coverage/cost, and unresolved vague/queue boundaries. These are research limits, not validated product claims. Markdown was retained over Sphinx because this small TypeScript project has no need for a separate Python documentation build.
