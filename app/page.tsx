import AssessmentWorkspace from '../components/AssessmentWorkspace';
import { isLiveInferenceEnabled } from '../src/server/config.js';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <AssessmentWorkspace liveEnabled={isLiveInferenceEnabled()} />;
}
