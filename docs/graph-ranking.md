# Experimental document-diversity ranking

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
