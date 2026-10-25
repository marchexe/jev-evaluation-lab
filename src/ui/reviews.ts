import type { AssessmentRecord, FieldReview, JevAnswer } from './types';

export function validateReview(answer: JevAnswer | undefined, review: FieldReview): void {
  if (!answer || !review || !['correct', 'incorrect', 'uncertain'].includes(review.judgment)
    || typeof review.comment !== 'string' || review.comment.length > 1000
    || Object.keys(review).some((key) => !['judgment', 'comment', 'expectedChoice', 'expectedScore', 'noulJudgment'].includes(key))) {
    throw new Error('Invalid field review. A judgment and a comment of at most 1000 characters are required.');
  }
  if (review.expectedChoice !== undefined && (answer.type !== 'choice'
    || !Object.hasOwn(answer.probabilities, review.expectedChoice))) {
    throw new Error('Expected Choice must be one of the recorded options.');
  }
  if (review.expectedScore !== undefined && (answer.type !== 'score'
    || !Number.isInteger(review.expectedScore) || review.expectedScore < 0 || review.expectedScore > 3
    || !Object.hasOwn(answer.legend, String(review.expectedScore)))) {
    throw new Error('Expected Score must be a recorded rubric level from 0 to 3.');
  }
  if (review.noulJudgment !== undefined && (answer.type !== 'noul'
    || !['supports', 'contradicts', 'unresolved'].includes(review.noulJudgment))) {
    throw new Error('Noul review must be qualitative, not numeric ground truth.');
  }
}

export function updateFieldReview(records: AssessmentRecord[], id: string, field: string, review: FieldReview | null) {
  const record = records.find((entry) => entry.id === id);
  if (!record || !Object.hasOwn(record.assessment.response.answers, field)) throw new Error('Unknown assessment field.');
  if (review !== null) validateReview(record.assessment.response.answers[field], review);
  return records.map((entry) => {
    if (entry.id !== id) return entry;
    const fieldReviews = { ...entry.fieldReviews };
    if (review === null) delete fieldReviews[field];
    else Object.defineProperty(fieldReviews, field, { value: { ...review }, enumerable: true, configurable: true, writable: true });
    return { ...entry, fieldReviews };
  });
}

export function reviewCount(record: AssessmentRecord) {
  return Object.keys(record.fieldReviews ?? {}).length;
}
