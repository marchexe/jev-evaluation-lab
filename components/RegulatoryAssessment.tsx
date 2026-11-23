'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RegulatoryResearch } from './RegulatoryResearch';
import { useLanguage } from './LanguageProvider';
import { JevAnswerField } from './JevAssessmentCard';
import { downloadJson } from '../src/ui/history';
import { MAX_IMPORT_BYTES } from '../src/ui/import-export';
import {
 REGULATORY_KEY, regulatoryCorpus, regulatoryScenarios, regulatoryUseCases, useCaseForScenario, checksForScenario, factDefinitions,
 freshDraft, validateDraft, assessRegulatory, companyPassages, regulatoryRetrieval,
 regulatoryReport, importRegulatoryReport, regulatoryMarkdown, regulatoryEvaluation, validateRun,
 type RegulatoryDraft, type FactId, type FactValue, type Outcome, type HumanReview,
} from '../src/ui/regulatory';

export function RegulatoryAssessment({liveEnabled,onRunningChange}:{liveEnabled:boolean;onRunningChange:(busy:boolean)=>void}) {
 const {language}=useLanguage();const l=(de:string,en:string)=>language==='de'?de:en;
 const [draft,setDraft]=useState<RegulatoryDraft>(()=>freshDraft());
 const [ready,setReady]=useState(false),[storageError,setStorageError]=useState(''),[notice,setNotice]=useState('');
 const [step,setStep]=useState(0),[selectedId,setSelected]=useState(''),[strategy,setStrategy]=useState<'text'|'graph'>('graph');
 const [evidenceId,setEvidenceId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>{try{const raw=localStorage.getItem(REGULATORY_KEY);if(raw)setDraft(validateDraft(JSON.parse(raw)));}catch{setStorageError('load');}setReady(true);return ()=>request.current?.abort();},[]);
 function save(next:RegulatoryDraft){validateDraft(next);setDraft(next);try{const json=JSON.stringify(next);localStorage.setItem(REGULATORY_KEY+':'+next.scenarioId,json);localStorage.setItem(REGULATORY_KEY,json);setStorageError('');}catch{setStorageError('write');}}
 function switchScenario(id:string){try{localStorage.setItem(REGULATORY_KEY+':'+draft.scenarioId,JSON.stringify(draft));const raw=localStorage.getItem(REGULATORY_KEY+':'+id);const next=raw?validateDraft(JSON.parse(raw)):freshDraft(id);if(next.scenarioId!==id)throw Error();save(next);setEvidenceId('');setNotice('');}catch{setStorageError('load');}}
 const findings=useMemo(()=>assessRegulatory(draft),[draft]);
 const useCase=useCaseForScenario(draft.scenarioId);
 const checks=checksForScenario(draft.scenarioId);
 const selected=checks.some(c=>c.id===selectedId)?selectedId:checks[0].id;
 const check=checks.find(c=>c.id===selected)!;
 const finding=findings.find(f=>f.checkId===selected)!;
 const passages=companyPassages(draft.scenarioId),passage=passages.find(p=>p.id===evidenceId)??passages[0];
 const retrieval=useMemo(()=>regulatoryRetrieval(selected,strategy,undefined,draft.scenarioId),[selected,strategy,draft.scenarioId]);
 const stats=useMemo(()=>regulatoryEvaluation(draft),[draft]);
 const reviewKey=JSON.stringify([selected,passage.id]),review=draft.reviews[reviewKey];
 const [reviewLabel,setReviewLabel]=useState<HumanReview['judgment']>('uncertain'),[comment,setComment]=useState('');
 useEffect(()=>{setReviewLabel(review?.judgment??'uncertain');setComment(review?.comment??'');},[review?.judgment,review?.comment,reviewKey]);
 const status=(s:Outcome)=>({satisfied:l('Dokumentiert','Documented'),gap:l('Lücke','Gap'),unknown:l('Ungeklärt','Unknown'),not_applicable:l('Nicht anwendbar','Not applicable')}[s]);
 const evidenceLabel=(v:string)=>({supported:l('Unterstützt','Supports'),contradicted:l('Widerspricht','Contradicts'),insufficient_evidence:l('Unzureichend','Insufficient'),ambiguous:l('Mehrdeutig','Ambiguous'),uncertain:l('Unsicher','Uncertain')}[v]??v);
 function fact(id:FactId){const f=draft.facts[id],def=factDefinitions.find(d=>d[0]===id)!;
  return <div className="regulatory-fact" key={id} data-value={f.value}><label><span>{language==='de'?def[1]:def[2]}</span><select aria-label={language==='de'?def[1]:def[2]} value={f.value} disabled={busy||!ready||storageError==='load'} onChange={e=>save({...draft,facts:{...draft.facts,[id]:{...f,value:e.target.value as FactValue}}})}><option value="unknown">{l('Unbekannt','Unknown')}</option><option value="yes">{l('Ja','Yes')}</option><option value="no">{l('Nein, ausdrücklich ausgeschlossen / fehlt','No, explicitly excluded / absent')}</option></select></label>
   <details><summary>{l('Beleg und Begründung','Evidence and rationale')} · {f.evidenceIds.length||f.note?l('angegeben','provided'):l('fehlt','missing')}</summary>
    {passages.map(p=><label className="regulatory-evidence-option" key={p.id}><input type="checkbox" disabled={busy||storageError==='load'} checked={f.evidenceIds.includes(p.id)} onChange={e=>save({...draft,facts:{...draft.facts,[id]:{...f,evidenceIds:e.target.checked?[...f.evidenceIds,p.id]:f.evidenceIds.filter(x=>x!==p.id)}}})}/>{p.documentId} · {p.section}</label>)}
    <label>{l('Eigene Angabe / Begründung','Reviewer declaration / rationale')}<textarea maxLength={1000} value={f.note} disabled={busy||storageError==='load'} onChange={e=>save({...draft,facts:{...draft.facts,[id]:{...f,note:e.target.value}}})}/></label>
   </details></div>;
 }
 async function judge(){if(request.current||!liveEnabled||draft.runs.length>=50)return;const controller=new AbortController();request.current=controller;setBusy(true);onRunningChange(true);setError('');
  try{const response=await fetch('/api/regulatory-evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenarioId:draft.scenarioId,checkId:selected,evidenceId:passage.id,live:true}),signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(String(response.status));if(controller.signal.aborted)return;validateRun(result,draft.scenarioId);save({...draft,runs:[...draft.runs,result]});}
  catch{setError(controller.signal.aborted?l('Anfrage abgebrochen.','Request cancelled.'):l('Jev-Anfrage fehlgeschlagen. Kein Ergebnis gespeichert.','Jev request failed. No result saved.'));}
  finally{request.current=null;setBusy(false);onRunningChange(false);}
 }
 const last=[...draft.runs].reverse().find(r=>r.checkId===selected&&r.evidenceId===passage.id);
 const scopeIds=useCase.scopeQuestions;
 const outcomeOf=(id:string)=>findings.find(f=>f.checkId===id)!.outcome;
 const count=(o:Outcome)=>findings.filter(f=>f.outcome===o).length;
 const locked=busy||!ready||storageError==='load';
 return <section className="lab-view regulatory-workspace" aria-label={l(useCase.heading.de,useCase.heading.en)}>
  <header className="regulatory-header">
   <div className="regulatory-title"><h2>{l(useCase.heading.de,useCase.heading.en)}</h2>
    <details className="regulatory-disclaimer"><summary>{l('Synthetische Daten · keine rechtliche Freigabe','Synthetic data · not legal approval')}</summary><p>{l('„Dokumentiert“ bedeutet: Angaben für diesen Prüfschritt liegen vor. Keine rechtliche Freigabe. Historische Gesetzesfassungen müssen fachlich auf Aktualität geprüft werden.','“Documented” means inputs for this checklist step are provided. It is not legal approval. Historical legal snapshots need specialist current-law review.')}</p></details></div>
   <div className="regulatory-pickers">
    <label>{l('Anwendungsfall','Use case')}<select disabled={locked} value={useCase.id} onChange={e=>switchScenario(regulatoryUseCases.useCases.find(u=>u.id===e.target.value)!.defaultScenarioId)}>{regulatoryUseCases.useCases.map(u=><option key={u.id} value={u.id}>{l(u.label.de,u.label.en)}</option>)}</select></label>
    <label>{l('Musterfall','Example case')}<select disabled={locked} value={draft.scenarioId} onChange={e=>switchScenario(e.target.value)}>{regulatoryScenarios.filter(s=>s.useCaseId===useCase.id).map(s=><option key={s.id} value={s.id}>{language==='de'?s.title:s.titleEn}</option>)}</select></label>
   </div>
  </header>
  <nav className="regulatory-steps" aria-label={l('Prüfschritte','Assessment steps')}>{[l('1 · Einsatz klären','1 · Define use'),l('2 · Belege prüfen','2 · Review evidence'),l('3 · Bericht','3 · Report')].map((title,i)=><button key={i} aria-current={step===i?'step':undefined} data-done={i<step?'true':undefined} disabled={busy} onClick={()=>setStep(i)}>{title}</button>)}</nav>
  {storageError&&<div role="alert" className="notice error">{l('Lokaler Speicher nicht lesbar oder voll. Daten exportieren, bevor Sie fortfahren.','Local storage is unreadable or full. Export data before continuing.')}<button onClick={()=>downloadJson('regulatory-recovery.json',storageError==='load'?localStorage.getItem(REGULATORY_KEY)??'{}':JSON.stringify(draft))}>{l('Daten sichern','Recover data')}</button></div>}
  {notice&&<p role="status" className="notice">{notice}</p>}

  {step===0&&<div className="regulatory-form">
   <p className="regulatory-lead">{regulatoryScenarios.find(s=>s.id===draft.scenarioId)!.purpose}</p>
   <div className="regulatory-questions">
    {useCase.contextFields.map(field=><div className="regulatory-fact" key={field.id}><label><span>{l(field.label.de,field.label.en)}</span><select value={draft.context[field.id]} disabled={busy||storageError==='load'} onChange={e=>save({...draft,context:{...draft.context,[field.id]:e.target.value}})}>{field.options.map(option=><option key={option.value} value={option.value}>{l(option.label.de,option.label.en)}</option>)}</select></label></div>)}
    {scopeIds.map(fact)}
   </div>
   <p className="view-note">{l(useCase.scopeNote.de,useCase.scopeNote.en)}</p>
   <div className="regulatory-next"><button className="analyze-button" onClick={()=>setStep(1)}>{l('Prüfung öffnen','Open assessment')}</button></div>
  </div>}

  {step===1&&<div className="regulatory-columns">
   <nav className="regulatory-checklist" aria-label={l('Prüfungen','Checks')}><table><thead><tr><th>{l('Prüfung','Check')}</th><th>{l('Stand','Status')}</th></tr></thead><tbody>{checks.map(c=><tr key={c.id} aria-current={c.id===selected?'true':undefined}><td><button aria-current={c.id===selected?'true':undefined} onClick={()=>setSelected(c.id)} disabled={busy}>{language==='de'?c.title:c.titleEn}</button></td><td data-outcome={outcomeOf(c.id)}>{status(outcomeOf(c.id))}</td></tr>)}</tbody></table></nav>
   <div className="regulatory-main">
    <header className="regulatory-check-heading"><div><h3>{language==='de'?check.title:check.titleEn}</h3><p>{language==='de'?check.action:check.actionEn}</p></div><span className="status-pill" data-tone={finding.outcome}>{status(finding.outcome)}</span></header>
    {finding.contradictions.length>0&&<p role="alert" className="notice error">{l('Widersprüchliche Angaben oder abweichende manuelle Bewertung. Klärung erforderlich.','Conflicting declarations or a differing human review require clarification.')}</p>}
    <div className="regulatory-questions">{finding.activeInputs.map(fact)}</div>

    <section className="regulatory-evidence" aria-label={l('Unternehmensbeleg (synthetisch)','Company evidence (synthetic)')}>
     <div className="regulatory-evidence-head"><h4>{l('Unternehmensbeleg (synthetisch)','Company evidence (synthetic)')}</h4><label>{l('Beleg auswählen','Select evidence')}<select disabled={busy} value={passage.id} onChange={e=>setEvidenceId(e.target.value)}>{passages.map(p=><option key={p.id} value={p.id}>{p.documentId} · {p.section}</option>)}</select></label></div>
     <blockquote className="comparison-description">{passage.text}</blockquote><p className="view-note">{passage.id} · {l('Zeilen','lines')} {passage.startLine}–{passage.endLine}</p>
     <details className="regulatory-human"><summary>{l('Manuelle Bewertung','Human review')}{review?' · '+evidenceLabel(review.judgment):''}</summary><label>{l('Aussage des Belegs','Evidence judgment')}<select value={reviewLabel} disabled={busy||storageError==='load'} onChange={e=>setReviewLabel(e.target.value as HumanReview['judgment'])}>{['supported','contradicted','insufficient_evidence','ambiguous','uncertain'].map(v=><option key={v} value={v}>{evidenceLabel(v)}</option>)}</select></label><label>{l('Kommentar','Comment')}<textarea value={comment} maxLength={1000} onChange={e=>setComment(e.target.value)}/></label><div className="button-row"><button disabled={busy||storageError==='load'} onClick={()=>save({...draft,reviews:{...draft.reviews,[reviewKey]:{judgment:reviewLabel,comment,updatedAt:new Date().toISOString()}}})}>{l('Bewertung speichern','Save review')}</button><button disabled={busy||!review||storageError==='load'} onClick={()=>{const reviews={...draft.reviews};delete reviews[reviewKey];save({...draft,reviews});}}>{l('Bewertung löschen','Clear review')}</button></div></details>
     <details className="regulatory-jev"><summary>{l('Jev-Belegprüfung','Jev evidence review')}</summary><p className="view-note">{l('Ein ausdrücklicher kostenpflichtiger Aufruf. Nur dieser synthetische Beleg und die zitierten Gesetzesauszüge werden gesendet. Keine automatische Änderung der Fakten oder Ergebnisse.','One explicit paid request. Sends only this synthetic passage and cited legal excerpts. Facts and checklist outcomes are not changed automatically.')}</p><div className="button-row"><button disabled={!ready||!liveEnabled||busy||!!storageError||draft.runs.length>=50} onClick={judge}>{l('Beleg mit Jev prüfen','Judge evidence with Jev')}</button>{busy&&<button onClick={()=>request.current?.abort()}>{l('Abbrechen','Cancel')}</button>}</div>{!liveEnabled&&<p className="view-note">{l('Jev-Aufrufe serverseitig deaktiviert.','Jev calls disabled on the server.')}</p>}{error&&<p role="alert" className="notice error">{error}</p>}
      {last&&<><p className="view-note">{last.assessment.response.model} · {last.assessment.latencyMs} ms · {last.assessment.requestId}</p>{Object.entries(last.assessment.response.answers).map(([name,answer])=><JevAnswerField key={name} name={name} answer={answer} criteria={last.assessment.request.questions[name as keyof typeof last.assessment.request.questions]?.criteria}/>)}<details><summary>JSON</summary><pre className="technical-json">{JSON.stringify(last,null,2)}</pre></details></>}
     </details>
    </section>

    <details className="regulatory-sources"><summary>{l('Rechtsgrundlage und Quellen','Legal reference and sources')} · {retrieval.hits.length} {l('Treffer','hits')}</summary>
     <label>{l('Suchmethode','Search method')}<select value={strategy} onChange={e=>setStrategy(e.target.value as 'text'|'graph')}><option value="text">{l('Textsuche','Text Search')}</option><option value="graph">{l('Graphsuche','Graph Search')}</option></select></label>
     <p className="view-note">{l('Suchtreffer sind Kandidaten. Kuratierte Prüfungszuordnungen sind keine bestätigte rechtliche Auslegung.','Search hits are candidates. Curated check mappings are not verified legal interpretations.')}</p>
     {retrieval.hits.length===0&&<p role="status">{l('Keine Treffer. Daraus folgt keine Nichtanwendbarkeit.','No hits. This does not establish non-applicability.')}</p>}
     {retrieval.hits.map(hit=>{const ref=regulatoryCorpus.citations.find(c=>c.id===hit.citationId)!,source=regulatoryCorpus.sources.find(s=>s.id===ref.sourceId)!;return <details key={ref.id} className="regulatory-citation"><summary>{ref.pinpoint} · PDF {ref.pdfPage} {check.citations.includes(ref.id)?l('· zugeordnet','· mapped'):''}</summary><blockquote>{ref.quote}</blockquote><a href={source.url} target="_blank" rel="noreferrer">{l('Amtliche Quelle öffnen','Open official source')}</a><p className="view-note">{source.filename} · {source.revision} · SHA-256 {source.sha256}</p><code>{ref.pageId} [{ref.start}, {ref.end})</code>{'path' in hit&&<p className="view-note">{hit.path.steps.length===0?l('Direkter Texttreffer','Direct text match'):`${l('Suchpfad','Search path')}: ${hit.path.steps.length} ${l('Schritte','steps')}`}</p>}</details>;})}
     <details><summary>{l('Suchpfade und Grenzen','Search paths and bounds')}</summary><pre className="technical-json">{JSON.stringify({diagnostics:retrieval.diagnostics,paths:retrieval.paths,relationships:retrieval.relationships},null,2)}</pre></details>
    </details>
   </div>
  </div>}

  {step===2&&<div className="regulatory-report">
   <div className="report-summary">
    <div><strong>{findings.length}</strong><span>{l('Prüfschritte','checks')}</span></div>
    <div data-tone="satisfied"><strong>{count('satisfied')}</strong><span>{l('dokumentiert','documented')}</span></div>
    <div data-tone="gap"><strong>{count('gap')}</strong><span>{l('Lücken','gaps')}</span></div>
    <div data-tone="unknown"><strong>{count('unknown')}</strong><span>{l('ungeklärt','unknown')}</span></div>
   </div>
   <table className="lab-table" aria-label={l('Prüfergebnisse','Assessment findings')}><thead><tr><th>{l('Prüfung','Check')}</th><th>{l('Stand','Status')}</th><th>{l('Nächste Aktion','Next action')}</th></tr></thead><tbody>{findings.map(f=><tr key={f.checkId}><td><button className="link-button" onClick={()=>{setSelected(f.checkId);setStep(1);}}>{language==='de'?checks.find(c=>c.id===f.checkId)!.title:checks.find(c=>c.id===f.checkId)!.titleEn}</button></td><td data-outcome={f.outcome}>{status(f.outcome)}</td><td>{f.outcome==='satisfied'?l('Dokumentation fachlich bestätigen.','Have documentation confirmed by a specialist.'):f.outcome==='not_applicable'?l('Ausschlussgrund und Umfang fachlich bestätigen.','Confirm exclusion rationale and scope.'):language==='de'?f.action:f.actionEn}</td></tr>)}</tbody></table>
   <p className="view-note">{useCase.limitations.map(item=>l(item.de,item.en)).join(' ')}</p>
   <div className="button-row">
    <button className="analyze-button" onClick={()=>downloadJson(useCase.reportFilename+'.json',JSON.stringify(regulatoryReport(draft),null,2))}>{l('Bericht als JSON','Export report JSON')}</button>
    <button onClick={()=>{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([regulatoryMarkdown(draft)],{type:'text/markdown;charset=utf-8'}));a.href=url;a.download=useCase.reportFilename+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>{l('Bericht als Markdown','Export report Markdown')}</button>
    <label className="file-import">{l('Bericht importieren','Import report')}<input type="file" accept="application/json,.json" disabled={busy||storageError==='load'} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>MAX_IMPORT_BYTES)throw Error();save(importRegulatoryReport(JSON.parse(await file.text())));setNotice(l('Bericht importiert.','Report imported.'));}catch{setNotice(l('Import abgelehnt: inkompatible Daten, veränderte Zitate oder widersprüchliche Ergebnisse.','Import rejected: incompatible data, changed citations or inconsistent findings.'));}}}/></label>
   </div>
   <details><summary>{l('Jev und manuelle Bewertungen auswerten','Evaluate Jev against human reviews')}</summary><p>{stats.agreements} / {stats.n} {l('Übereinstimmungen; nur bewertete Belege mit Jev-Ergebnis.','agreements; only reviewed passages with Jev results.')} {stats.excludedUncertain} {l('unsicher ausgeschlossen','uncertain excluded')}, {stats.excludedUnlabeled} {l('unbewertet ausgeschlossen','unlabeled excluded')}.</p><p>{l('Falsche Unterstützung','False support')}: {stats.falseSupport} · {l('Übersehene Widersprüche','Missed contradictions')}: {stats.missedContradictions}</p><pre className="technical-json">{JSON.stringify(stats,null,2)}</pre></details>
  </div>}

  <footer className="regulatory-more">
   <h3>{l('Weitere Werkzeuge','More tools')}</h3>
   <RegulatoryResearch draft={draft} disabled={busy||!ready||!!storageError}/>
   <details className="regulatory-inventory"><summary>{l('Quelleninventar und Prüfungsumfang','Source inventory and scope')} · {regulatoryCorpus.sources.length} PDF</summary><p className="view-note">{l('Nur ausgewählte Gesetzesauszüge sind durchsuchbar. BSI und BfDI sind im Inventar erfasst; keine automatischen Pflichten daraus. Quellen sind historische Stände, keine laufend aktualisierte Rechtsdatenbank.','Only selected legal excerpts are indexed. BSI and BfDI are inventoried; no automatic obligations are inferred. Sources are historical snapshots, not a continuously updated legal database.')}</p><table className="lab-table"><thead><tr><th>{l('Quelle','Source')}</th><th>{l('Stand','Revision')}</th><th>{l('Nutzung','Use')}</th></tr></thead><tbody>{regulatoryCorpus.sources.map(s=><tr key={s.id}><td><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · {s.pageCount} PDF {l('Seiten','pages')}<details><summary>SHA-256</summary><code>{s.sha256}</code></details></td><td>{s.revision}</td><td>{l(s.use==='selected excerpts'?'Ausgewählte Auszüge':'Nur Inventar',s.use==='selected excerpts'?'Selected excerpts':'Inventory only')}</td></tr>)}</tbody></table></details>
  </footer>
 </section>;
}
