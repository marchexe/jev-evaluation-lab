'use client';
import { useLanguage } from './LanguageProvider';
import { TranslatedText } from './TranslatedText';


import React, { useEffect, useRef, useState } from 'react';
import { downloadJson } from '../src/ui/history';
import { type EvidenceReview, type Passage } from '../src/ui/evidence';
import { EVIDENCE_RUNS_KEY, MAX_EVIDENCE_RUNS, resolveEvidenceTarget, judgmentCategories,
  readEvidenceRuns, writeEvidenceRuns, validateEvidenceResult, evaluateEvidenceRuns, exportEvidenceExperiment,
  type EvidenceRun } from '../src/ui/evidence-runs';
import { JevAnswerField } from './JevAssessmentCard';
import type { EvidenceSearchSnapshot } from '../src/ui/evidence-graph';
import { defaultConfigurations, configurationIdentity } from '../src/question-config.js';
import { QuestionEditor, type QuestionConfiguration } from './QuestionEditor';
import { importEvidenceExperiment, MAX_IMPORT_BYTES, parseImport } from '../src/ui/import-export';

export function EvidenceJudgments({ reviews, reviewsAvailable, passages, controlId, liveEnabled, summaryOnly, compact = false, onRunningChange, search, onImport }: {
  reviews: EvidenceReview[]; reviewsAvailable: boolean; passages: Passage[]; controlId: string; liveEnabled: boolean; summaryOnly: boolean;
  compact?: boolean;
  search?: EvidenceSearchSnapshot;
  onImport: (runs: EvidenceRun[], reviews: EvidenceReview[]) => void;
  onRunningChange: (running: boolean) => void;
}) {
  const { t, displayLabel, translatedLabel } = useLanguage();
  const [runs, setRuns] = useState<EvidenceRun[]>([]); const [ready, setReady] = useState(false);
  const [caseId, setCaseId] = useState(''); const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [storageError, setStorageError] = useState(''); const [loadFailed, setLoadFailed] = useState(false);
  const [configuration, setConfiguration] = useState<QuestionConfiguration>(defaultConfigurations.evidence);
  const [configurationFilter, setConfigurationFilter] = useState(configurationIdentity(defaultConfigurations.evidence));
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    try { setRuns(readEvidenceRuns(localStorage)); }
    catch { setLoadFailed(true); setStorageError('Gespeicherte Läufe ungültig oder inkompatibel. Daten unverändert.'); }
    setReady(true);
    return () => { controller.current?.abort(); onRunningChange(false); };
  }, [onRunningChange]);
  const available = passages.map(passage => resolveEvidenceTarget({ passageId: passage.id, controlId }));
  const selected = available.find((entry) => entry.id === caseId) ?? available[0];
  const selectedCase = selected;
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
    const abort = new AbortController(); controller.current = abort; setBusy(true); onRunningChange(true); setMessage(''); setMessageError(false);
    const humanReviewAtRequest = reviews.find((entry) => entry.controlId === controlId && entry.passage.id === selectedCase.passage.id) ?? null;
    try {
      const response = await fetch('/api/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passageId: selectedCase.passage.id, controlId, live: true,
          ...(configurationIdentity(configuration) === configurationIdentity(defaultConfigurations.evidence) ? {} : { questionConfiguration: configuration }) }), signal: abort.signal });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error((result as { error?: string }).error ?? 'Jev-Anfrage fehlgeschlagen.');
      validateEvidenceResult(result);
      if (result.caseId !== selectedCase.id || abort.signal.aborted) throw new Error('Antwort passt nicht zum ausgewählten Fall.');
      if (configurationIdentity(result.questionConfiguration ?? defaultConfigurations.evidence) !== configurationIdentity(configuration)) throw new Error('Antwortkonfiguration stimmt nicht mit der Anfrage überein.');
      const next = [...runs, { id: crypto.randomUUID(), result, humanReviewAtRequest }];
      setRuns(next);
      setConfigurationFilter(configurationIdentity(configuration));
      try { writeEvidenceRuns(localStorage, next); }
      catch { setStorageError('Antwort erhalten, Speichern fehlgeschlagen. Experiment exportieren.'); }
    } catch (error) {
      setMessageError(!abort.signal.aborted);
      setMessage(abort.signal.aborted ? 'Abgebrochen. Kosten können bereits entstanden sein.' : error instanceof Error ? error.message : 'Belegbewertung fehlgeschlagen.');
    } finally { controller.current = null; setBusy(false); onRunningChange(false); }
  }
  return <section aria-label={t("Jev-Belegbewertung")} className="comparison-field evidence-judgment-panel">
    <div className="view-heading"><h3>{t("Jev-Belegbewertung")}</h3>
      <button disabled={!ready || loadFailed || !reviewsAvailable} onClick={() => downloadJson('jev-evidence-experiment.json', exportEvidenceExperiment(runs, reviews, model, search, evaluatedConfiguration))}>{t("Experiment exportieren")}</button></div>
    <details className="run-management"><summary>{t("Gespeicherte Läufe")}</summary>
    <label>{t("Experiment importieren (JSON)")}<input type="file" accept="application/json,.json" disabled={busy || !ready || loadFailed || !reviewsAvailable || !!storageError} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try { if (file.size > MAX_IMPORT_BYTES) throw new Error('Datei größer als 2 MB.');
        const next = importEvidenceExperiment(parseImport(await file.text()), runs, reviews); onImport(next.runs, next.reviews); setRuns(next.runs); setMessageError(false); setMessage('Experiment importiert.');
      } catch (failure) { setMessageError(true); setMessage(failure instanceof Error ? failure.message : 'Import fehlgeschlagen. Daten unverändert.'); }
    }} /></label>
    <button disabled={busy || (!runs.length && !loadFailed)} onClick={() => { if (!window.confirm('Jev-Läufe löschen? Manuelle Bewertungen bleiben erhalten.')) return; try { writeEvidenceRuns(localStorage, []); setRuns([]); setModel(''); setLoadFailed(false); setStorageError(''); } catch { setStorageError('Läufe konnten nicht gelöscht werden.'); } }}>{t("Jev-Läufe löschen")}</button>
    </details>
    <p className="view-note">{runs.length} {t("gespeicherte Läufe. Manuelle Labels werden nicht an Jev übermittelt.")}</p>
    {storageError && <p role="alert" className="notice error">{storageError} <button onClick={() => { try { downloadJson('jev-evidence-runs-storage.json', localStorage.getItem(EVIDENCE_RUNS_KEY) ?? 'null'); } catch { setMessage('Browserspeicher nicht verfügbar.'); } }}>{t("Gespeicherte Jev-Läufe exportieren")}</button></p>}
    {message && <p role={messageError ? 'alert' : 'status'} className={`notice ${messageError ? 'error' : ''}`}>{t(message)}</p>}
    {busy && <p role="status" className="loading-state"><span className="spinner" />{t("Jev bewertet…")}</p>}
    {!reviewsAvailable && <p role="status" className="notice">{t("Bewertungen nicht verfügbar. Vergleich und Gesamtexport gesperrt.")}</p>}
    {ready && !runs.length && !loadFailed && <p className="empty-results">{t("Noch keine Jev-Läufe. Abschnitt bewerten oder Experiment importieren.")}</p>}
    {!summaryOnly && <>
      <QuestionEditor kind="evidence" disabled={busy} onApply={setConfiguration} />
      {!compact && <><label>{t("Abschnitt")}<select value={selected?.id ?? ''} disabled={busy} onChange={(event) => setCaseId(event.target.value)}>
        {!available.length && <option value="">{t("Kein Abschnitt ausgewählt")}</option>}
        {available.map((entry) => <option key={entry.id} value={entry.id}>{translatedLabel(entry.passage.section)} · {t('Version')} {entry.passage.revision}</option>)}
      </select></label>
      {selectedCase && <blockquote className="comparison-description"><TranslatedText text={selectedCase.passage.text} /></blockquote>}
      </>}
      <p className="view-note">{t("Ein kostenpflichtiger Aufruf für diesen Abschnitt. Keine Wiederholungen.")}</p>
      <button disabled={!ready || !reviewsAvailable || !liveEnabled || busy || loadFailed || !!storageError || !selectedCase || runs.length >= MAX_EVIDENCE_RUNS} onClick={judge}>{t("Mit Jev bewerten")}</button>
      {busy && <button onClick={() => controller.current?.abort()}>{t("Abbrechen")}</button>}
      {!liveEnabled && <p className="view-note">{t("Jev-Aufrufe deaktiviert.")}</p>}
      {selectedCase && model && !last && <p className="view-note">{t("Kein Ergebnis für diesen Filter.")}</p>}
      {last && <section aria-label={t("Selected Jev result")}>
        {last.result.recordingSource && <p className="notice">{t("Aufzeichnung · kein neuer Jev-Aufruf.")}</p>}
        <p className="view-note">{t("Modell:")} {last.result.assessment.response.model} {t("· Anfrage")} {last.result.assessment.requestId} · {last.result.assessment.latencyMs} {t("ms · Eingabe")} {last.result.assessment.response.usage.input_tokens ?? 'Fehlt'} {t("/ Ausgabe")} {last.result.assessment.response.usage.output_tokens ?? 'Fehlt'} {t("tokens ·")} {last.result.questionVersion}</p>
        {Object.entries(last.result.assessment.response.answers).map(([name, answer]) => <JevAnswerField key={name} name={name} answer={answer} criteria={last.result.assessment.request.questions[name as keyof typeof last.result.assessment.request.questions]?.criteria} />)}
        <details><summary>{t("Originalantwort (JSON)")}</summary><pre className="technical-json">{JSON.stringify(last.result, null, 2)}</pre></details>
      </section>}
    </>}
    <details className="evaluation-details" open={summaryOnly || undefined}><summary>{t("Jev und manuelle Bewertungen")}</summary>
    <label>{t("Modellfilter")}<select value={model} disabled={busy} onChange={(event) => setModel(event.target.value)}><option value="">{t("Alle Modelle")}</option>{models.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>{t("Fragenkonfiguration")}<select aria-label={t("Fragenkonfiguration")} value={configurationIdentity(evaluatedConfiguration)} disabled={busy} onChange={(event) => setConfigurationFilter(event.target.value)}>
      {configurations.map((c, i) => <option key={configurationIdentity(c)} value={configurationIdentity(c)}>{c.version} {t("· Konfiguration")} {i + 1}</option>)}</select></label>
    <p className="view-note">{t("Letzter Lauf pro Fall und Konfiguration. Unsichere oder fehlende manuelle Labels sind ausgeschlossen.")}</p>
    {stats && <>
    <p className="view-note">{t("Feste Referenzfälle:")} {stats.fixedCases}{t("; davon ohne Vorhersage:")} {stats.missingPredictions}{t("; zusätzliche bewertete Abschnitte:")} {stats.additionalPassages}.</p>
    <p aria-live="polite" className="view-note">{t("Übereinstimmung:")} {stats.agreements} / {stats.n} {stats.agreementRate === null ? t("(nicht verfügbar)") : `(${String(stats.agreementRate)})`} {t("· Abweichungen:")} {stats.disagreements} {t("· unsicher ausgeschlossen:")} {stats.excludedUncertain} {t("· unbewertet ausgeschlossen:")} {stats.excludedUnlabeled} {t("· ohne Vorhersage:")} {stats.missingPredictions}{t(". Falsche Zustimmung:")} {stats.falseSupport}{t("; übersehene Widersprüche:")} {stats.missedContradictions}.</p>
    <div className="table-scroll"><table className="lab-table" aria-label={t("Evidence confusion matrix")}><thead><tr><th>{t("Manuell ↓ / Jev →")}</th>{judgmentCategories.map((category) => <th key={category}>{displayLabel(category)}</th>)}</tr></thead>
      <tbody>{judgmentCategories.map((expected) => <tr key={expected}><th>{displayLabel(expected)}</th>{judgmentCategories.map((predicted) => <td key={predicted}>{stats.matrix[expected][predicted]}</td>)}</tr>)}</tbody></table></div>
    <div className="table-scroll"><table className="lab-table" aria-label={t("Evidence category errors")}><thead><tr><th>{t("Kategorie")}</th><th>{t("Manuelle Labels (n)")}</th><th>{t("Falsch positiv")}</th><th>{t("Falsch negativ")}</th></tr></thead><tbody>{stats.perCategory.map((row) => <tr key={row.category}><th>{displayLabel(row.category)}</th><td>{row.expectedCount}</td><td>{row.falsePositives}</td><td>{row.falseNegatives}</td></tr>)}</tbody></table></div>
    <details><summary>{t("Verglichene Fälle (")}{stats.rows.length}{t("); abweichende Abschnitte (")}{stats.errors.length})</summary>
      {stats.rows.map((row) => <section key={row.runId}><h4>{row.caseId}: {row.expected === null || row.expected === 'uncertain' ? t("Ausgeschlossen") : row.expected === row.predicted ? t("Übereinstimmung") : t("Abweichung")}</h4>
        <p className="view-note">{t("Manuell:")} {row.expected ? displayLabel(row.expected) : t("Unbewertet")} {t("· Jev:")} {displayLabel(row.predicted)} {t("· Lauf")} {row.runId} · {row.passage.documentId}@{row.passage.revision} / {translatedLabel(row.passage.section)} / [{row.passage.start}, {row.passage.end})</p>
        <blockquote className="comparison-description"><TranslatedText text={row.passage.text} /></blockquote></section>)}
    </details>
    </>}

    </details>
    <p className="view-note">{t("Deskriptiver Vergleich, keine validierte Genauigkeit. Suchqualität wird getrennt ausgewertet.")}</p>
  </section>;
}
