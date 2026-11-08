import type { GraphHit } from './evidence-graph';

export type GraphRanking = 'lexical-path-1' | 'document-diversity-1';
export type GraphRankingInfo = {
  version: 'document-diversity-1'; candidateCount: number; documentRevisions: number;
  originalOrder: string[]; changes: { passageId: string; previousRank: number; rank: number }[];
};

/** Round-robin document/revision groups. Never infer relevance or change source data. */
export function diversifyGraphHits(input: GraphHit[]): { hits: GraphHit[]; ranking: GraphRankingInfo } {
  const groups = new Map<string, GraphHit[]>();
  const originalRanks = new Map<string, number>();
  input.forEach((hit, index) => {
    if (originalRanks.has(hit.passage.id)) throw new Error('Duplicate graph candidate.');
    originalRanks.set(hit.passage.id, index + 1);
    const key = JSON.stringify([hit.passage.documentId, hit.passage.revision]);
    const group = groups.get(key);
    if (group) group.push(hit); else groups.set(key, [hit]);
  });
  const hits: GraphHit[] = [];
  for (let round = 0; hits.length < input.length; round++) {
    for (const group of groups.values()) if (group[round]) hits.push(group[round]);
  }
  return { hits, ranking: { version: 'document-diversity-1', candidateCount: input.length, documentRevisions: groups.size,
    originalOrder: input.map(hit => hit.passage.id), changes: hits.flatMap((hit, index) => {
      const previousRank = originalRanks.get(hit.passage.id)!;
      return previousRank === index + 1 ? [] : [{ passageId: hit.passage.id, previousRank, rank: index + 1 }];
    }) } };
}
