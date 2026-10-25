'use client';

import React from 'react';
import type { Assessment, Feedback, FieldReview, JevAnswer } from '../src/ui/types';
import { downloadJson } from '../src/ui/history';
import { FieldReviewEditor } from './FieldReviewEditor';

const titles: Record<string, string> = {
  intended_use_case: 'Intended use case', supported_use_case: 'Use case coverage',
  personal_data_evidence: 'Personal data evidence', human_oversight_evidence: 'Human oversight evidence',
  description_completeness: 'Description completeness',
};

function valueText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function ProbabilityTable({ values }: { values: Record<string, number> }) {
  return <table className="probability-table"><thead><tr><th>Option / level</th><th>Probability</th><th><span className="sr-only">Distribution</span></th></tr></thead>
    <tbody>{Object.entries(values).map(([label, value]) => <tr key={label}>
      <th scope="row"><code>{label}</code></th><td className="number">{String(value)}</td>
      <td><meter min={0} max={1} value={value} aria-label={`${label} probability`} /></td>
    </tr>)}</tbody>
  </table>;
}

function Confidence({ value }: { value: number | null | undefined }) {
  return value != null ? <span className="confidence">Confidence <strong>{String(value)}</strong></span> : null;
}

export function JevAnswerField({ name, answer, criteria, review, onReview }: {
  name: string; answer: JevAnswer; criteria?: unknown; review?: FieldReview; onReview?: (review: FieldReview | null) => void;
}) {
  return <section className={`answer-field answer-${answer.type}`} aria-label={titles[name] ?? name}>
    <div className="field-heading"><h3>{titles[name] ?? name}</h3><span className="type-label">{answer.type}</span></div>
    <div className="field-content">{answer.type === 'choice' && <>
      <div className="answer-summary"><code className="selected-label">{answer.choice}</code>
        <Confidence value={answer.confidence} />
        <span className="selected-probability"><span className="number">{String(answer.probabilities[answer.choice])}</span>
          <meter min={0} max={1} value={answer.probabilities[answer.choice]} aria-label={`${answer.choice} probability`} /></span>
      </div>
      {['not_documented', 'unclear', 'conflicting', 'unknown'].includes(answer.choice) && <p className="uncertainty-note">Evidence state: {answer.choice}. Review the description and full distribution.</p>}
      <details className="alternatives"><summary>All option probabilities ({Object.keys(answer.probabilities).length})</summary>
        <ProbabilityTable values={answer.probabilities} />
        {criteria && typeof criteria === 'object' ? <details className="criteria-details"><summary>Option criteria</summary>
          <dl className="criteria-list">{Object.entries(criteria).map(([label, description]) =>
            <div key={label}><dt><code>{label}</code></dt><dd>{valueText(description)}</dd></div>)}</dl>
        </details> : null}
      </details>
    </>}
    {answer.type === 'noul' && <>
      <div className="answer-summary"><span className="answer-value">{String(answer.noul)} <span className="muted">/ 1</span></span>
        <meter className="noul-meter" min={0} max={1} value={answer.noul} aria-label="noul probability" />
        <span className="field-note">no yes/no threshold applied</span></div>
    </>}
    {answer.type === 'score' && <>
      <div className="answer-summary"><span className="answer-value">{String(answer.score)}</span><Confidence value={answer.confidence} /></div>
      <ProbabilityTable values={answer.probabilities} />
      <details className="rubric"><summary>Score rubric ({Object.keys(answer.legend).length} levels)</summary>
        <dl className="criteria-list">{Object.entries(answer.legend).map(([level, description]) =>
          <div key={level}><dt><code>{level}</code></dt><dd>{valueText(description)}</dd></div>)}</dl>
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
  return <article className="assessment-card" aria-label="Jev assessment">
    <header className="assessment-heading"><h2>Assessment results</h2><span className="model-tag">{assessment.response.model}</span></header>
    <div className="answer-grid">{Object.entries(assessment.response.answers).map(([name, answer]) =>
      <JevAnswerField key={name} name={name} answer={answer} criteria={assessment.request.questions[name]?.criteria}
        review={fieldReviews?.[name]} onReview={onFieldReview ? (review) => onFieldReview(name, review) : undefined} />)}</div>
    <dl className="metadata-grid">
      <div><dt>Latency</dt><dd>{String(assessment.latencyMs)} ms</dd></div>
      <div><dt>Input tokens</dt><dd>{assessment.response.usage.input_tokens ?? 'Not reported'}</dd></div>
      <div><dt>Output tokens</dt><dd>{assessment.response.usage.output_tokens ?? 'Not reported'}</dd></div>
      <div><dt>Request ID</dt><dd>{assessment.requestId ?? 'Not reported'}</dd></div>
      <div><dt>Assessment ID</dt><dd>{assessmentId}</dd></div>
      <div><dt>Started at</dt><dd>{assessment.startedAt}</dd></div>
    </dl>
    <div className="raw-section">
      <details><summary>Original assessment JSON</summary><pre>{JSON.stringify(assessment, null, 2)}</pre></details>
      <button type="button" className="text-button" onClick={() => downloadJson(`jev-assessment-${assessmentId}.json`, JSON.stringify(assessment, null, 2))}>Export assessment JSON</button>
    </div>
    {feedback && onFeedback && <footer className="feedback-section">
      <fieldset><legend>Review this assessment</legend><div className="feedback-options">
        {([['not_rated', 'Not rated'], ['positive', 'Correct'], ['negative', 'Incorrect']] as const).map(([rating, label]) =>
          <label key={rating}><input type="radio" name={`rating-${assessmentId}`} checked={feedback.rating === rating}
            onChange={() => onFeedback({ ...feedback, rating })} />{label}</label>)}
      </div></fieldset>
      <label className="comment-label">Feedback comment <span>(optional)</span>
        <textarea rows={1} maxLength={2000} value={feedback.comment} placeholder="Review comment"
          onChange={(event) => onFeedback({ ...feedback, comment: event.target.value })} />
      </label>
      <p className="field-note">Saved locally. Jev values unchanged.</p>
    </footer>}
  </article>;
}
