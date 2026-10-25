import type { AssessmentRecord } from './types';
import { reviewCount } from './reviews';

function summary(values: (number | null | undefined)[]) {
  const reported = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return {
    n: reported.length,
    mean: reported.length ? reported.reduce((total, value) => total + value, 0) / reported.length : null,
    min: reported.length ? Math.min(...reported) : null,
    max: reported.length ? Math.max(...reported) : null,
  };
}

export function evaluateRecords(records: AssessmentRecord[]) {
  const reviewed = records.filter((record) => reviewCount(record) > 0);
  const counts: Record<string, { correct: number; incorrect: number; uncertain: number; total: number }> = {};
  let choiceN = 0; let choiceMatches = 0; let choiceWithoutExpected = 0;
  const scoreErrors: number[] = [];
  let scoreWithoutExpected = 0;
  for (const record of reviewed) {
    for (const [field, review] of Object.entries(record.fieldReviews ?? {})) {
      const answer = record.assessment.response.answers[field];
      if (!answer) continue;
      counts[field] ??= { correct: 0, incorrect: 0, uncertain: 0, total: 0 };
      counts[field][review.judgment]++; counts[field].total++;
      if (answer.type === 'choice') {
        if (review.expectedChoice === undefined) choiceWithoutExpected++;
        else { choiceN++; if (answer.choice === review.expectedChoice) choiceMatches++; }
      }
      if (answer.type === 'score') {
        if (review.expectedScore === undefined) scoreWithoutExpected++;
        else scoreErrors.push(Math.abs(answer.score - review.expectedScore));
      }
    }
  }
  return {
    savedAssessments: records.length, reviewedAssessments: reviewed.length,
    fields: counts,
    choiceAgreement: { matches: choiceMatches, n: choiceN, rate: choiceN ? choiceMatches / choiceN : null, withoutExpected: choiceWithoutExpected },
    scoreAbsoluteError: { ...summary(scoreErrors), withoutExpected: scoreWithoutExpected },
    // Performance sample is restricted to assessments with manually reviewed fields.
    latencyMs: summary(reviewed.map((record) => record.assessment.latencyMs)),
    inputTokens: summary(reviewed.map((record) => record.assessment.response.usage.input_tokens)),
    outputTokens: summary(reviewed.map((record) => record.assessment.response.usage.output_tokens)),
  };
}
