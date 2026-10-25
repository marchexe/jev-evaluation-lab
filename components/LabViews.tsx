'use client';

import React, { useState } from 'react';
import type { AssessmentRecord } from '../src/ui/types';
import { compareAssessments, type difference } from '../src/ui/comparison';
import { evaluateRecords } from '../src/ui/evaluation';
import { reviewCount } from '../src/ui/reviews';
import { downloadJson, exportHistory } from '../src/ui/history';

function value(value: unknown) { return value == null ? 'Missing' : String(value); }
function delta(value: number | null) { return value == null ? 'Missing' : value > 0 ? `+${value}` : String(value); }
type Difference = ReturnType<typeof difference>;

function DifferenceRow({ label, data }: { label: string; data: Difference }) {
  return <tr><th scope="row">{label}</th><td className="number">{value(data.left)}</td><td className="number">{value(data.right)}</td>
    <td className="number">{data.delta === null && data.status !== 'missing' ? <span title="Categorical values have no numeric delta">—</span> : delta(data.delta)}</td><td><span className={`difference-status ${data.status}`}>{data.status}</span></td></tr>;
}

function RecordMetadata({ record, side }: { record: AssessmentRecord; side: string }) {
  const result = record.assessment;
  return <section><h3>{side} · {record.id}</h3><pre className="comparison-description">{record.description}</pre>
    <dl className="metadata-grid"><div><dt>Actual model</dt><dd>{result.response.model}</dd></div><div><dt>Request ID</dt><dd>{value(result.requestId)}</dd></div>
      <div><dt>Timestamp</dt><dd>{record.timestamp}</dd></div><div><dt>Requested model</dt><dd>{result.request.model}</dd></div>
      <div><dt>SDK version</dt><dd>{result.sdkVersion}</dd></div><div><dt>Profile</dt><dd>{result.profile}</dd></div></dl>
    <details><summary>Original {side} JSON</summary><pre className="technical-json">{JSON.stringify(result, null, 2)}</pre></details>
  </section>;
}

export function CompareView({ records }: { records: AssessmentRecord[] }) {
  const [leftId, setLeftId] = useState(''); const [rightId, setRightId] = useState('');
  const left = records.find((record) => record.id === leftId) ?? records[0];
  const right = records.find((record) => record.id === rightId) ?? records[1];
  const comparison = left && right && left.id !== right.id ? compareAssessments(left.assessment, right.assessment) : null;
  return <section className="lab-view" aria-label="Compare assessments"><h2>Compare assessments</h2>
    <p className="view-note">Offline comparison. Deltas are B − A. Missing data is never treated as zero.</p>
    <div className="comparison-selectors">{(['A', 'B'] as const).map((side) => <label key={side}>Assessment {side}
      <select aria-label={`Assessment ${side}`} value={(side === 'A' ? left : right)?.id ?? ''} onChange={(event) => (side === 'A' ? setLeftId : setRightId)(event.target.value)}>
        <option value="" disabled>Select assessment</option>{records.map((record) => <option key={record.id} value={record.id}>{record.id.slice(0, 8)} · {record.assessment.response.model} · {record.description.slice(0, 70)}</option>)}
      </select></label>)}</div>
    {!comparison || !left || !right ? <p className="empty-results">Choose two different saved assessments.</p> : <>
      <div className="comparison-descriptions"><RecordMetadata record={left} side="A" /><RecordMetadata record={right} side="B" /></div>
      {comparison.fields.map((field) => <section key={field.name} className="comparison-field">
        <h3><code>{field.name}</code><span className={`difference-status ${field.status}`}>{field.status.replaceAll('_', ' ')}</span></h3>
        {field.definitionChanged && <p className="uncertainty-note">Question or rubric definitions differ. Numeric deltas are descriptive, not equivalent-task performance.</p>}
        {field.status === 'type_mismatch' ? <p className="view-note">Different question types; no numeric comparison is made.</p> : <div className="table-scroll"><table className="lab-table">
          <thead><tr><th>Value</th><th>A</th><th>B</th><th>Δ B − A</th><th>Status</th></tr></thead><tbody>
            <DifferenceRow label={field.type === 'choice' ? 'Prediction' : field.type === 'noul' ? 'Noul' : 'Score'} data={field.prediction} />
            {field.type !== 'noul' && <DifferenceRow label="Confidence" data={field.confidence} />}
            {field.probabilities.map((probability) => <tr key={probability.label}><th scope="row"><code>{probability.label}</code></th>
              <td className="number">{value(probability.left)}{typeof probability.left === 'number' && <meter min={0} max={1} value={probability.left} aria-label={`A ${probability.label} probability`} />}</td>
              <td className="number">{value(probability.right)}{typeof probability.right === 'number' && <meter min={0} max={1} value={probability.right} aria-label={`B ${probability.label} probability`} />}</td>
              <td className="number">{delta(probability.delta)}</td><td><span className={`difference-status ${probability.status}`}>{probability.status}</span></td></tr>)}
          </tbody></table></div>}
      </section>)}
      <h3 className="section-title">Performance metadata</h3><div className="table-scroll"><table className="lab-table"><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Δ B − A</th><th>Status</th></tr></thead><tbody>
        <DifferenceRow label="Latency (ms)" data={comparison.latencyMs} /><DifferenceRow label="Input tokens" data={comparison.inputTokens} /><DifferenceRow label="Output tokens" data={comparison.outputTokens} />
      </tbody></table></div>
    </>}
  </section>;
}

