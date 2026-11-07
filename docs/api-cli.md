# API, CLI and JSON interchange

## Web API

Both routes use Node.js, `POST`, `application/json`, `Cache-Control: no-store`, a 64,000-byte actual-stream limit, exact origin protection, a live switch and server-only credentials. Custom question configuration is optional and independently validated. There is no batch or background web inference.

```json
{"description":"A synthetic assistant proposes a route for supervisor approval.","live":true}
```

Send to `/api/assess`. Description length is 1–12,000 characters. The profile is always governance. Optional `questionConfiguration` must be a validated governance envelope.

```json
{"caseId":"approval-gate","live":true}
```

Send to `/api/evidence`. Case IDs come from `examples/evidence/experiment.json`; arbitrary passage text cannot be injected into this endpoint. Optional `questionConfiguration` must be an evidence envelope. Added graph-register sources remain human-reviewable; the web Jev action still covers the original six cases.

Unknown fields, malformed configurations and incompatible cases return 400 before inference. Cross-origin requests return 403; wrong media type 415; oversized bodies 413; disabled inference/missing key 503; provider/network failures are sanitized. Cancellation and timeouts are errors, never predictions. Originless JSON clients are supported: origin protection is not authentication. A hosted deployment must protect both API routes as well as the UI.

## Agent-friendly commands

```powershell
# Original technical CLI, preview only:
npm.cmd run classify
# Governance with the exact default configuration, preview only:
npm.cmd run classify -- --profile governance --case hr-recruitment-reviewed
# Edited questions, preview only:
npm.cmd run classify -- --profile governance --case hr-recruitment-reviewed --config examples/questions/governance-research.json
# Evidence, preview only:
npm.cmd run lab -- evidence --case approval-gate --config examples/questions/evidence-research.json
# Validate exports without a browser, key, or inference:
npm.cmd run lab -- validate --kind governance-questions --input examples/questions/governance.json
npm.cmd run lab -- validate --kind evidence-questions --input examples/questions/evidence.json
npm.cmd run lab -- validate --kind history --input results/my-history.json
npm.cmd run lab -- validate --kind evidence --input results/my-evidence-experiment.json
```

For intentional paid CLI execution, append `--live --output results/NEW_FILE.json` to `classify` or `lab evidence`. Evidence CLI rejects an existing output before inference. The original classify CLI retains its existing output behavior; use a new path to avoid replacing earlier work. CLI live opt-in is independent of the web switch. Never run a paid command as part of CI.

## Import/export contracts

- Question configuration: `schemaVersion: 1`, `kind`, `version`, `questions`. Full examples are in `examples/questions/`.
- Single assessment: the original backend envelope, with optional custom configuration metadata outside the SDK response. Export preserves every original number.
- History: `schemaVersion: 2`, `assessments` with IDs, description, timestamp, original assessment, overall feedback and optional field reviews. **History → Import history JSON** validates and merges this wrapper. Single raw assessment files are not history imports; agents can use the exported wrapper.
- Evidence experiment: `schemaVersion: 1`, fixed experiment/corpus identity, raw `runs`, `humanReviewsAtExport`, request-time reviewer snapshots, selected configuration/model filter and descriptive summaries. **Evidence → Import evidence experiment JSON** validates sources, requests, configurations and reviews before merging. Imported derived statistics are ignored and recomputed. The research study's batch-record format is a distinct CLI protocol, not this UI interchange format.
- Research run: protocol hash, case/split identity, exact configuration, request hash, complete SDK envelope. `experiment:evidence report` replays saved runs; the frozen protocol includes corpus passages, revisions, configuration wording and model ID.

Browser imports and `lab validate` are capped at 2 MB. Unknown/changed sources, duplicate imported IDs and conflicting existing records/reviews are rejected. Importing never issues a model request, silently migrates incompatible sources or asserts independent review. Raw-storage recovery exports remain available when stored evidence is invalid. Keep browser exports private unless every description and comment has been reviewed for disclosure.
