import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceGraph, searchEvidenceGraph, DEFAULT_GRAPH_LIMITS } from '../src/ui/evidence-graph';
import { compareSearchHits } from '../src/ui/search-comparison';

const graph=buildEvidenceGraph();
const result=searchEvidenceGraph(graph,{...DEFAULT_GRAPH_LIMITS,systemId:'dispatch',controlId:'human-oversight',includeArchived:false,ranking:'document-diversity-1'});

test('comparison aligns exact passage identities and preserves the real five-hop graph-only source',()=>{
  const before=JSON.stringify(result);
  const rows=compareSearchHits(result.baseline,result.hits);
  assert.equal(rows.length,7);
  assert.equal(rows.filter(row=>row.change==='graph_only').length,3);
  assert.equal(rows.filter(row=>row.textRank!==null&&row.graphRank!==null).length,4);
  const queue=rows.find(row=>row.hit.passage.id==='dispatch-signoff@1:34-107')!;
  assert.equal(queue.textRank,null);assert.equal(queue.graphRank,5);assert.equal(queue.hit.path.steps.length,5);
  assert.equal(JSON.stringify(result),before);
});

test('comparison separates rank changes from returned-set differences without calling either relevance',()=>{
  const reversed=[...result.baseline].reverse();
  const rows=compareSearchHits(result.baseline,reversed);
  assert.equal(rows.length,4);assert.ok(rows.every(row=>row.change==='rank_changed'));
  const capped=compareSearchHits(result.baseline,result.hits.slice(0,3));
  assert.equal(capped.filter(row=>row.change==='text_only').length,1);
  assert.equal(capped.find(row=>row.change==='text_only')!.graphRank,null);
  assert.deepEqual(compareSearchHits([],[]),[]);
});
