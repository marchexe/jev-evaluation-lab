# Jev Evaluation Lab

An independent research workspace for TypeSafe Jev. Analyze AI-system descriptions,
find evidence in synthetic documents, and compare results with human reviews.
This project makes no legal compliance decisions and is not an official TypeSafe product.

## Workflows

- **Analyze:** enter a description or choose one of 15 examples. Review five
  governance questions using Choice, Noul and Score. Edit questions, inspect
  probabilities, and compare saved assessments.
- **Evidence:** read exact source passages about Human Oversight. Compare
  deterministic Text Search with bounded Graph Search, inspect source paths,
  and record separate relevance and evidence judgments. Asking Jev requires
  an explicit action.
- **Documents:** browse the complete synthetic corpus, including older versions
  and sources that search did not retrieve. Follow pinned references back to Evidence.
- **Evaluate:** compare predictions with reviewer labels. Inspect agreement,
  errors and sample sizes. Keep retrieval evaluation separate from classification.

History, reviews and runs are stored in this browser. JSON import/export supports
offline exchange and backup. The desktop interface has English/German display
languages and light/dark themes. Display translations do not change source text,
request configurations or recorded responses. Unknown imported text stays as supplied.

## Start locally

Use **Node.js 24.x** and the committed lockfile. In PowerShell:

```powershell
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

Open the URL printed by Next.js, normally **http://127.0.0.1:3000**. On other
systems, use `npm` instead of `npm.cmd`.

No key is needed to browse documents, search, review, import recorded runs or
export data. Live inference is disabled by default. Start with the
[offline evidence walkthrough](docs/evidence-demo.md).

For intentional paid inference, set `TYPESAFE_API_KEY` only in the ignored
`.env` or server environment. Enable `JEV_LIVE_INFERENCE_ENABLED=true` for
the web UI, then restart. CLI inference separately requires `--live`.
Requests have no automatic retries. Never use `NEXT_PUBLIC_*` for credentials.
Protect hosted access and set provider budgets before enabling requests.
See [security and manual deployment](docs/publication.md).

## Offline commands

```powershell
# Preview requests without inference:
npm.cmd run classify -- --profile governance --case hr-recruitment-reviewed
npm.cmd run lab -- evidence --case approval-gate
npm.cmd run experiment:evidence -- preview

# Verify the application; tests block model transport:
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
# Install the browser once if needed: npx.cmd playwright install chromium
npm.cmd run test:browser
```

The original technical-function CLI remains the default `classify` profile.
See [CLI and JSON formats](docs/api-cli.md) for validated imports, exports and
configuration experiments.

## Repository structure

| Directory | Contents |
| --- | --- |
| `app/`, `components/` | Next.js routes and React workspace, using assistant-ui |
| `src/server/` | Server-only SDK calls, validation and inference protection |
| `src/ui/` | Shared assessment, evidence, graph and persistence logic |
| `scripts/` | CLI previews, offline evaluation and explicit live experiments |
| `examples/` | Synthetic datasets, frozen protocols and recorded research |
| `test/`, `test-support/`, `e2e/` | Offline tests, real response fixtures and browser checks |
| `docs/` | Architecture, methodology, limits and deployment instructions |
| `results/` | Ignored local exports, reports and review files |

## Research status and limits

Graph Search follows explicit relationships with bounded traversal and exact
provenance. It can discover a cross-document queue-approval passage that Text
Search misses. Its links are curated; this does not establish general superiority.
There is no graph database, LLM reranker or entity-alignment model.

The frozen retrieval experiment has 18 related configurations and 159 unconfirmed
relevance judgments. Separate AI-assisted labels are exploratory, not human ground
truth. The recorded Jev study contains 58 actual responses; two additional
recordings test integration. These synthetic cases do not establish validated
accuracy, calibration or legal compliance.

Old frozen retrieval runs require the matching historical source snapshot. The
current search implementation deliberately differs, and its hash check rejects
replaying that old manifest. Use the pinned checkout instructions in
[experiments](docs/experiments.md); do not update frozen hashes to bypass the check.
The new [pilot review packet](examples/evidence/pilot-review/README.md) has 24 blank
judgments for an independent reviewer, with no measured results yet.

Source documents are bundled and read-only. Browser storage is local to an origin
and is not a shared database or backup. Export before clearing it. Keep personal
data and reviewer comments out of public exports. The interface targets desktop
screens, with a minimum workspace width of 1120px.

## Further reading

- [Architecture](docs/architecture.md) and [Jev integration](docs/jev-integration.md)
- [Graph model and verifiable paths](examples/evidence/GRAPH_SEARCH.md)
- [Experimental ranking and tradeoffs](docs/graph-ranking.md)
- [Experiment reproduction](docs/experiments.md) and [limitations](docs/limitations.md)

## License

Project metadata is `UNLICENSED` and `private: true`. No open-source license is
granted; `private` prevents npm publication, not GitHub visibility. Third-party
licenses and attribution remain intact.
