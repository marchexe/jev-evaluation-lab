'use client';
import { useLanguage } from './LanguageProvider';
import { TranslatedText } from './TranslatedText';
import { translationFor } from './translations';


import React, { useState } from 'react';
import type { AssessmentRecord } from '../src/ui/types';
import { compareAssessments, type difference } from '../src/ui/comparison';
import { evaluateRecords } from '../src/ui/evaluation';
import { reviewCount } from '../src/ui/reviews';
import { downloadJson, exportHistory } from '../src/ui/history';
import { configurationIdentity } from '../src/question-config.js';

function value(value: unknown) { return value == null ? 'Fehlt' : String(value); }
function delta(value: number | null) { return value == null ? 'Fehlt' : value > 0 ? `+${value}` : String(value); }
type Difference = ReturnType<typeof difference>;

function DifferenceRow({ label, data }: { label: string; data: Difference }) {
  const { t, displayLabel } = useLanguage();
  return <tr><th scope="row">{label}</th><td className="number">{typeof data.left === 'string' ? displayLabel(data.left) : value(data.left)}</td><td className="number">{typeof data.right === 'string' ? displayLabel(data.right) : value(data.right)}</td>
    <td className="number">{data.delta === null && data.status !== 'missing' ? <span title={t("Kategorien haben keine numerische Differenz")}>—</span> : delta(data.delta)}</td><td><span className={`difference-status ${data.status}`}>{displayLabel(data.status)}</span></td></tr>;
}

function RecordMetadata({ record, side }: { record: AssessmentRecord; side: string }) {
  const { t } = useLanguage();
  const result = record.assessment;
  return <section><h3>{side} · {record.id}</h3><pre className="comparison-description"><TranslatedText text={record.description} /></pre>
    <dl className="metadata-grid"><div><dt>{t("Modell")}</dt><dd>{result.response.model}</dd></div><div><dt>{t("Anfrage-ID")}</dt><dd>{value(result.requestId)}</dd></div>
      <div><dt>{t("Zeitpunkt")}</dt><dd>{record.timestamp}</dd></div><div><dt>{t("Angefragtes Modell")}</dt><dd>{result.request.model}</dd></div>
      <div><dt>{t("SDK-Version")}</dt><dd>{result.sdkVersion}</dd></div><div><dt>{t("Profil")}</dt><dd>{result.profile}</dd></div></dl>
    <details><summary>{t("Original")} {side} JSON</summary><pre className="technical-json">{JSON.stringify(result, null, 2)}</pre></details>
  </section>;
}

export function CompareView({ records }: { records: AssessmentRecord[] }) {
  const { t, language, displayLabel } = useLanguage();
  const [leftId, setLeftId] = useState(''); const [rightId, setRightId] = useState('');
  const left = records.find((record) => record.id === leftId) ?? records[0];
  const right = records.find((record) => record.id === rightId) ?? records[1];
  const comparison = left && right && left.id !== right.id ? compareAssessments(left.assessment, right.assessment) : null;
  return <section className="lab-view" aria-label={t("Analysen vergleichen")}><h2>{t("Analysen vergleichen")}</h2>
    <p className="view-note">{t("Differenz B − A. Fehlende Werte bleiben offen.")}</p>
    <div className="comparison-selectors">{(['A', 'B'] as const).map((side) => <label key={side}>{t("Analyse")} {side}
      <select aria-label={`Assessment ${side}`} value={(side === 'A' ? left : right)?.id ?? ''} onChange={(event) => (side === 'A' ? setLeftId : setRightId)(event.target.value)}>
        <option value="" disabled>{t("Analyse wählen")}</option>{records.map((record) => <option key={record.id} value={record.id}>{record.id.slice(0, 8)} · {record.assessment.response.model} · {(language === 'de' ? translationFor(record.description) ?? t('Originalbeschreibung') : record.description).slice(0, 70)}</option>)}
      </select></label>)}</div>
    {!comparison || !left || !right ? <p className="empty-results">{t("Zwei gespeicherte Analysen wählen.")}</p> : <>
      <div className="comparison-descriptions"><RecordMetadata record={left} side="A" /><RecordMetadata record={right} side="B" /></div>
      {comparison.fields.map((field) => <section key={field.name} className="comparison-field">
        <h3><span>{displayLabel(field.name)}</span><span className={`difference-status ${field.status}`}>{displayLabel(field.status)}</span></h3>
        {field.definitionChanged && <p className="uncertainty-note">{t("Abweichende Fragen oder Rubriken. Werte nur deskriptiv vergleichbar.")}</p>}
        {field.status === 'type_mismatch' ? <p className="view-note">{t("Fragetypen unterscheiden sich. Kein Zahlenvergleich.")}</p> : <div className="table-scroll"><table className="lab-table">
          <thead><tr><th>{t("Wert")}</th><th>{t("A")}</th><th>{t("B")}</th><th>{t("Δ B − A")}</th><th>{t("Status")}</th></tr></thead><tbody>
            <DifferenceRow label={field.type === 'choice' ? t("Vorhersage") : field.type === 'noul' ? 'Noul' : 'Score'} data={field.prediction} />
            {field.type !== 'noul' && <DifferenceRow label={t("Konfidenz")} data={field.confidence} />}
            {field.probabilities.map((probability) => <tr key={probability.label}><th scope="row"><span title={probability.label}>{displayLabel(probability.label)}</span></th>
              <td className="number">{value(probability.left)}{typeof probability.left === 'number' && <meter min={0} max={1} value={probability.left} aria-label={`A ${probability.label} probability`} />}</td>
              <td className="number">{value(probability.right)}{typeof probability.right === 'number' && <meter min={0} max={1} value={probability.right} aria-label={`B ${probability.label} probability`} />}</td>
              <td className="number">{delta(probability.delta)}</td><td><span className={`difference-status ${probability.status}`}>{displayLabel(probability.status)}</span></td></tr>)}
          </tbody></table></div>}
      </section>)}
      <h3 className="section-title">{t("Laufdaten")}</h3><div className="table-scroll"><table className="lab-table"><thead><tr><th>{t("Kennzahl")}</th><th>{t("A")}</th><th>{t("B")}</th><th>{t("Δ B − A")}</th><th>{t("Status")}</th></tr></thead><tbody>
        <DifferenceRow label={t("Latenz (ms)")} data={comparison.latencyMs} /><DifferenceRow label={t("Eingabe-Tokens")} data={comparison.inputTokens} /><DifferenceRow label={t("Ausgabe-Tokens")} data={comparison.outputTokens} />
      </tbody></table></div>
    </>}
  </section>;
}

