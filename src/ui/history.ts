import type { Assessment, AssessmentRecord, Feedback } from './types';
import { validateReview } from './reviews';

export const HISTORY_KEY = 'jev.assessments.v1';
export const MAX_HISTORY_RECORDS = 100;

export function createRecord(assessment: Assessment, id: string): AssessmentRecord {
  return {
    id, timestamp: assessment.startedAt,
    description: assessment.request.state.ai_system_description,
    assessment,
    feedback: { rating: 'not_rated', comment: '' },
  };
}

export function updateFeedback(records: AssessmentRecord[], id: string, feedback: Feedback) {
  if (!['positive', 'negative', 'not_rated'].includes(feedback.rating) || feedback.comment.length > 2000) {
    throw new Error('Invalid feedback. Comments must be at most 2000 characters.');
  }
  return records.map((record) => record.id === id ? { ...record, feedback: { ...feedback } } : record);
}

export function readHistory(storage: Pick<Storage, 'getItem'>): AssessmentRecord[] {
  const raw = storage.getItem(HISTORY_KEY);
  if (!raw) return [];
  const records: unknown = JSON.parse(raw);
  if (!Array.isArray(records) || records.length > MAX_HISTORY_RECORDS
    || !records.every((record) => record && typeof record.id === 'string'
      && typeof record.description === 'string' && typeof record.timestamp === 'string'
      && record.assessment?.profile === 'governance' && record.assessment?.mode === 'live'
      && record.assessment?.request?.state?.ai_system_description === record.description
      && record.assessment?.response?.answers && record.assessment?.response?.usage
      && typeof record.assessment?.response?.model === 'string'
      && ['positive', 'negative', 'not_rated'].includes(record.feedback?.rating)
      && typeof record.feedback?.comment === 'string')) {
    throw new Error('Saved assessment history is invalid. Export browser storage before clearing it.');
  }
  for (const record of records as AssessmentRecord[]) {
    if (record.fieldReviews !== undefined) {
      if (!record.fieldReviews || typeof record.fieldReviews !== 'object' || Array.isArray(record.fieldReviews)) throw new Error('Invalid saved field reviews.');
      for (const [field, review] of Object.entries(record.fieldReviews)) {
        if (!Object.hasOwn(record.assessment.response.answers, field)) throw new Error('Unknown reviewed field.');
        validateReview(record.assessment.response.answers[field], review);
      }
    }
  }
  return records as AssessmentRecord[];
}

export function writeHistory(storage: Pick<Storage, 'setItem'>, records: AssessmentRecord[]) {
  if (records.length > MAX_HISTORY_RECORDS) throw new Error('History is full. Export and clear history before analyzing again.');
  storage.setItem(HISTORY_KEY, JSON.stringify(records));
}

export function exportHistory(records: AssessmentRecord[]) {
  return JSON.stringify({ schemaVersion: 2, assessments: records }, null, 2);
}

export function downloadJson(filename: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
