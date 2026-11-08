import type { GraphHit } from './evidence-graph';

export type SearchComparisonRow = {
  hit: GraphHit; textRank: number | null; graphRank: number | null;
  change: 'graph_only' | 'text_only' | 'rank_changed' | 'same_rank';
};

/** Compare returned result sets; absence is not a relevance or corpus-absence judgment. */
export function compareSearchHits(text: GraphHit[], graph: GraphHit[]): SearchComparisonRow[] {
  const textRanks = new Map(text.map((hit, i) => [hit.passage.id, i + 1]));
  const graphRanks = new Map(graph.map((hit, i) => [hit.passage.id, i + 1]));
  const hits = new Map([...graph, ...text].map(hit => [hit.passage.id, hit]));
  return [...hits.values()].map(hit => {
    const textRank = textRanks.get(hit.passage.id) ?? null;
    const graphRank = graphRanks.get(hit.passage.id) ?? null;
    return { hit: graph.find(entry => entry.passage.id === hit.passage.id) ?? hit, textRank, graphRank,
      change: textRank === null ? 'graph_only' : graphRank === null ? 'text_only' : textRank === graphRank ? 'same_rank' : 'rank_changed' };
  });
}
