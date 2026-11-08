'use client';
import { useLanguage } from './LanguageProvider';
import { TranslatedText } from './TranslatedText';


import React from 'react';
import type { Assessment, Feedback, FieldReview, JevAnswer } from '../src/ui/types';
import { downloadJson } from '../src/ui/history';
import { FieldReviewEditor } from './FieldReviewEditor';

const titles: Record<string, string> = {
  intended_use_case: 'Einsatzzweck', supported_use_case: 'Kategorieabdeckung',
  personal_data_evidence: 'Personenbezogene Daten', human_oversight_evidence: 'Menschliche Aufsicht',
  description_completeness: 'Vollständigkeit',
  evidence_judgment: 'Belegaussage', addresses_control: 'Belegrelevanz',
};

function valueText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function ProbabilityTable({ values }: { values: Record<string, number> }) {
  const { t, displayLabel } = useLanguage();
  return <table className="probability-table"><thead><tr><th>{t("Kategorie / Stufe")}</th><th>{t("Wahrscheinlichkeit")}</th><th><span className="sr-only">{t("Verteilung")}</span></th></tr></thead>
    <tbody>{Object.entries(values).map(([label, value]) => <tr key={label}>
      <th scope="row"><span title={label}>{displayLabel(label)}</span></th><td className="number">{String(value)}</td>
      <td><meter min={0} max={1} value={value} aria-label={`${label} probability`} /></td>
    </tr>)}</tbody>
  </table>;
}

function Confidence({ value }: { value: number | null | undefined }) {
  const { t } = useLanguage();
  return value != null ? <span className="confidence">{t("Konfidenz")} <strong>{String(value)}</strong></span> : null;
}

export function JevAnswerField({ name, answer, criteria, review, onReview }: {
  name: string; answer: JevAnswer; criteria?: unknown; review?: FieldReview; onReview?: (review: FieldReview | null) => void;
}) {
  const { t, displayLabel } = useLanguage();
  return <section className={`answer-field answer-${answer.type}`} aria-label={t(titles[name] ?? name)}>
    <div className="field-heading"><h3>{t(titles[name] ?? name.replaceAll('_', ' '))}</h3><span className="type-label">{answer.type === 'choice' ? t("Kategorie · Choice") : answer.type === 'noul' ? t("Aussagewahrscheinlichkeit · Noul") : t("Rubrikwert · Score")}</span></div>
    <div className="field-content">{answer.type === 'choice' && <>
      <div className="answer-summary"><span className="selected-label" title={answer.choice}>{displayLabel(answer.choice)}</span>
        <Confidence value={answer.confidence} />
        <span className="selected-probability"><span className="number">{String(answer.probabilities[answer.choice])}</span>
          <meter min={0} max={1} value={answer.probabilities[answer.choice]} aria-label={`${answer.choice} probability`} /></span>
      </div>
      {['not_documented', 'unclear', 'conflicting', 'unknown'].includes(answer.choice) && <p className="uncertainty-note">{t("Beleglage:")} {displayLabel(answer.choice)}.</p>}
      <details className="alternatives"><summary>{t("Alle Wahrscheinlichkeiten (")}{Object.keys(answer.probabilities).length})</summary>
        <ProbabilityTable values={answer.probabilities} />
        {criteria && typeof criteria === 'object' ? <details className="criteria-details"><summary>{t("Kriterien")}</summary>
          <dl className="criteria-list">{Object.entries(criteria).map(([label, description]) =>
            <div key={label}><dt><span title={label}>{displayLabel(label)}</span></dt><dd><TranslatedText text={valueText(description)} /></dd></div>)}</dl>
        </details> : null}
      </details>
    </>}
    {answer.type === 'noul' && <>
      <div className="answer-summary"><span className="answer-value">{String(answer.noul)} <span className="muted">/ 1</span></span>
        <meter className="noul-meter" min={0} max={1} value={answer.noul} aria-label={t("noul probability")} />
        <span className="field-note">{t("Ohne Ja/Nein-Schwelle")}</span></div>
    </>}
    {answer.type === 'score' && <>
      <div className="answer-summary"><span className="answer-value">{String(answer.score)}</span><Confidence value={answer.confidence} /></div>
      <ProbabilityTable values={answer.probabilities} />
      <details className="rubric"><summary>{t("Bewertungsrubrik (")}{Object.keys(answer.legend).length} {t("Stufen)")}</summary>
        <dl className="criteria-list">{Object.entries(answer.legend).map(([level, description]) =>
          <div key={level}><dt><code>{level}</code></dt><dd><TranslatedText text={valueText(description)} /></dd></div>)}</dl>
      </details>
    </>}
    {onReview && <FieldReviewEditor name={name} answer={answer} review={review} onSave={onReview} />}
    </div>
  </section>;
}

