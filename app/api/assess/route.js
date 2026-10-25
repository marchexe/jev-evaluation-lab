import { createAssessmentHandler } from '../../../src/server/assessment-route.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createAssessmentHandler();
