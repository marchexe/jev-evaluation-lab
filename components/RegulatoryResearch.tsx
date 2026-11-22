'use client';
import {useEffect,useState} from 'react';
import {useLanguage} from './LanguageProvider';
import {downloadJson} from '../src/ui/history';
import {MAX_IMPORT_BYTES} from '../src/ui/import-export';
import {type RegulatoryDraft} from '../src/ui/regulatory';
import type {Catalog,Rule} from '../src/assessment/configuration';
import {appendBatch,appendResearch,appendReview,appendSnapshot,captureAssessment,discoverRequirements,effectiveProposal,readResearch,readSnapshots,replayAssessment,reviewProposal,RESEARCH_KEYS,type AssessmentSnapshot,type DiscoveryBatch,type ProposalReview,type ReviewInput,type Research} from '../src/regulatory/research';

const empty:Research={batches:[],reviews:[]};
export function RegulatoryResearch({draft,disabled}:{draft:RegulatoryDraft;disabled:boolean}){
 const {language}=useLanguage(),l=(de:string,en:string)=>language==='de'?de:en;
 const [research,setResearch]=useState<Research>(empty),[snapshots,setSnapshots]=useState<AssessmentSnapshot[]>([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[loadError,setLoadError]=useState(false),[notice,setNotice]=useState('');
 const [description,setDescription]=useState('SYNTHETISCH: Ein interner KI-Assistent beantwortet Fragen zu freigegebenen Dokumenten. Beschäftigtenkonten und Nutzungsprotokolle sind vorgesehen. Anbieterrollen und Übermittlungen sind noch ungeklärt.');
 const [terms,setTerms]=useState('Auftragsverarbeiter, Risiko'),[batchId,setBatchId]=useState(''),[snapshotId,setSnapshotId]=useState('');
 useEffect(()=>{let active=true;Promise.all([readResearch(localStorage),readSnapshots(localStorage)]).then(([r,s])=>{if(active){setResearch(r);setSnapshots(s);setBatchId(r.batches.at(-1)?.id??'');setSnapshotId(s.at(-1)?.id??'');}}).catch(()=>{if(active)setLoadError(true);}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[]);
 const batch=research.batches.find(b=>b.id===batchId),snapshot=snapshots.find(s=>s.id===snapshotId);
 const outcome=(value:string)=>({satisfied:l('Dokumentiert','Documented'),gap:l('Lücke','Gap'),unknown:l('Ungeklärt','Unknown'),not_applicable:l('Nicht anwendbar','Not applicable')}[value]??value);
 async function action(fn:()=>Promise<void>){if(busy||disabled||!ready||loadError)return;setBusy(true);setNotice('');try{await fn();}catch{setNotice(l('Vorgang abgelehnt: Daten prüfen. Bestehende Einträge bleiben erhalten. Bei vollem Speicher zuerst exportieren.','Operation rejected: check the data. Existing entries remain. Export first if storage is full.'));}finally{setBusy(false);}}
 const locked=busy||disabled||!ready||loadError;
 async function saveReview(p:DiscoveryBatch,proposalId:string,input:ReviewInput){await action(async()=>{const current=await readResearch(localStorage),review=await reviewProposal(p,proposalId,current.reviews,input);setResearch(await appendReview(localStorage,review));setNotice(l('Prüfung protokolliert. Aktive Regeln bleiben unverändert.','Review recorded. Active rules are unchanged.'));});}
 return <section className="regulatory-research" aria-label={l('Recherche und unveränderliche Snapshots','Discovery and immutable snapshots')}>
  {loadError&&<p role="alert">{l('Recherchearchiv nicht lesbar. Es wird nicht überschrieben.','Research archive cannot be read. It will not be overwritten.')} <button onClick={()=>downloadJson('regulatory-recovery.json',JSON.stringify({research:localStorage.getItem(RESEARCH_KEYS.research),snapshots:localStorage.getItem(RESEARCH_KEYS.snapshots)}))}>{l('Rohdaten sichern','Recover raw data')}</button></p>}
  {notice&&<p role="status">{notice}</p>}
  <details><summary>{l('Anforderungen für einen neuen Einsatz suchen','Discover requirements for a new use case')}</summary>
   <p>{l('Nur synthetische Angaben. Text- und Graphsuche liefern Kandidaten aus bestehenden Zuordnungen. Keine automatische Anwendbarkeit und keine neuen freigegebenen Regeln.','Synthetic input only. Text and Graph Search propose candidates from existing mappings. No automatic applicability or new approved rules.')}</p>
   <label>{l('Neuer Einsatz (synthetisch)','New use case (synthetic)')}<textarea maxLength={4000} value={description} disabled={locked} onChange={e=>setDescription(e.target.value)}/></label>
   <label>{l('Suchbegriffe, durch Komma getrennt','Search terms, separated by commas')}<input value={terms} maxLength={1200} disabled={locked} onChange={e=>setTerms(e.target.value)}/></label>
   <button disabled={locked} onClick={()=>action(async()=>{const b=await discoverRequirements({scenarioId:draft.scenarioId,description,terms:terms.split(',').map(t=>t.trim()).filter(Boolean),modelRuns:draft.runs});setResearch(await appendBatch(localStorage,b));setBatchId(b.id);setNotice(l('Kandidaten gespeichert. Anwendbarkeit ist ungeklärt.','Candidates saved. Applicability is unknown.'));})}>{l('Kandidaten suchen (offline)','Find candidates (offline)')}</button>
   <p className="view-note">{l('Vorhandene Jev-Urteile werden mit ihrem ursprünglichen Beleg gespeichert. Es wird keine neue Modellanfrage gesendet.','Existing Jev judgments retain their original passage. No new model request is sent.')}</p>
   {research.batches.length>0&&<><label>{l('Recherche auswählen','Select discovery')}<select value={batchId} onChange={e=>setBatchId(e.target.value)} disabled={locked}>{research.batches.map((b,i)=><option key={b.id} value={b.id}>{i+1} · {b.payload.request.description.slice(0,65)} · {b.payload.createdAt}</option>)}</select></label>
    <button onClick={()=>downloadJson('regulatory-proposals.json',JSON.stringify(research,null,2))}>{l('Vorschläge und Prüfprotokoll exportieren','Export proposals and review log')}</button></>}
   {batch&&<><p>{batch.payload.proposals.length} {l('Kandidaten · Nicht vollständig: Nur bekannte Anforderungszuordnungen und ausgewählte Auszüge.','candidates · Not exhaustive: known requirement mappings and selected excerpts only.')}</p><p>{batch.payload.request.description}</p>
    {batch.payload.proposals.map(p=><ProposalEditor key={batch.id+p.id} batch={batch} proposalId={p.id} reviews={research.reviews} disabled={locked} onSave={input=>saveReview(batch,p.id,input)}/>)}
    <details><summary>{l('Suchdiagnostik und Begrenzungen','Search diagnostics and bounds')}</summary><pre className="technical-json">{JSON.stringify(batch.payload.diagnostics,null,2)}</pre></details></>}
  </details>
  <details><summary>{l('Bewertung als unveränderlichen Snapshot speichern','Save assessment as an immutable snapshot')}</summary>
   <p>{l('Enthält Definitionen, Regeln, Quellenstände, genaue Belege, Jev-Metadaten und das separate Rechercheprotokoll. Alte Snapshots werden nicht ersetzt. Lokal im Browser; wichtige Daten exportieren.','Includes definitions, rules, source versions, exact evidence, Jev metadata and the separate discovery log. Old snapshots are not replaced. Stored in this browser; export important data.')}</p>
   <button disabled={locked} onClick={()=>action(async()=>{const r=await readResearch(localStorage),s=await captureAssessment(draft,r);await appendSnapshot(localStorage,s);setSnapshots(await readSnapshots(localStorage));setSnapshotId(s.id);setNotice(l('Snapshot gespeichert.','Snapshot saved.'));})}>{l('Snapshot erfassen','Capture snapshot')}</button>
   <label>{l('Recherche oder Snapshot importieren','Import research or snapshot')}<input type="file" accept=".json,application/json" disabled={locked} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;await action(async()=>{if(file.size>MAX_IMPORT_BYTES)throw Error('Too large');const value=JSON.parse(await file.text());if(value.payload?.kind==='regulatory-assessment-snapshot'){const s=await replayAssessment(value);await appendSnapshot(localStorage,s);setSnapshots(await readSnapshots(localStorage));setSnapshotId(s.id);}else{setResearch(await appendResearch(localStorage,value));setBatchId(value.batches?.at(-1)?.id??'');}setNotice(l('Import geprüft. Aktive Bewertung unverändert.','Import verified. Active assessment unchanged.'));});}}/></label>
   {snapshots.length>0&&<label>{l('Gespeicherter Snapshot','Saved snapshot')}<select value={snapshotId} onChange={e=>setSnapshotId(e.target.value)} disabled={locked}>{snapshots.map(s=><option key={s.id} value={s.id}>{s.payload.report.scenario.id} · {s.payload.createdAt}</option>)}</select></label>}
   {snapshot&&<><p><code>{snapshot.id}</code></p><p>{l('Nur-Lese-Ansicht aus eingefrorenen Daten. Hash ist Integritätsschutz, kein Herkunftsnachweis.','Read-only view from frozen data. The hash checks integrity, not authorship.')}</p>
    <table className="lab-table" aria-label={l('Snapshot-Ergebnisse','Snapshot findings')}><thead><tr><th>{l('Anforderung','Requirement')}</th><th>{l('Ergebnis','Outcome')}</th></tr></thead><tbody>{snapshot.payload.report.findings.map(f=><tr key={f.checkId}><td>{snapshot.payload.report.definitions.catalog.requirements.find(r=>r.id===f.checkId)?.[language==='de'?'title':'titleEn']}</td><td>{outcome(f.outcome)}</td></tr>)}</tbody></table>
    <button onClick={()=>downloadJson('regulatory-snapshot.json',JSON.stringify(snapshot,null,2))}>{l('Snapshot exportieren','Export snapshot')}</button>
    <button disabled={locked} onClick={()=>action(async()=>{await replayAssessment(snapshot);setNotice(l('Snapshot offline reproduziert.','Snapshot replayed offline.'));})}>{l('Snapshot offline prüfen','Replay snapshot offline')}</button>
    <details><summary>{l('Eingefrorene Definitionen, Quellen und Modellmetadaten','Frozen definitions, sources and model metadata')}</summary><pre className="technical-json">{JSON.stringify(snapshot.payload,null,2)}</pre></details></>}
  </details>
 </section>;
}

function ProposalEditor({batch,proposalId,reviews,disabled,onSave}:{batch:DiscoveryBatch;proposalId:string;reviews:ProposalReview[];disabled:boolean;onSave:(input:ReviewInput)=>Promise<void>}){
 const {language}=useLanguage(),l=(de:string,en:string)=>language==='de'?de:en;
 const e=effectiveProposal(batch,proposalId,reviews),p=e.proposal;
 const [decision,setDecision]=useState<ReviewInput['decision']>('reject'),[reviewer,setReviewer]=useState(''),[rationale,setRationale]=useState(''),[uncertainty,setUncertainty]=useState('');
 const [applicability,setApplicability]=useState<ReviewInput['applicability']>('unknown'),[sourceConfirmed,setSourceConfirmed]=useState(false),[scopeReviewed,setScopeReviewed]=useState(false),[requirementId,setRequirementId]=useState(e.requirement.id),[citationId,setCitationId]=useState(e.citation.id);
 const catalog=batch.payload.resources.requirements as Catalog,citations=(batch.payload.resources.knowledge as {citations:typeof p.citation[]}).citations;
 function explain(rule:Rule):string{
  const label=(id:string)=>{const q=catalog.questions.find(q=>q.id===id)!;return l(q.label.de,q.label.en);};
  if(typeof rule==='string')return ({not_applicable:l('im dokumentierten Umfang ausgeschlossen','excluded within the documented scope'),unknown:l('ungeklärt','unknown'),gap:l('Lücke','gap'),satisfied:l('dokumentiert','documented')})[rule];
  if(rule.op==='require')return l('Benötigte dokumentierte Angaben: ','Required documented declarations: ')+rule.facts.map(label).join('; ');
  return l('Wenn „','If “')+label(rule.fact)+l('“ mit Ja beantwortet ist: ','” is Yes: ')+explain(rule.yes)+l(' Bei dokumentiertem Nein: ',' With a documented No: ')+explain(rule.no)+l(' Bei fehlender Angabe bleibt das Ergebnis ungeklärt.',' Missing declarations leave the outcome unknown.');
 }
 const statuses={pending:l('Ungeprüft','Pending'),approve:l('Kandidat bestätigt','Candidate approved'),reject:l('Abgelehnt','Rejected'),correct:l('Korrigiert – erneut prüfen','Corrected — review again')};
 return <details className="regulatory-citation"><summary>{language==='de'?e.requirement.title:e.requirement.titleEn} · {e.citation.pinpoint} · {statuses[e.status]}</summary>
  <p>{l('Herkunft','Origin')}: {p.provenance.origin==='retrieval'?l('Suchkandidat','Retrieval candidate'):l('Suchkandidat mit Jev-Hinweis','Retrieval candidate with Jev assistance')} · {e.source.revision} · PDF {e.citation.pdfPage}</p><blockquote>{e.citation.quote}</blockquote><p><a href={e.source.url} target="_blank" rel="noreferrer">{e.source.filename}</a> · <code>{e.citation.pageId} [{e.citation.start}, {e.citation.end})</code></p>
  <p>{l(p.applicability.reason.de,p.applicability.reason.en)}</p><p>{l(p.applicability.uncertainty.de,p.applicability.uncertainty.en)}</p>
  <p><strong>{l('Prüflogik: ','Assessment logic: ')}</strong>{explain(e.requirement.rule)}</p>
  <details><summary>{l('Bedingungen, Quelle und Suchpfade','Conditions, source and retrieval paths')}</summary><pre className="technical-json">{JSON.stringify({originalProposal:p,effectiveRequirement:e.requirement,effectiveCitation:e.citation},null,2)}</pre></details>
  <label>{l('Entscheidung','Decision')}<select value={decision} onChange={ev=>setDecision(ev.target.value as ReviewInput['decision'])} disabled={disabled}><option value="reject">{l('Ablehnen','Reject')}</option><option value="correct">{l('Korrigieren (noch nicht freigegeben)','Correct (not approved)')}</option><option value="approve">{l('Kandidat bestätigen (keine Regelaktivierung)','Approve candidate (no rule activation)')}</option></select></label>
  {decision==='correct'&&<><label>{l('Korrigierte Anforderung','Corrected requirement')}<select value={requirementId} onChange={ev=>setRequirementId(ev.target.value)}>{catalog.requirements.map(r=><option key={r.id} value={r.id}>{language==='de'?r.title:r.titleEn}</option>)}</select></label><label>{l('Korrigierte Quellenstelle','Corrected citation')}<select value={citationId} onChange={ev=>setCitationId(ev.target.value)}>{citations.map(c=><option key={c.id} value={c.id}>{c.pinpoint}</option>)}</select></label></>}
  <label>{l('Prüferkennung','Reviewer identifier')}<input value={reviewer} maxLength={120} onChange={ev=>setReviewer(ev.target.value)}/></label>
  <label>{l('Anwendbarkeit laut Prüfung','Reviewed applicability')}<select value={applicability} onChange={ev=>setApplicability(ev.target.value as ReviewInput['applicability'])}><option value="unknown">{l('Ungeklärt','Unknown')}</option><option value="applicable">{l('Anwendbar im beschriebenen Umfang','Applicable in the stated scope')}</option><option value="not_applicable">{l('Im beschriebenen Umfang ausgeschlossen','Excluded in the stated scope')}</option></select></label>
  <label>{l('Begründung der Quellenzuordnung und Anwendbarkeit','Source relationship and applicability reasoning')}<textarea value={rationale} maxLength={4000} onChange={ev=>setRationale(ev.target.value)}/></label>
  <label>{l('Verbleibende Unsicherheit','Remaining uncertainty')}<textarea value={uncertainty} maxLength={4000} onChange={ev=>setUncertainty(ev.target.value)}/></label>
  <label><input type="checkbox" checked={sourceConfirmed} onChange={ev=>setSourceConfirmed(ev.target.checked)}/>{l('Quelle unterstützt diese Anforderung','Source supports this requirement')}</label>
  <label><input type="checkbox" checked={scopeReviewed} onChange={ev=>setScopeReviewed(ev.target.checked)}/>{l('Einsatzumfang und Gegenbelege geprüft','Scope and contradictory evidence reviewed')}</label>
  <button disabled={disabled||!reviewer.trim()||!rationale.trim()||!uncertainty.trim()||(decision==='approve'&&(!sourceConfirmed||!scopeReviewed||applicability==='unknown'))} onClick={()=>onSave({decision,reviewer,rationale,uncertainty,applicability,sourceSupportsRequirement:sourceConfirmed,scopeReviewed,...(decision==='correct'?{correction:{requirementId,citationId}}:{})})}>{l('Prüfentscheidung protokollieren','Record review decision')}</button>
  <details><summary>{l('Unveränderliches Prüfprotokoll','Append-only review log')} · {e.history.length}</summary><pre className="technical-json">{JSON.stringify(e.history,null,2)}</pre></details>
 </details>;
}
