// Native Jev question schema, shared without importing server SDK code into the UI.
export const EVIDENCE_QUESTION_VERSION = 'oversight-evidence-1';
export const evidenceQuestionConfig = {
  evidence_judgment: {
    type: 'choice',
    instructions: 'What does `passage.text` establish about the statement in `control.statement` for the system and actions described? Judge only this passage, not other documents or legal compliance.',
    criteria: {
      supported: 'The passage establishes the approval arrangement required by the control statement for the relevant system and actions. Generic human involvement alone is not sufficient.',
      contradicted: 'The passage explicitly describes an arrangement incompatible with the control statement, such as execution without the required approval. Silence about approval is not a contradiction.',
      insufficient_evidence: 'The passage does not address the required approval arrangement, or concerns a different process or review target, such as editorial review of release notes.',
      ambiguous: 'The passage addresses the relevant arrangement but its wording is vague, conditional, or internally conflicting, so neither support nor contradiction can be established.',
    },
  },
  addresses_control: {
    type: 'noul',
    instructions: 'Does `passage.text` address human approval or control of the relevant system actions in `control.statement`?',
    criteria: {
      true: 'The passage discusses approval or control of the relevant actions, including absent, vague, or conflicting arrangements.',
      false: 'The passage describes unrelated activities or gives no information about approval or control of the relevant actions.',
    },
  },
};
