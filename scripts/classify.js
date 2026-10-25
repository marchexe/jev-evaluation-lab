import { loadEnvFile } from 'node:process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  TypeSafeError,
} from '@typesafe-ai/sdk';
import { assessDescription, buildAssessmentRequest } from '../src/assessment.js';

async function main() {
  const { values } = parseArgs({
    options: {
      live: { type: 'boolean', default: false },
      input: { type: 'string' },
      output: { type: 'string' },
      profile: { type: 'string', default: 'technical' },
      case: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log('Usage: npm run classify -- [--profile technical|governance] [--live] [--input description.txt] [--output result.json]');
    console.log('Use --case <id> to select one description from examples/governance/cases.json (or a JSON --input).');
    console.log('Default: preview the request locally. --live sends one paid request to Jev.');
    return;
  }

  try {
    loadEnvFile('.env');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const inputPath = resolve(values.input ?? (values.case ? 'examples/governance/cases.json' : 'examples/ai-system.txt'));
  const content = await readFile(inputPath, 'utf8');
  let description = content;
  if (values.case) {
    const cases = JSON.parse(content);
    if (!Array.isArray(cases)) throw new Error('A --case input must be a JSON array.');
    const selected = cases.find((entry) => entry.id === values.case);
    if (!selected) throw new Error('Unknown case ID. See examples/governance/cases.json.');
    description = selected.description;
  }
  const request = buildAssessmentRequest(description, { profile: values.profile });

  if (!values.live) {
    console.log(JSON.stringify(request, null, 2));
    console.error('Preview only: no API call made and no result file written. Add --live to call Jev.');
    return;
  }

  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) throw new Error('Set TYPESAFE_API_KEY in your environment or .env before using --live.');

  const defaultOutput = values.profile === 'governance' ? 'results/governance-assessment.json'
    : 'results/classification.json';
  const outputPath = resolve(values.output ?? defaultOutput);
  if (outputPath === inputPath) {
    throw new Error('The output path must differ from the input path.');
  }
  await mkdir(dirname(outputPath), { recursive: true });
  console.error(`Sending the description and ${Object.keys(request.questions).length} questions to Jev (one paid request; retries disabled).`);
  const structuredResult = await assessDescription(description, {
    profile: values.profile, model: request.model, live: true, apiKey,
  });
  console.error(`Jev request latency: ${structuredResult.latencyMs} ms`);
  const json = `${JSON.stringify(structuredResult, null, 2)}\n`;
  try {
    await writeFile(outputPath, json, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    // Preserve the real response so a filesystem failure does not require another paid call.
    console.log(json);
    throw new Error('Jev answered, but saving failed. The complete result was printed to stdout; redirect it to a file.', { cause: error });
  }
  console.log(`Saved results to ${outputPath}`);
  console.log(`Tokens: input=${structuredResult.response.usage.input_tokens ?? 'not reported'}, output=${structuredResult.response.usage.output_tokens ?? 'not reported'}`);
}

main().catch((error) => {
  // Do not print raw API bodies, request headers, environment values, or stack traces.
  if (error.latencyMs !== undefined) console.error(`Jev request latency: ${error.latencyMs} ms`);
  if (error instanceof APITimeoutError) {
    console.error(`Error: Jev timed out after ${error.timeoutMs} ms. No retry was attempted.`);
  } else if (error instanceof APIConnectionError) {
    console.error('Error: Could not connect to Jev. Check your network connection.');
  } else if (error instanceof APIUserAbortError) {
    console.error('Error: Jev request cancelled.');
  } else if (error instanceof APIError) {
    const hint = {
      401: 'Check TYPESAFE_API_KEY.',
      403: 'Check account permissions.',
      429: 'Rate limited; wait before running again.',
    }[error.status] ?? 'Check the request, model, and TypeSafe service status.';
    console.error(`Error: Jev returned HTTP ${error.status}. ${hint}`);
    if (error.requestId) console.error(`Request ID: ${error.requestId}`);
  } else if (error instanceof TypeSafeError) {
    console.error('Error: The SDK rejected the configuration or request. Check the model and question definitions.');
  } else if (error.code && !error.code.startsWith('ERR_PARSE_ARGS')) {
    console.error(`Error: Local file operation failed (${error.code}). Check .env, input, and output paths and permissions.`);
  } else {
    console.error(`Error: ${error.message}`);
  }
  process.exitCode = 1;
});
