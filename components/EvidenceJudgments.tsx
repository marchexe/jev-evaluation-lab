'use client';
import React, { useEffect, useRef, useState } from 'react';
import { downloadJson } from '../src/ui/history';
import { type EvidenceReview, type Passage } from '../src/ui/evidence';
import { EVIDENCE_RUNS_KEY, MAX_EVIDENCE_RUNS, experiment, resolveEvidenceCase, judgmentCategories,
  readEvidenceRuns, writeEvidenceRuns, validateEvidenceResult, evaluateEvidenceRuns, exportEvidenceExperiment,
  type EvidenceRun } from '../src/ui/evidence-runs';
import { JevAnswerField } from './JevAssessmentCard';
import type { EvidenceSearchSnapshot } from '../src/ui/evidence-graph';
import { defaultConfigurations, configurationIdentity } from '../src/question-config.js';
import { QuestionEditor, type QuestionConfiguration } from './QuestionEditor';
import { importEvidenceExperiment, MAX_IMPORT_BYTES, parseImport } from '../src/ui/import-export';

export function EvidenceJudgments({ reviews, reviewsAvailable, passages, controlId, liveEnabled, summaryOnly, onRunningChange, search, onImport }: {
  reviews: EvidenceReview[]; reviewsAvailable: boolean; passages: Passage[]; controlId: string; liveEnabled: boolean; summaryOnly: boolean;
  search?: EvidenceSearchSnapshot;
  onImport: (runs: EvidenceRun[], reviews: EvidenceReview[]) => void;
  onRunningChange: (running: boolean) => void;
}) {
  const [runs, setRuns] = useState<EvidenceRun[]>([]); const [ready, setReady] = useState(false);
  const [caseId, setCaseId] = useState(''); const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [storageError, setStorageError] = useState(''); const [loadFailed, setLoadFailed] = useState(false);
  const [configuration, setConfiguration] = useState<QuestionConfiguration>(defaultConfigurations.evidence);
  const [configurationFilter, setConfigurationFilter] = useState(configurationIdentity(defaultConfigurations.evidence));
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    try { setRuns(readEvidenceRuns(localStorage)); }
    catch { setLoadFailed(true); setStorageError('Stored Jev runs are invalid or incompatible. They have not been overwritten.'); }
    setReady(true);
    return () => { controller.current?.abort(); onRunningChange(false); };
  }, [onRunningChange]);
  const available = experiment.cases.filter((entry) => entry.controlId === controlId && passages.some((passage) => passage.id === resolveEvidenceCase(entry.id).passage.id));
  const selected = available.find((entry) => entry.id === caseId) ?? available[0];
  const selectedCase = selected && resolveEvidenceCase(selected.id);
  const configurations = [defaultConfigurations.evidence, ...runs.map((run) => run.result.questionConfiguration ?? defaultConfigurations.evidence)]
    .filter((c, i, all) => all.findIndex((item) => configurationIdentity(item) === configurationIdentity(c)) === i);
  const evaluatedConfiguration = configurations.find((c) => configurationIdentity(c) === configurationFilter) ?? defaultConfigurations.evidence;
  const selectedRuns = runs.filter((run) => run.result.caseId === selected?.id && (!model || run.result.assessment.response.model === model)
    && configurationIdentity(run.result.questionConfiguration ?? defaultConfigurations.evidence) === configurationIdentity(evaluatedConfiguration));
  const last = selectedRuns[selectedRuns.length - 1];
  const stats = reviewsAvailable && ready && !loadFailed ? evaluateEvidenceRuns(runs, reviews, model, evaluatedConfiguration) : null;
  const models = [...new Set(runs.map((run) => run.result.assessment.response.model))];
  async function judge() {
    if (!selectedCase || controller.current || !liveEnabled || !ready || !reviewsAvailable || loadFailed || storageError || runs.length >= MAX_EVIDENCE_RUNS) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); onRunningChange(true); setMessage('');
    const humanReviewAtRequest = reviews.find((entry) => entry.controlId === controlId && entry.passage.id === selectedCase.passage.id) ?? null;
    try {
      const response = await fetch('/api/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: selectedCase.id, live: true,
          ...(configurationIdentity(configuration) === configurationIdentity(defaultConfigurations.evidence) ? {} : { questionConfiguration: configuration }) }), signal: abort.signal });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error((result as { error?: string }).error ?? 'Jev evidence request failed.');
      validateEvidenceResult(result);
      if (result.caseId !== selectedCase.id || abort.signal.aborted) throw new Error('Result did not match the selected case.');
      if (configurationIdentity(result.questionConfiguration ?? defaultConfigurations.evidence) !== configurationIdentity(configuration)) throw new Error('Result configuration differs from the executed question configuration.');
      const next = [...runs, { id: crypto.randomUUID(), result, humanReviewAtRequest }];
      setRuns(next);
      setConfigurationFilter(configurationIdentity(configuration));
      try { writeEvidenceRuns(localStorage, next); }
      catch { setStorageError('Jev answered, but browser storage failed. Export the experiment before leaving; the response is retained on this page.'); }
    } catch (error) {
      setMessage(abort.signal.aborted ? 'Request cancelled; it may already have incurred usage. No retry was made.' : error instanceof Error ? error.message : 'Evidence request failed.');
    } finally { controller.current = null; setBusy(false); onRunningChange(false); }
  }
  return <section aria-label="Jev evidence judgments" className="comparison-field evidence-judgment-panel">
    <div className="view-heading"><h3>Jev evidence judgments</h3>
      <button disabled={!ready || loadFailed || !reviewsAvailable} onClick={() => downloadJson('jev-evidence-experiment.json', exportEvidenceExperiment(runs, reviews, model, search, evaluatedConfiguration))}>Export complete experiment</button></div>
    <label>Import evidence experiment JSON<input type="file" accept="application/json,.json" disabled={busy || !ready || loadFailed || !reviewsAvailable || !!storageError} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try { if (file.size > MAX_IMPORT_BYTES) throw new Error('File exceeds 2 MB.');
        const next = importEvidenceExperiment(parseImport(await file.text()), runs, reviews); onImport(next.runs, next.reviews); setRuns(next.runs); setMessage('Experiment imported; no inference started.');
      } catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Import failed; existing data was not replaced.'); }
    }} /></label>
    <p className="view-note">Fixed experiment {experiment.id}: {experiment.cases.length} cases; {runs.length} saved runs. Human labels are not supplied to Jev. A supported result is not verified compliance.</p>
    {storageError && <p role="alert" className="notice error">{storageError} <button onClick={() => { try { downloadJson('jev-evidence-runs-storage.json', localStorage.getItem(EVIDENCE_RUNS_KEY) ?? 'null'); } catch { setMessage('Browser storage is unavailable.'); } }}>Export stored Jev runs</button></p>}
    {message && <p role="status" className="notice">{message}</p>}
    {!reviewsAvailable && <p role="status" className="notice">Human reviews are unavailable. Classification comparison and complete experiment export are disabled until valid reviews can be loaded or saved.</p>}
    {!summaryOnly && <>
      <QuestionEditor kind="evidence" disabled={busy} onApply={setConfiguration} />
      <label>Passage to judge<select value={selected?.id ?? ''} disabled={busy} onChange={(event) => setCaseId(event.target.value)}>
        {!available.length && <option value="">No fixed experiment case in visible passages</option>}
        {available.map((entry) => <option key={entry.id} value={entry.id}>{entry.id} · {entry.documentId}</option>)}
      </select></label>
      {selectedCase && <blockquote className="comparison-description">{selectedCase.passage.text}</blockquote>}
      <p className="view-note">One explicit paid request for the selected passage and control; no batch calls or retries. To judge retrieval misses, inspect all source passages. Results do not transfer between cases.</p>
      <button disabled={!ready || !reviewsAvailable || !liveEnabled || busy || loadFailed || !!storageError || !selectedCase || runs.length >= MAX_EVIDENCE_RUNS} onClick={judge}>Judge selected passage with Jev</button>
      {busy && <button onClick={() => controller.current?.abort()}>Cancel evidence request</button>}
      {!liveEnabled && <p className="view-note">Live inference is disabled on this server; saved runs and evaluation remain available.</p>}
      {selectedCase && model && !last && <p className="view-note">No saved result for this passage and actual-model filter.</p>}
      {last && <section aria-label="Selected Jev result">
        <p className="view-note">Actual model: {last.result.assessment.response.model} · request {last.result.assessment.requestId} · {last.result.assessment.latencyMs} ms · input {last.result.assessment.response.usage.input_tokens ?? 'missing'} / output {last.result.assessment.response.usage.output_tokens ?? 'missing'} tokens · {last.result.questionVersion}</p>
        {Object.entries(last.result.assessment.response.answers).map(([name, answer]) => <JevAnswerField key={name} name={name} answer={answer} criteria={last.result.assessment.request.questions[name as keyof typeof last.result.assessment.request.questions]?.criteria} />)}
        <details><summary>Original Jev evidence result</summary><pre className="technical-json">{JSON.stringify(last.result, null, 2)}</pre></details>
      </section>}
    </>}
    <label>Actual model filter<select value={model} disabled={busy} onChange={(event) => setModel(event.target.value)}><option value="">All actual models (pooled)</option>{models.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>Question configuration filter<select aria-label="Question configuration filter" value={configurationIdentity(evaluatedConfiguration)} disabled={busy} onChange={(event) => setConfigurationFilter(event.target.value)}>
      {configurations.map((c, i) => <option key={configurationIdentity(c)} value={configurationIdentity(c)}>{c.version} · configuration {i + 1}</option>)}</select></label>
    <p className="view-note">Latest run per case after actual-model and exact configuration-content/version filters, compared with current saved human reviews. Different configurations are never pooled. Reviewer Uncertain is excluded; Ambiguous evidence is a classification category. No Noul threshold alters the Choice prediction.</p>
    {stats && <>
    <p aria-live="polite" className="view-note">Agreement: {stats.agreements} / {stats.n} {stats.agreementRate === null ? '(not available)' : `(${String(stats.agreementRate)})`} · disagreements: {stats.disagreements} · excluded uncertain: {stats.excludedUncertain} · excluded unlabeled: {stats.excludedUnlabeled} · cases without predictions: {stats.missingPredictions}. False support: {stats.falseSupport}; missed contradictions: {stats.missedContradictions}.</p>
    <div className="table-scroll"><table className="lab-table" aria-label="Evidence confusion matrix"><thead><tr><th>Human ↓ / Jev →</th>{judgmentCategories.map((category) => <th key={category}>{category}</th>)}</tr></thead>
      <tbody>{judgmentCategories.map((expected) => <tr key={expected}><th>{expected}</th>{judgmentCategories.map((predicted) => <td key={predicted}>{stats.matrix[expected][predicted]}</td>)}</tr>)}</tbody></table></div>
    <div className="table-scroll"><table className="lab-table" aria-label="Evidence category errors"><thead><tr><th>Category</th><th>Human examples (n)</th><th>False positives</th><th>False negatives</th></tr></thead><tbody>{stats.perCategory.map((row) => <tr key={row.category}><th>{row.category}</th><td>{row.expectedCount}</td><td>{row.falsePositives}</td><td>{row.falseNegatives}</td></tr>)}</tbody></table></div>
    <details><summary>Cases compared ({stats.rows.length}); disagreement passages ({stats.errors.length})</summary>
      {stats.rows.map((row) => <section key={row.runId}><h4>{row.caseId}: {row.expected === null || row.expected === 'uncertain' ? 'excluded' : row.expected === row.predicted ? 'agreement' : 'disagreement'}</h4>
        <p className="view-note">Human: {row.expected ?? 'unlabeled'} · Jev: {row.predicted} · run {row.runId} · {row.passage.documentId}@{row.passage.revision} / {row.passage.section} / [{row.passage.start}, {row.passage.end})</p>
        <blockquote className="comparison-description">{row.passage.text}</blockquote></section>)}
    </details>
    </>}
    <button disabled={busy || (!runs.length && !loadFailed)} onClick={() => { if (!window.confirm('Clear saved Jev evidence runs? Export first. Human reviews are kept.')) return; try { writeEvidenceRuns(localStorage, []); setRuns([]); setModel(''); setLoadFailed(false); setStorageError(''); } catch { setStorageError('Could not clear saved runs.'); } }}>Clear saved Jev runs</button>
    <p className="view-note">These are descriptive agreement/error counts for reviewed cases, not validated accuracy. Retrieval judgments and retrieval-miss counts above are separate from classification.</p>
  </section>;
}
