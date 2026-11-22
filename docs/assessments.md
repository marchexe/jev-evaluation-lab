# Configured regulatory assessments

This is a documentary research demonstrator. It does not issue legal approval,
establish source currentness, or represent a production compliance platform.

## Walkthrough

Start with `npm run dev`, open the printed local URL and select **Assessments /
Prüfungen**. Choose **Claude Code** and **Incomplete pilot / Unvollständiger Pilot**.

1. **Define use / Einsatz klären:** answer the scope questions. A yes/no declaration
   needs a selected company passage or a reviewer rationale under **Evidence and
   rationale / Beleg und Begründung**. Otherwise it remains unknown.
2. **Review evidence / Belege prüfen:** select each check and answer its active
   follow-up questions. Inspect the exact legal quote, PDF page, version, source
   hash and Text/Graph Search provenance. In the incomplete example, the processor
   agreement is explicitly absent and shows a gap.
3. Optionally record an independent human evidence judgment and comment. The separate
   **Judge evidence with Jev** button makes one paid request only when enabled by
   the operator. It never changes facts or checklist outcomes automatically.
4. **Report / Bericht:** inspect findings and actions, then export JSON or Markdown.
   Compare the documented example and the conflicting-declarations example. None
   yields an overall compliance clearance.

The internal-assistant use case reuses four checks and the same UI/engine. Scenario
drafts are retained separately in local browser storage. Reports, reviews and
snapshots need exporting for backup; they are not stored in a shared database.

## Definitions and engine

| Resource | Purpose |
| --- | --- |
| `examples/regulatory/corpus.json` | Sources, editions, original file/page hashes and exact citations |
| `requirements.json` | Fifteen fact questions, seven requirements, rules, eight source mappings and conflict constraints |
| `use-cases.json` | Selected requirement IDs, scope questions, context fields, defaults, labels and limitations |
| `scenarios.json` | Four fixed synthetic scenarios with document revisions and declarations |
| `questions.json` | Native Choice/Noul evidence questions for the protected Jev action |
| `evaluation.json` | Twenty-five engineering rule expectations across the four scenarios |
| `trusted-corpora.json` | Known corpus version/fingerprint anchors for research imports |

`src/assessment/configuration.ts` validates definitions and references before use.
`src/assessment/engine.ts` is independent of product names, law IDs, React and the SDK.
`src/regulatory/knowledge.ts` validates source links and exact text spans.
`src/ui/regulatory.ts` composes those layers with the existing retrieval, SDK,
reports, compatibility checks and browser persistence. Configuration loads at
build/module time; there is no runtime catalog editor.

The rule language uses `branch`, `require` and terminal outcomes. Branching on an
unknown fact yields unknown. Required facts yield a gap for a documented negative,
documented for all positives, and unknown otherwise. Conflicts, unavailable citations
and non-supporting human reviews force clarification. Only active branches ask
follow-up questions. A nonempty rationale is not automatically checked for truth.

| Outcome | Meaning |
| --- | --- |
| `satisfied` / Documented | Required declarations have a source reference or rationale; legal adequacy is unverified |
| `gap` | An applicable prerequisite is explicitly reported absent |
| `unknown` | Facts, support, scope or consistency are unresolved |
| `not_applicable` | A documented exclusion applies to this limited check |

To extend the assessment, verify an immutable citation, add versioned questions,
requirements, rules and provenance-bearing mappings, select them in a use case,
then add scenarios and regression expectations. Existing rule operators need no
new UI/engine branch; new operators require implementation and tests. The original
Claude evidence/facts and schema-1 drafts/reports remain supported through validation
and migration to configured context and schema-2 reports.

## Source coverage and retrieval

The inventory contains GDPR (2016 Official Journal), BDSG (2017 historical text),
GeschGehG (2019), UWG (2020 snapshot), BfDI Info 1 and BSI 200-1/200-2/200-3 (2017).
The main corpus stores eight statutory pages and eight selected citations: GDPR
5(1)(b–c), 6(1), 28(3), 32(1) introduction, 35(1), 44, BDSG 26(1), and GeschGehG
2 no.1(b). Other sources are inventory entries, not a fully indexed legal library.

Original PDFs stay under ignored `data/local/regulatory/`; the app runs from JSON.
PDF page numbers may differ from printed numbers. Offsets are zero-based,
end-exclusive UTF-16 positions in extracted page text, not PDF image coordinates.
Quotes may cover only part of a provision. Official links do not replace the pinned
edition identified by the original PDF hash. Current law and interpretation need
specialist review; AI Act, worker participation, sector rules and actual provider
contracts/data flows are not comprehensively covered. Never infer Claude settings,
retention, hosting or provider roles from the product name.

