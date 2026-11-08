import { readFile } from 'node:fs/promises';
import { resolveEvidenceTarget, validateEvidenceResult, type EvidenceResult } from '../src/ui/evidence-runs';

/** Replay an actual study request/response. Only local application metadata changes. */
export async function studyRecording(file: string): Promise<EvidenceResult> {
  const source = JSON.parse(await readFile(new URL(`../examples/evidence/jev-study/recorded/${file}`, import.meta.url), 'utf8'));
  const state = source.assessment.request.state;
  const item = resolveEvidenceTarget({ passageId: state.passage.id, controlId: state.control.id });
  const result = { schemaVersion: 1 as const, experimentId: item.experimentId, caseId: item.id, datasetVersion: item.datasetVersion,
    controlId: item.controlId, passage: item.passage, questionVersion: source.configuration.version, questionConfiguration: source.configuration,
    assessment: { ...source.assessment, profile: 'evidence' },
    recordingSource: { file: `examples/evidence/jev-study/recorded/${file}`, normalization: 'New Explorer envelope; application profile evidence-study -> evidence. Original SDK request, response and inference metadata unchanged.' } };
  validateEvidenceResult(result);
  return result;
}