export function AssessmentTable({ records, onOpen }: { records: AssessmentRecord[]; onOpen: (record: AssessmentRecord) => void }) {
  return !records.length ? <p className="empty-results">No saved assessments.</p> : <div className="table-scroll"><table className="lab-table case-table">
    <thead><tr><th>Assessment / description</th><th>Model / timestamp</th><th>Fields reviewed</th><th>Overall feedback</th><th>Action</th></tr></thead>
    <tbody>{records.map((record) => <tr key={record.id}><td><code>{record.id.slice(0, 8)}</code><details><summary>{record.description.slice(0, 85)}</summary><p>{record.description}</p></details></td>
      <td><code>{record.assessment.response.model}</code><div className="muted">{record.timestamp}</div></td>
      <td>{reviewCount(record)} / {Object.keys(record.assessment.response.answers).length}</td><td>{record.feedback.rating.replaceAll('_', ' ')}</td>
      <td><button type="button" onClick={() => onOpen(record)} aria-label={`Open assessment ${record.id}`}>Open</button></td></tr>)}</tbody>
  </table></div>;
}

export function EvaluationView({ records, onOpen }: { records: AssessmentRecord[]; onOpen: (record: AssessmentRecord) => void }) {
  const stats = evaluateRecords(records);
  const fields = [...new Set(records.flatMap((record) => Object.keys(record.assessment.response.answers)))];
  return <section className="lab-view" aria-label="Evaluation"><div className="view-heading"><h2>Evaluation</h2>
    <button disabled={!records.length} onClick={() => downloadJson('jev-evaluation.json', exportHistory(records))}>Export assessments + reviews</button></div>
    <p className="view-note">Descriptive reviewer agreement and error, not validated accuracy or model calibration. Overall feedback is excluded. Results are pooled across saved cases and model versions.</p>
    <div className="table-scroll"><table className="lab-table" aria-label="Evaluation statistics"><thead><tr><th>Metric</th><th>Value</th><th>Sample / denominator</th></tr></thead><tbody>
      <tr><th>Reviewed assessments</th><td>{stats.reviewedAssessments} / {stats.savedAssessments}</td><td>At least one saved field review / all saved assessments</td></tr>
      <tr><th>Choice agreement</th><td>{stats.choiceAgreement.n ? `${stats.choiceAgreement.matches} / ${stats.choiceAgreement.n} (${(100 * stats.choiceAgreement.rate!).toFixed(1)}%)` : 'Not available'}</td>
        <td>n = {stats.choiceAgreement.n} reviewed Choice fields with expected labels; {stats.choiceAgreement.withoutExpected} reviewed fields without expected labels excluded</td></tr>
      <tr><th>Mean Score absolute error</th><td className="number">{stats.scoreAbsoluteError.mean == null ? 'Not available' : String(stats.scoreAbsoluteError.mean)}</td>
        <td>n = {stats.scoreAbsoluteError.n} reviewed Score fields with expected levels; {stats.scoreAbsoluteError.withoutExpected} without expected levels excluded</td></tr>
      {([['Latency (ms)', stats.latencyMs], ['Input tokens', stats.inputTokens], ['Output tokens', stats.outputTokens]] as const).map(([name, data]) =>
        <tr key={name}><th>{name}</th><td className="number">Mean {value(data.mean)} · min {value(data.min)} · max {value(data.max)}</td><td>n = {data.n} reported values, only from field-reviewed assessments</td></tr>)}
    </tbody></table></div>
    <p className="view-note">Noul review is qualitative evidence assessment; no numeric target is inferred. An uncertain review contributes to expected-label metrics only when the reviewer explicitly supplies an expected label or level.</p>
    <h3 className="section-title">Review judgments by field</h3><div className="table-scroll"><table className="lab-table" aria-label="Field review counts"><thead><tr><th>Field</th><th>Correct</th><th>Incorrect</th><th>Uncertain</th><th>Reviewed fields (n)</th></tr></thead>
      <tbody>{fields.map((field) => { const count = stats.fields[field] ?? { correct: 0, incorrect: 0, uncertain: 0, total: 0 }; return <tr key={field}><th><code>{field}</code></th><td>{count.correct}</td><td>{count.incorrect}</td><td>{count.uncertain}</td><td>{count.total}</td></tr>; })}</tbody>
    </table></div>
    <h3 className="section-title">Assessed cases</h3><AssessmentTable records={records} onOpen={onOpen} />
  </section>;
}
