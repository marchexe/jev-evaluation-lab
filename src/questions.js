import { choice, noul, score } from '@typesafe-ai/sdk';

// All model-facing wording stays here so the classification rubric is easy to review.
export const questions = {
  primary_function: choice(
    'What is the primary function of the AI system in `ai_system_description`?',
    {
      content_generation: 'Creates new text, images, audio, video, or code.',
      prediction: 'Predicts a value or assigns a category to supplied data.',
      perception: 'Recognizes or transcribes content from images, audio, or sensors.',
      recommendation: 'Ranks or recommends existing items for a user.',
    },
  ),
  supported_function: noul(
    'Does `ai_system_description` establish that the primary function is content generation, prediction, perception, or recommendation?',
    {
      true: 'The description identifies one of these four functions as the main task.',
      false: 'The main task falls outside these functions, or the description gives no identifiable main task.',
    },
  ),
  description_specificity: score(
    'How specifically does `ai_system_description` explain the AI system’s operation?',
    [
      'The description gives a name or vague claim without explaining a task.',
      'The description names a task but leaves its inputs and outputs unclear.',
      'The description explains the task and identifies its inputs and outputs.',
      'The description identifies the task, inputs, and outputs, and illustrates them with a concrete example.',
    ],
  ),
};
