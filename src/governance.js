import { defaultConfigurations } from './question-config.js';
import { configuredQuestions } from './server/question-builders.js';

// One authoritative wording source, built using the installed native SDK primitives.
export const governanceQuestions = configuredQuestions(defaultConfigurations.governance, 'governance');
