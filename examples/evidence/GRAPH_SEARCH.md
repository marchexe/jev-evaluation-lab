# Experimental Evidence Graph Search

In **Evidence**, keep **Human Oversight**, **dispatch**, current revisions, and
**Inspect all source passages** unchecked. Change **Search strategy** from
**Text Search** to **Graph Search**. At depth **5**, the queue countersignature
paragraph is retrieved without adding its terminology to the Human Oversight
keyword list. Open **Graph retrieval path** on that card to inspect each hop.
Depth **4** does not reach it. Neither strategy sends model requests.

## Architecture and source records

`src/ui/evidence-graph.ts` builds a typed, in-memory graph and runs a deterministic
multi-source breadth-first search. There is no graph database, embedding model,
LLM, graph visualization, network traversal, or new dependency. It follows the
code-owned search-loop idea described by
[jev-navigator](https://github.com/ajbmachon/jev-navigator) and the explicit-source
graph approach exemplified by [Lex Graph](https://github.com/i-dot-ai/lex-graph).
These are architectural references, not imported implementations or endorsements.

The original six-case `documents.json`, experiment manifest, question wording,
recorded Jev response, dataset version, and raw SDK integration are unchanged.
`graph-documents.json` adds only one synthetic document, `dispatch-gates`, at two
revisions. `graph-relations.json` records the local control mapping, its exact
quoted sources, explicit current revision, and supersession claim. Search corpus
version `synthetic-oversight-graph-1` is additive to `synthetic-oversight-1`.

## Node definitions

IDs encode each component with `encodeURIComponent`. Passage IDs retain the
existing document/revision and end-exclusive UTF-16 offset identity.

| Kind | Stable ID | Data |
| --- | --- | --- |
| system | `system:{systemId}` | Explicit synthetic system ID |
| control | `control:{controlId}` | ID, statement, title, lexical terms, assessment field |
| document | `document:{documentId}` | Logical document ID and system membership |
| revision | `revision:{documentId}@{revision}` | Full exact document snapshot; current `true`, archived `false`, unresolved `null` |
| section | `section:{documentId}@{revision}:{sectionPath}` | Exact section path, pinned document/revision and system |
| passage | `passage:{existingPassageId}` | Exact text, document/revision/system, section path, line numbers, UTF-16 offsets |

Duplicate document/revision identities are rejected, including conflicting text
under the same identity. Revisions are snapshots, not fields overwritten when a
new revision arrives. Multiple revisions require an explicit current selection;
the code never guesses from revision numbers. Original saved reviews still load.
Added-source reviews carry an additive corpus version and exact source validation.

## Edge definitions

Every edge has `id`, `kind`, `from`, `to`, `origin`, `reviewStatus`, and `provenance`.
IDs combine kind, encoded endpoints, and a stable annotation ID, reference offset,
or source identity. Human review edits update the relationship data, not its ID.

| Kind | Endpoints | Origin / provenance | Search traversal |
| --- | --- | --- | --- |
| system_document | system → document | explicit metadata: systemId | excluded |
| document_revision | document → revision | explicit metadata: revision | excluded |
| revision_section | revision → section | derived segmentation with exact source paragraph | excluded |
| section_passage | section → passage | derived segmentation with exact source paragraph | both directions |
| related_control | control → control | explicit local mapping, exact quoted source | both directions |
| control_section | control → section | explicit local scope annotation, exact quoted source | forward |
| references | passage → section | exact pinned Markdown link found in the paragraph | forward |
| supersedes | revision → revision | explicit quoted revision statement | excluded |
| human_review | control → passage | independent saved reviewer judgment, relevance, comment, timestamp | excluded |

Containment and shared-system membership do not imply semantic relevance. They
cannot flood the search through every document in a system. Source assertions
and deterministic derived edges have `reviewStatus: unreviewed`; neither means
verified. A `human_reviewed` edge records an annotation, including uncertainty;
it does not certify the other edges or legal compliance. Human review edges are
never search seeds or expansion links, preventing reference-label leakage.

Parsed links use `[label](evidence:documentId@revision#encodedSectionPath)`.
Only exact pinned targets resolve. Missing targets, unpinned links, invalid source
quotations, and unresolved current revisions produce diagnostics; no substitute
node or fuzzy citation is created. This is a small link syntax, not a full Markdown
or natural-language reference parser. Alias/scope annotations are manually curated
synthetic assertions whose quotes are checked, not semantic entailment proofs.

## One verifiable multi-hop example

For dispatch / Human Oversight, the graph finds this path:

1. `control:human-oversight` → `control:two-person-gate` via `related_control`.
   Source: `dispatch-gates@2`, **Control mapping**, line 5, offsets `[46,208)`:
   “This register calls Human Oversight the Two-person Gate control for the Dispatch assistant.”
2. Two-person Gate → `dispatch-gates@2` / **Related sources** via `control_section`.
   Same paragraph: “The Gate rule and Related sources sections specify this local control.”
3. Related sources section → its exact paragraph via `section_passage`.
   Passage `dispatch-gates@2:370-688`, line 13.
4. That paragraph → `dispatch-signoff@1` / **Queue procedure / Final gate** via
   the actual `[Queue gate](evidence:dispatch-signoff@1#Queue%20procedure%20%2F%20Final%20gate)` link.
5. Final gate section → passage `dispatch-signoff@1:34-107`, line 5:
   “A staff member must countersign each proposal before it leaves the queue.”

The exact passage remains ambiguous about execution under the original review
guide. Retrieving it does not change its evidence judgment or resolve the conflict
between the Dispatch policy and runbook.

## Same-query baseline comparison

The two strategies use the **same** selected system, control, revision scope and
additive corpus. Text Search calls the unchanged `retrievePassages` function.

| Current-revision passage | Text Search | Graph Search at depth 5 |
| --- | --- | --- |
| Runbook / Execution | yes | yes |
| Editorial / Editorial checks | yes | yes |
| Policy / Recommendation approval | yes | yes |
| Register revision 2 / Control mapping | yes | yes |
| Register revision 2 / Gate rule | no | yes, 3 hops |
| Register revision 2 / Related sources | no | yes, 3 hops |
| Queue procedure / Final gate | no | yes, 5 hops |

Observed offline: **4** text candidates, **7** graph candidates. The editorial
false candidate remains; the link paragraph itself is also returned as a candidate.
More candidates are not automatically better. A manually relevant queue passage
is missed by text and found by graph; broader precision requires independent
relevance labels. No model success is claimed or fabricated.

Default search permits 5 hops, 200 visited nodes, 1,000 examined adjacency edges,
and 50 returned results; depth is selectable from 0–8. The function validates all
limits and enforces hard maximums. A global visited set suppresses cycles and
duplicates. Each hit retains one deterministic first path, its lexical/control
seed, ordered node IDs, edge IDs and traversal directions. Ranking is lexical
match count descending, path length ascending, then stable passage ID. These are
ordering rules, not probabilities. Limit exhaustion is reported; a bounded result
must not be called exhaustive.

The current corpus without reviews has 54 nodes and 56 edges. The unresolved
`unpublished-annex@1` link remains visible as a diagnostic. The pinned link to
register revision 1 is excluded by default, not redirected to revision 2.
**Include archived revisions** reveals both contradictory register rules with
separate citations and review identities. A supersession link does not decide
which other documents are authoritative.

## Review, export, and evaluation

Existing passage review controls work on graph hits and added revisions/controls.
The Jev action still accepts only the fixed six experimental cases; the recovered
queue passage can use it. New register passages and the added alias control are
human-reviewable but have no new live-inference endpoint or experiment cases.
All five governance questions, assessment history and old exports remain supported.

Both evidence and complete-experiment exports add `search`, retaining strategy,
full graph/configuration, immutable revision snapshots, exact candidate passages,
paths, query scope/budgets, diagnostics/exclusions, version identifiers and separate
reviewed-pool text/graph retrieval counts. It captures the current query, not a
history of previous searches. Search settings are session-local; export before
changing them. An export includes both revisions even when search excludes the
archived revision, allowing citations and exclusions to be checked.

Retrieval counts use independently marked relevant passages within the selected
system/control/revision pool, not Jev predictions. The existing cross-review text
summary remains separate. Jev agreement still uses only saved six-case predictions
and categorical human labels; graph hits are not counted as correct classifications.
No-review denominators are zero, not an invented recall or accuracy result.

For reproducible evaluation, freeze this corpus, alias/link configuration and
budgets; review relevant and irrelevant passages independently; export one named
text/graph query pair per system/control/revision scope. Include misses through
**Inspect all source passages** without treating inspection as successful retrieval.
Keep evidence classification experiments separate. The separate
[offline retrieval evaluator](retrieval-eval/README.md) now replays 18 frozen query
configurations, reports bounded-search diagnostics and supports independently
confirmed full-pool relevance labels. All original labels remain unconfirmed.
Next steps are independent relevance labels and curated reference-path error
analysis. There is no authority resolution, inferred entity alignment, or learned
relation discovery in this slice.
