'use client';
import { useLanguage } from './LanguageProvider';


import React, { useEffect, useState } from 'react';
import type { FieldReview, JevAnswer } from '../src/ui/types';

export function FieldReviewEditor({ name, answer, review, onSave }: {
  name: string; answer: JevAnswer; review?: FieldReview; onSave: (review: FieldReview | null) => void;
}) {
  const { t, displayLabel } = useLanguage();
  const [judgment, setJudgment] = useState<FieldReview['judgment'] | ''>(review?.judgment ?? '');
  const [comment, setComment] = useState(review?.comment ?? '');
  const [expected, setExpected] = useState(review?.expectedChoice ?? (review?.expectedScore == null ? '' : String(review.expectedScore)));
  const [qualitative, setQualitative] = useState<FieldReview['noulJudgment'] | ''>(review?.noulJudgment ?? '');
  useEffect(() => {
    setJudgment(review?.judgment ?? ''); setComment(review?.comment ?? '');
    setExpected(review?.expectedChoice ?? (review?.expectedScore == null ? '' : String(review.expectedScore)));
    setQualitative(review?.noulJudgment ?? '');
  }, [review]);

  function save() {
    if (!judgment) return;
    const next: FieldReview = { judgment, comment };
    if (answer.type === 'choice' && expected) next.expectedChoice = expected;
    if (answer.type === 'score' && expected !== '') next.expectedScore = Number(expected) as 0 | 1 | 2 | 3;
    if (answer.type === 'noul' && qualitative) next.noulJudgment = qualitative;
    onSave(next);
  }

  return <details className="field-review"><summary>{t("Bewertung:")} {review ? displayLabel(review.judgment) : t("nicht bewertet")}</summary>
    <div className="review-form">
      <label>{t("Bewertung")}<select aria-label={`${name} review judgment`} value={judgment} onChange={(event) => setJudgment(event.target.value as typeof judgment)}>
        <option value="">{t("Bewertung wählen")}</option><option value="correct">{t("Richtig")}</option><option value="incorrect">{t("Falsch")}</option><option value="uncertain">{t("Unsicher")}</option>
      </select></label>
      {answer.type === 'choice' && <label>{t("Erwartete Kategorie (optional)")}<select aria-label={`${name} expected category`} value={expected} onChange={(event) => setExpected(event.target.value)}>
        <option value="">{t("Keine Vorgabe")}</option>{Object.keys(answer.probabilities).map((category) => <option key={category} value={category}>{displayLabel(category)}</option>)}
      </select></label>}
      {answer.type === 'score' && <label>{t("Erwartete Rubrikstufe (optional)")}<select aria-label={`${name} expected level`} value={expected} onChange={(event) => setExpected(event.target.value)}>
        <option value="">{t("Keine Vorgabe")}</option>{Object.keys(answer.legend).filter((level) => /^[0-3]$/.test(level)).map((level) => <option key={level} value={level}>{level}</option>)}
      </select></label>}
      {answer.type === 'noul' && <label>{t("Qualitative Bewertung (optional)")}<select aria-label={`${name} qualitative review`} value={qualitative} onChange={(event) => setQualitative(event.target.value as typeof qualitative)}>
        <option value="">{t("Keine Vorgabe")}</option><option value="supports">{t("Stützt die Aussage")}</option><option value="contradicts">{t("Widerspricht der Aussage")}</option><option value="unresolved">{t("Belege fehlen oder widersprechen sich")}</option>
      </select></label>}
      <label className="review-comment">{t("Kommentar")}<textarea aria-label={`${name} reviewer comment`} maxLength={1000} rows={2} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <div className="review-actions"><button type="button" disabled={!judgment} onClick={save}>{t("Bewertung speichern")}</button>
        <button type="button" disabled={!review} onClick={() => { onSave(null); setJudgment(''); setComment(''); setExpected(''); setQualitative(''); }}>{t("Bewertung löschen")}</button></div>
      <p className="field-note">{t("Nur in diesem Browser gespeichert. Über den Verlauf als JSON exportieren.")}</p>
    </div>
  </details>;
}
