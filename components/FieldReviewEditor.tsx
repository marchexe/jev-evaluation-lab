'use client';

import React, { useEffect, useState } from 'react';
import type { FieldReview, JevAnswer } from '../src/ui/types';

export function FieldReviewEditor({ name, answer, review, onSave }: {
  name: string; answer: JevAnswer; review?: FieldReview; onSave: (review: FieldReview | null) => void;
}) {
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

  return <details className="field-review"><summary>Field review: {review?.judgment ?? 'not reviewed'}</summary>
    <div className="review-form">
      <label>Judgment<select aria-label={`${name} review judgment`} value={judgment} onChange={(event) => setJudgment(event.target.value as typeof judgment)}>
        <option value="">Choose judgment</option><option value="correct">Correct</option><option value="incorrect">Incorrect</option><option value="uncertain">Uncertain</option>
      </select></label>
      {answer.type === 'choice' && <label>Expected category (optional)<select aria-label={`${name} expected category`} value={expected} onChange={(event) => setExpected(event.target.value)}>
        <option value="">No expected category</option>{Object.keys(answer.probabilities).map((category) => <option key={category}>{category}</option>)}
      </select></label>}
      {answer.type === 'score' && <label>Expected rubric level (optional)<select aria-label={`${name} expected level`} value={expected} onChange={(event) => setExpected(event.target.value)}>
        <option value="">No expected level</option>{Object.keys(answer.legend).filter((level) => /^[0-3]$/.test(level)).map((level) => <option key={level} value={level}>{level}</option>)}
      </select></label>}
      {answer.type === 'noul' && <label>Qualitative evidence (optional)<select aria-label={`${name} qualitative review`} value={qualitative} onChange={(event) => setQualitative(event.target.value as typeof qualitative)}>
        <option value="">No qualitative label</option><option value="supports">Supports the statement</option><option value="contradicts">Contradicts the statement</option><option value="unresolved">Insufficient or conflicting evidence</option>
      </select></label>}
      <label className="review-comment">Reviewer comment<textarea aria-label={`${name} reviewer comment`} maxLength={1000} rows={2} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <div className="review-actions"><button type="button" disabled={!judgment} onClick={save}>Save field review</button>
        <button type="button" disabled={!review} onClick={() => { onSave(null); setJudgment(''); setComment(''); setExpected(''); setQualitative(''); }}>Clear field review</button></div>
    </div>
  </details>;
}