export function AssessmentTable({ records, onOpen }: { records: AssessmentRecord[]; onOpen: (record: AssessmentRecord) => void }) {
  const { t, language, displayLabel } = useLanguage();
  return !records.length ? <p className="empty-results">{t("Keine gespeicherten Analysen.")}</p> : <div className="table-scroll"><table className="lab-table case-table">
    <thead><tr><th>{t("Analyse / Beschreibung")}</th><th>{t("Modell / Zeitpunkt")}</th><th>{t("Bewertete Felder")}</th><th>{t("Gesamtbewertung")}</th><th>{t("Aktion")}</th></tr></thead>
    <tbody>{records.map((record) => <tr key={record.id}><td><code>{record.id.slice(0, 8)}</code><details><summary>{(language === 'de' ? translationFor(record.description) ?? t('Originalbeschreibung') : record.description).slice(0, 85)}</summary><p><TranslatedText text={record.description} /></p></details></td>
      <td><code>{record.assessment.response.model}</code><div className="muted">{record.timestamp}</div></td>
      <td>{reviewCount(record)} / {Object.keys(record.assessment.response.answers).length}</td><td>{displayLabel(record.feedback.rating)}</td>
      <td><button type="button" onClick={() => onOpen(record)} aria-label={`Open assessment ${record.id}`}>{t("Öffnen")}</button></td></tr>)}</tbody>
  </table></div>;
}