export function JevAssessmentCard({ assessment, assessmentId, feedback, onFeedback, fieldReviews, onFieldReview }: {
  assessment: Assessment; assessmentId: string; feedback?: Feedback;
  onFeedback?: (feedback: Feedback) => void;
  fieldReviews?: Record<string, FieldReview>;
  onFieldReview?: (field: string, review: FieldReview | null) => void;
}) {
  const { t, displayLabel } = useLanguage();
  return <article className="assessment-card" aria-label={t("Jev assessment")}>
    <header className="assessment-heading"><h2>{t("Ergebnis")}</h2><span className="model-tag">{assessment.response.model}</span></header>
    <div className="answer-grid">{Object.entries(assessment.response.answers).map(([name, answer]) =>
      <JevAnswerField key={name} name={name} answer={answer} criteria={assessment.request.questions[name]?.criteria}
        review={fieldReviews?.[name]} onReview={onFieldReview ? (review) => onFieldReview(name, review) : undefined} />)}</div>
    <details className="run-metadata"><summary>{t("Laufdetails ·")} {assessment.response.model} · {String(assessment.latencyMs)} {t("ms")}</summary><dl className="metadata-grid">
      <div><dt>{t("Latenz")}</dt><dd>{String(assessment.latencyMs)} {t("ms")}</dd></div>
      <div><dt>{t("Eingabe-Tokens")}</dt><dd>{assessment.response.usage.input_tokens ?? 'Nicht gemeldet'}</dd></div>
      <div><dt>{t("Ausgabe-Tokens")}</dt><dd>{assessment.response.usage.output_tokens ?? 'Nicht gemeldet'}</dd></div>
      <div><dt>{t("Anfrage-ID")}</dt><dd>{assessment.requestId ?? 'Nicht gemeldet'}</dd></div>
      <div><dt>{t("Analyse-ID")}</dt><dd>{assessmentId}</dd></div>
      <div><dt>{t("Gestartet")}</dt><dd>{assessment.startedAt}</dd></div>
    </dl></details>
    <div className="raw-section">
      <details><summary>{t("Originalantwort (JSON)")}</summary><pre>{JSON.stringify(assessment, null, 2)}</pre></details>
      <button type="button" className="text-button" onClick={() => downloadJson(`jev-assessment-${assessmentId}.json`, JSON.stringify(assessment, null, 2))}>{t("Ergebnis exportieren (JSON)")}</button>
    </div>
    {feedback && onFeedback && <details className="feedback-section"><summary>{t("Gesamtbewertung ·")} {displayLabel(feedback.rating)}</summary>
      <fieldset><legend>{t("Analyse bewerten")}</legend><div className="feedback-options">
        {([['not_rated', 'Nicht bewertet'], ['positive', 'Richtig'], ['negative', 'Falsch']] as const).map(([rating, label]) =>
          <label key={rating}><input type="radio" name={`rating-${assessmentId}`} checked={feedback.rating === rating}
            onChange={() => onFeedback({ ...feedback, rating })} />{t(label)}</label>)}
      </div></fieldset>
      <label className="comment-label">{t("Kommentar")} <span>{t("(optional)")}</span>
        <textarea rows={1} maxLength={2000} value={feedback.comment} placeholder={t("Kommentar")}
          onChange={(event) => onFeedback({ ...feedback, comment: event.target.value })} />
      </label>
      <p className="field-note">{t("Lokal gespeichert.")}</p>
    </details>}
  </article>;
}
