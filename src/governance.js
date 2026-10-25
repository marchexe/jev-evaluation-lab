import { choice, noul, score } from '@typesafe-ai/sdk';

// Documentation judgments only: no legal risk category or compliance determination.
export const governanceQuestions = {
  intended_use_case: choice(
    'What is the main intended use of the system in `ai_system_description`?',
    {
      hr_recruitment: 'Screens, ranks, or selects job applicants.',
      hr_workforce_management: 'Allocates work or evaluates existing workers.',
      finance_credit_assessment: 'Assesses a borrower for lending or credit terms.',
      finance_operations: 'Supports financial reporting, accounting, payments, or transaction monitoring.',
      education_assessment: 'Evaluates learners, grades work, or supports admission decisions.',
      education_learning_support: 'Provides tutoring, learning materials, or study assistance.',
      customer_support: 'Answers customer service questions or handles support requests.',
    },
  ),
  supported_use_case: noul(
    'Does `ai_system_description` identify a main intended use in recruitment, workforce management, credit assessment, financial operations, educational assessment, learning support, or customer support?',
    {
      true: 'The description establishes a main task in one of the listed use cases.',
      false: 'The main task is outside the listed use cases, or the description leaves the intended use unspecified.',
    },
  ),
  personal_data_evidence: choice(
    'What does `ai_system_description` document about processing information linked to identifiable people?',
    {
      documented_processing: 'Inputs, outputs, or operations involve identifiable people, such as named resumes, customer account records, or student profiles, without a contradictory exclusion. Removing names alone does not exclude processing if other identifiers remain.',
      explicitly_excluded: 'The description explicitly states that no information linked to identifiable people is processed, or confines all processing to synthetic or irreversibly anonymous data with no identifiable inputs, without contradictory identifiable data use.',
      not_documented: 'The description gives no information about whether data relates to identifiable people, including when it says data details are unspecified. Missing information is not an explicit exclusion.',
      unclear: 'The description addresses data handling but leaves identifiability unresolved, for example by saying only "anonymized" or "privacy friendly".',
      conflicting: 'The description makes incompatible claims, such as denying all identifiable data processing while describing named customer inputs.',
    },
  ),
  human_oversight_evidence: choice(
    'What does `ai_system_description` document about human review or control of the system outputs and actions?',
    {
      documented: 'A human role and a concrete review, approval, monitoring, override, or intervention step are described without a contradictory denial. This records a mechanism, not its adequacy.',
      explicitly_absent: 'The description explicitly rules out human review and intervention for the system outputs and actions without describing a contradictory oversight step. Automated operation alone does not establish absence.',
      not_documented: 'No human review or control arrangement is described, including when the text says oversight is unspecified. Missing information is not evidence that oversight is absent.',
      unclear: 'Human oversight is mentioned without a concrete mechanism, for example "humans stay in control" without explaining how.',
      conflicting: 'The description makes incompatible claims about the same oversight step, such as requiring approval before every action while explicitly denying any human review.',
    },
  ),
  description_completeness: score(
    'How completely does `ai_system_description` document the purpose, users or affected people, data inputs, outputs and their use, and human oversight?',
    [
      'The description gives a name or broad claim without an identifiable purpose.',
      'The description identifies a purpose but leaves data inputs or outputs and their use unspecified.',
      'The description explains the purpose, data inputs, outputs and their use, but leaves users or affected people or the oversight arrangement unspecified.',
      'The description explains the purpose, users or affected people, data inputs, outputs and their use, and the oversight arrangement. An explicit statement that oversight is absent still documents the arrangement.',
    ],
  ),
};