Both search strategies reuse the existing implementations. Regulatory Graph Search
converts configured mappings to control/section edges and runs bounded BFS. The
eight curated mappings remain explicitly unverified project interpretations; the
demo permits them. Unreviewed `ai_generated` mappings are blocked. No semantic
entity alignment or automatic relationship generation is implemented.

## Proposal discovery and human review

Under **Discover requirements for a new use case**, enter a synthetic description
and 1–12 distinct search terms. The description does not automatically populate
company facts. Existing Text/Graph Search proposes known catalog mappings, with
exact quotes, editions, rules, required facts, original ranks/paths and diagnostics.
Applicability starts unknown. This searches known mappings, not all PDFs, and can
return graph candidates for unrelated descriptions that need rejecting.

An existing model judgment retains its original question and company passage. It
does not judge the new description. Unsupported free-form AI imports are rejected.
The separate [source-extraction experiment](obligation-discovery-experiment.md)
uses a different question configuration and never updates the production catalog.

Review actions are **reject**, **correct**, and **approve candidate**. Record a
reviewer alias, source/applicability reasoning and remaining uncertainty. Approval
also needs explicit source support, scope/counterevidence review and a non-unknown
applicability decision. Corrections select an existing requirement/citation pair,
append a new event and require later approval. Original proposals survive.

Review events form a hash-linked append-only chain; modified or reordered entries
are rejected. Approval never activates a rule: promotion requires an explicit,
versioned catalog change and tests. Reviewers are not authenticated or certified,
and free-text reasoning is not semantically verified. Keep personal data out of exports.

## Snapshots and compatibility

**Capture snapshot** freezes the engine version, full definitions, applicability
rules, relationship provenance, source editions/hashes, exact evidence, scenario
revisions, facts, human reviews, raw Jev runs and separate proposal/review archive.
Its SHA-256 ID covers the canonical payload, including capture time. New captures
append; the UI does not edit old captures. Import leaves the active draft unchanged.

Offline replay evaluates embedded definitions instead of the working catalog and
checks results/citations. Unsupported engine/discovery versions fail closed; retain
their matching executable implementation. Known corpus anchors and recomputed page
hashes prevent an imported file from blessing its own invented source text. A hash
is not a signature, proof of reviewer identity, or legal certification. Snapshots
do not bundle executable code and browser data can be deleted or changed externally.

Schema-2 reports pin definitions, questions, sources, facts, evidence and unchanged
raw runs; ordinary imports require matching definitions. Self-contained snapshots
add replay from embedded definitions. Historical Human Oversight recordings remain
unchanged. Research uses `jev.regulatory-research.v1`, snapshots use
`jev.regulatory-snapshots.v1`, and drafts retain `jev.regulatory-draft.v1` with legacy
migration. Archives allow ten discovery batches, 100 review events and ten snapshots.
Storage errors preserve raw recovery export; this is not multi-user audit storage.

## Reproduce offline

Use Node.js 24 and `npm ci`. The following commands make no paid requests. Choose
fresh output directories; generated reports are ignored.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:browser
npm.cmd run eval:regulatory -- --out results/regulatory-review-new
node --import tsx --import ./test-support/offline.js scripts/regulatory-snapshot.ts --demo --out results/discovery-demo-new
node --import tsx --import ./test-support/offline.js scripts/regulatory-snapshot.ts --input results/discovery-demo-new/snapshot.json --out results/discovery-replay-new
```

Rule expectations are AI-authored engineering fixtures, not human-confirmed legal
labels. Retrieval, classification and deterministic-rule tests are separate.
Browser tests block provider transport. The main regulatory evidence question has
no bundled live recordings; the eight extraction recordings are a different experiment.

Optional PDF verification requires the original known editions and a separate
Python environment; see [input files](../data/README.md):

```powershell
python -m venv results/pdf-tools
results/pdf-tools/Scripts/python.exe -m pip install -r scripts/regulatory-requirements.txt
results/pdf-tools/Scripts/python.exe scripts/ingest-regulations.py --input data/local/regulatory --out results/regulatory-reingest-new
```

This validates pinned files/pages/quotes, not arbitrary ingestion or OCR. New editions
need reviewed corpus versions and anchors. No real-company document upload, operational
BCM workflow, authenticated RBAC or overall compliance verdict is included.
