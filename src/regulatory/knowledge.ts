import { configurationIdentity } from '../question-config.js';
export type LegalSource={id:string;title:string;kind:string;issuer:string;revision:string;url:string;filename:string;sha256:string;pageCount:number;currentness:string;use:string};
export type LegalPage={id:string;sourceId:string;page:number;text:string;sha256:string};
export type Citation={id:string;sourceId:string;pageId:string;pdfPage:number;pinpoint:string;start:number;end:number;quote:string};
export type RegulatoryKnowledge={schemaVersion:number;version:string;extraction:string;extractedOn:string;sources:LegalSource[];pages:LegalPage[];citations:Citation[];fingerprint:string};
export function createRegulatoryKnowledge(value:unknown){
 const corpus=structuredClone(value) as RegulatoryKnowledge;
 if(corpus?.schemaVersion!==1||!corpus.version||!Array.isArray(corpus.sources)||!Array.isArray(corpus.pages)||!Array.isArray(corpus.citations)||!/^[a-f0-9]{64}$/.test(corpus.fingerprint))throw Error('Invalid regulatory knowledge.');
 for(const list of [corpus.sources,corpus.pages,corpus.citations])if(new Set(list.map(x=>x.id)).size!==list.length)throw Error('Duplicate source identity.');
 for(const source of corpus.sources)if(!/^[a-f0-9]{64}$/.test(source.sha256)||!source.revision||!Number.isInteger(source.pageCount)||source.pageCount<1)throw Error('Invalid source version.');
 for(const page of corpus.pages){const source=corpus.sources.find(s=>s.id===page.sourceId);if(!source||!Number.isInteger(page.page)||page.page<1||page.page>source.pageCount||typeof page.text!=='string'||!/^[a-f0-9]{64}$/.test(page.sha256))throw Error('Invalid source page.');}
 function citationById(id:string){const c=corpus.citations.find(c=>c.id===id);if(!c)throw Error('Unknown citation.');return c;}
 function assertCitation(value:unknown){
  const c=value as Citation,expected=citationById(c?.id),page=corpus.pages.find(p=>p.id===c.pageId);
  if(!page||page.sourceId!==c.sourceId||c.pdfPage!==page.page||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<0||c.end<=c.start||c.end>page.text.length||typeof c.pinpoint!=='string'||!c.pinpoint.trim()||page.text.slice(c.start,c.end)!==c.quote||configurationIdentity(c)!==configurationIdentity(expected))throw Error('Incorrect citation or changed source.');return c;
 }
 for(const c of corpus.citations)assertCitation(c);
 return {corpus,citationById,assertCitation};
}
