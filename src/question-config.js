import governance from '../examples/questions/governance.json' with { type: 'json' };
import { evidenceQuestionConfig, EVIDENCE_QUESTION_VERSION } from './evidence-question-config.js';

export const defaultConfigurations = {
  governance: governance,
  evidence: { schemaVersion: 1, kind: 'evidence', version: EVIDENCE_QUESTION_VERSION, questions: evidenceQuestionConfig },
};
export function canonicalConfiguration(value) {
  if (Array.isArray(value)) return value.map(canonicalConfiguration);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalConfiguration(value[key])]));
  return value;
}
export const configurationIdentity = (config) => JSON.stringify(canonicalConfiguration(config));
const exactKeys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\n') === [...expected].sort().join('\n');
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** Intentionally narrow: edit wording, preserving the field/category identities used by reviews. */
export function validateQuestionConfiguration(value, kind) {
  const base = defaultConfigurations[kind];
  if (!base || !exactKeys(value, ['schemaVersion', 'kind', 'version', 'questions']) || value.schemaVersion !== 1
    || value.kind !== kind || !text(value.version, 80) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value.version)
    || !exactKeys(value.questions, Object.keys(base.questions))) throw new Error('Invalid question configuration envelope or field identities.');
  for (const [name, original] of Object.entries(base.questions)) {
    const q = value.questions[name];
    if (!exactKeys(q, ['type', 'instructions', 'criteria']) || q.type !== original.type || !text(q.instructions, 2000)) throw new Error(`Invalid question: ${name}.`);
    if (q.type === 'score') {
      if (!Array.isArray(q.criteria) || q.criteria.length !== 4 || !q.criteria.every((v) => text(v, 1000))) throw new Error('Score requires four nonempty rubric levels (0–3).');
    } else if (!exactKeys(q.criteria, Object.keys(original.criteria)) || !Object.values(q.criteria).every((v) => text(v, 1000))) {
      throw new Error(`Invalid criteria for ${name}; preserve category names.`);
    }
  }
  if (JSON.stringify(value).length > 24_000) throw new Error('Question configuration is too large.');
  if (value.version === base.version && configurationIdentity(value) !== configurationIdentity(base)) throw new Error('Edited questions require a different version from the default.');
  return structuredClone(value);
}