export function EvaluationView({ records, onOpen }: { records: AssessmentRecord[]; onOpen: (record: AssessmentRecord) => void }) {
  const { t, displayLabel } = useLanguage();
  const [model, setModel] = useState(''); const [questionKey, setQuestionKey] = useState('');
  const configurations = [...new Map(records.map((r) => [configurationIdentity(r.assessment.request.questions), r.assessment])).entries()];
  const selected = records.filter((r) => (!model || r.assessment.response.model === model)
    && (!questionKey || configurationIdentity(r.assessment.request.questions) === questionKey));
  const stats = evaluateRecords(selected);
  const fields = [...new Set(records.flatMap((record) => Object.keys(record.assessment.response.answers)))];
  if (!records.length) return <section className="lab-view evaluation-view" aria-label={t("Auswertung")}><div className="analysis-empty"><h3>{t("Keine Analysen")}</h3><p>{t("Analyse erstellen oder im Verlauf importieren. Für Kennzahlen zuerst Felder manuell bewerten.")}</p></div></section>;
  return <section className="lab-view evaluation-view" aria-label={t("Auswertung")}><div className="view-heading">
    <button disabled={!records.length} onClick={() => downloadJson('jev-evaluation.json', exportHistory(records))}>{t("Analysen und Bewertungen exportieren")}</button></div>
    <p className="view-note">{t("Nur manuell bewertete Felder. Modelle und Fragen mit den Filtern eingrenzen. Keine validierte Genauigkeit.")}</p>
    <div className="evaluation-overview" aria-label={t('Auswertungsübersicht')}>
      <div><span>{t('Bewertete Analysen')}</span><strong>{stats.reviewedAssessments} / {stats.savedAssessments}</strong></div>
      <div><span>{t('Choice-Abweichungen')}</span><strong>{stats.choiceAgreement.n ? stats.choiceAgreement.n - stats.choiceAgreement.matches : '—'} / {stats.choiceAgreement.n}</strong><small>{t('Felder mit Erwartungslabel')}</small></div>
      <div><span>{t('Mittlerer absoluter Score-Fehler')}</span><strong>{stats.scoreAbsoluteError.mean == null ? '—' : String(stats.scoreAbsoluteError.mean)}</strong><small>n = {stats.scoreAbsoluteError.n} · {t('Felder mit erwarteter Stufe')}</small></div>
    </div>
    <h3 className="section-title">{t("Analysen")}</h3><AssessmentTable records={selected} onOpen={onOpen} />
    <details className="evaluation-metrics"><summary>{t('Filter und vollständige Metriken')}</summary>
    <div className="comparison-selectors"><label>{t("Modell")}<select value={model} onChange={(e) => setModel(e.target.value)}><option value="">{t("Alle Modelle")}</option>{[...new Set(records.map((r) => r.assessment.response.model))].map((m) => <option key={m}>{m}</option>)}</select></label>
      <label>{t("Fragen")}<select value={questionKey} onChange={(e) => setQuestionKey(e.target.value)}><option value="">{t("Alle Fragen")}</option>{configurations.map(([key, assessment], i) => <option key={key} value={key}>{(assessment as AssessmentRecord['assessment'] & { questionConfiguration?: { version: string } }).questionConfiguration?.version ?? t('Originalfragen')} {t("· Definition")} {i + 1}</option>)}</select></label></div>
    <div className="table-scroll"><table className="lab-table" aria-label={t("Evaluation statistics")}><thead><tr><th>{t("Kennzahl")}</th><th>{t("Wert")}</th><th>{t("Stichprobe / Nenner")}</th></tr></thead><tbody>
      <tr><th>{t("Bewertete Analysen")}</th><td>{stats.reviewedAssessments} / {stats.savedAssessments}</td><td>{t("Mindestens ein bewertetes Feld / gespeicherte Analysen")}</td></tr>
      <tr><th>{t("Choice-Übereinstimmung")}</th><td>{stats.choiceAgreement.n ? `${stats.choiceAgreement.matches} / ${stats.choiceAgreement.n} (${(100 * stats.choiceAgreement.rate!).toFixed(1)}%)` : t("Nicht verfügbar")}</td>
        <td>{t("n =")} {stats.choiceAgreement.n} {t("Choice-Felder mit Erwartungslabel;")} {stats.choiceAgreement.withoutExpected} {t("ohne Erwartungslabel ausgeschlossen")}</td></tr>
      <tr><th>{t("Mittlerer absoluter Score-Fehler")}</th><td className="number">{stats.scoreAbsoluteError.mean == null ? t("Nicht verfügbar") : String(stats.scoreAbsoluteError.mean)}</td>
        <td>{t("n =")} {stats.scoreAbsoluteError.n} {t("Score-Felder mit erwarteter Stufe;")} {stats.scoreAbsoluteError.withoutExpected} {t("ohne erwartete Stufe ausgeschlossen")}</td></tr>
      {([['Latenz (ms)', stats.latencyMs], ['Eingabe-Tokens', stats.inputTokens], ['Ausgabe-Tokens', stats.outputTokens]] as const).map(([name, data]) =>
        <tr key={name}><th>{t(name)}</th><td className="number">{t("Mittelwert")} {t(value(data.mean))} {t("· min")} {t(value(data.min))} {t("· max")} {t(value(data.max))}</td><td>{t("n =")} {data.n} {t("Werte aus manuell bewerteten Analysen")}</td></tr>)}
    </tbody></table></div>
    <p className="view-note">{t("Noul wird qualitativ bewertet. Erwartungswerte zählen nur bei ausdrücklich gesetztem Label oder Rubrikwert.")}</p>
    <h3 className="section-title">{t("Bewertungen pro Feld")}</h3><div className="table-scroll"><table className="lab-table" aria-label={t("Field review counts")}><thead><tr><th>{t("Feld")}</th><th>{t("Richtig")}</th><th>{t("Falsch")}</th><th>{t("Unsicher")}</th><th>{t("Bewertete Felder (n)")}</th></tr></thead>
      <tbody>{fields.map((field) => { const count = stats.fields[field] ?? { correct: 0, incorrect: 0, uncertain: 0, total: 0 }; return <tr key={field}><th><span>{displayLabel(field)}</span></th><td>{count.correct}</td><td>{count.incorrect}</td><td>{count.uncertain}</td><td>{count.total}</td></tr>; })}</tbody>
    </table></div>
    </details>
  </section>;
}
