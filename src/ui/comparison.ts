import type { Assessment, JevAnswer } from './types';

export type DifferenceStatus = 'changed' | 'unchanged' | 'missing';
type Value = number | string | null | undefined;

export function difference(left: Value, right: Value) {
  const missing = left == null || right == null;
  return {
    left: left ?? null, right: right ?? null,
    delta: !missing && typeof left === 'number' && typeof right === 'number' ? right - left : null,
    status: (missing ? 'missing' : left === right ? 'unchanged' : 'changed') as DifferenceStatus,
  };
}

function answerValue(answer: JevAnswer | undefined) {
  if (!answer) return undefined;
  return answer.type === 'choice' ? answer.choice : answer.type === 'noul' ? answer.noul : answer.score;
}

export function compareAssessments(left: Assessment, right: Assessment) {
  const fields = [...new Set([
    ...Object.keys(left.request.questions), ...Object.keys(right.request.questions),
    ...Object.keys(left.response.answers), ...Object.keys(right.response.answers),
  ])].map((name) => {
    const a = left.response.answers[name];
    const b = right.response.answers[name];
    const typeMismatch = !!a && !!b && a.type !== b.type;
    const aProbabilities = a && a.type !== 'noul' ? a.probabilities : {};
    const bProbabilities = b && b.type !== 'noul' ? b.probabilities : {};
    const probabilities = [...new Set([...Object.keys(aProbabilities), ...Object.keys(bProbabilities)])]
      .map((label) => ({ label, ...difference(aProbabilities[label], bProbabilities[label]), ...(typeMismatch ? { delta: null } : {}) }));
    const prediction = { ...difference(answerValue(a), answerValue(b)), ...(typeMismatch ? { delta: null } : {}) };
    const confidence = { ...difference(a && 'confidence' in a ? a.confidence : null, b && 'confidence' in b ? b.confidence : null), ...(typeMismatch ? { delta: null } : {}) };
    const definitionChanged = JSON.stringify(left.request.questions[name]) !== JSON.stringify(right.request.questions[name]);
    const status = typeMismatch ? 'type_mismatch' : !a || !b || prediction.status === 'missing'
      || (a.type !== 'noul' && b.type !== 'noul' && confidence.status === 'missing') || probabilities.some((entry) => entry.status === 'missing') ? 'missing'
      : definitionChanged || prediction.status === 'changed' || confidence.status === 'changed' || probabilities.some((entry) => entry.status === 'changed') ? 'changed' : 'unchanged';
    return { name, type: a?.type ?? b?.type ?? null, status, prediction, confidence, probabilities, definitionChanged };
  });
  return {
    fields,
    latencyMs: difference(left.latencyMs, right.latencyMs),
    inputTokens: difference(left.response.usage.input_tokens, right.response.usage.input_tokens),
    outputTokens: difference(left.response.usage.output_tokens, right.response.usage.output_tokens),
  };
}
