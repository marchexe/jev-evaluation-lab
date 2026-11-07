import { choice, noul, score } from '@typesafe-ai/sdk';
import { validateQuestionConfiguration } from '../question-config.js';
export function configuredQuestions(value, kind) {
  const config = validateQuestionConfiguration(value, kind);
  return Object.fromEntries(Object.entries(config.questions).map(([name, q]) => [name,
    q.type === 'choice' ? choice(q.instructions, q.criteria) : q.type === 'noul' ? noul(q.instructions, q.criteria) : score(q.instructions, q.criteria)]));
}
