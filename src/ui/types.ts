export type ChoiceAnswer = {
  type: 'choice'; choice: string; confidence: number | null;
  probabilities: Record<string, number>;
};
export type NoulAnswer = { type: 'noul'; noul: number };
export type ScoreAnswer = {
  type: 'score'; score: number; confidence?: number | null;
  legend: Record<string, unknown>; probabilities: Record<string, number>;
};
export type JevAnswer = ChoiceAnswer | NoulAnswer | ScoreAnswer;
export type Assessment = {
  schemaVersion: number; profile: string; mode: string;
  startedAt: string; sdkVersion: string; requestId: string | null; latencyMs: number;
  request: {
    model: string; state: { ai_system_description: string };
    questions: Record<string, { type: string; instructions?: unknown; criteria?: unknown }>;
  };
  response: {
    model: string; answers: Record<string, JevAnswer>;
    usage: { input_tokens: number | null; output_tokens: number | null };
  };
};
export type Feedback = { rating: 'positive' | 'negative' | 'not_rated'; comment: string };
export type FieldReview = {
  judgment: 'correct' | 'incorrect' | 'uncertain';
  comment: string;
  expectedChoice?: string;
  expectedScore?: 0 | 1 | 2 | 3;
  noulJudgment?: 'supports' | 'contradicts' | 'unresolved';
};
export type AssessmentRecord = {
  id: string; timestamp: string; description: string;
  assessment: Assessment; feedback: Feedback;
  // Optional and outside assessment: older history remains valid, raw Jev data is untouched.
  fieldReviews?: Record<string, FieldReview>;
};
