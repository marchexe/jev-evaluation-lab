import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/classify.js', import.meta.url));
const input = fileURLToPath(new URL('../examples/ai-system.txt', import.meta.url));
const casesPath = fileURLToPath(new URL('../examples/governance/cases.json', import.meta.url));

async function inWorkspace(run) {
  const cwd = await mkdtemp(join(tmpdir(), 'jev-cli-'));
  try {
    await run(cwd);
  } finally {
    assert.equal(dirname(resolve(cwd)), resolve(tmpdir()));
    await rm(cwd, { recursive: true, force: true });
  }
}

function cli(cwd, args = [], env = {}) {
  const childEnv = { ...process.env };
  delete childEnv.TYPESAFE_API_KEY;
  delete childEnv.TYPESAFE_DEFAULT_MODEL;
  const result = spawnSync(process.execPath, [
    '--import', 'data:text/javascript,globalThis.fetch = undefined;',
    script, '--input', input, ...args,
  ], {
    cwd,
    encoding: 'utf8',
    env: { ...childEnv, ...env },
    timeout: 5_000,
  });
  assert.ifError(result.error);
  return result;
}

test('default preview uses actual SDK question builders without credentials or result files', async () => {
  await inWorkspace(async (cwd) => {
    const result = cli(cwd);
    assert.equal(result.status, 0, result.stderr);
    const request = JSON.parse(result.stdout);
    assert.equal(request.model, 'jev-latest');
    assert.equal(request.state.ai_system_description, (await readFile(input, 'utf8')).trim());
    assert.deepEqual(Object.values(request.questions).map((question) => question.type), ['choice', 'noul', 'score']);
    assert.match(result.stderr, /no API call made/);
    assert.deepEqual(await readdir(cwd), []);
  });
});

test('preview loads .env, keeps an existing environment value, and never prints the key', async () => {
  await inWorkspace(async (cwd) => {
    await writeFile(join(cwd, '.env'), 'TYPESAFE_API_KEY=offline-secret\nTYPESAFE_DEFAULT_MODEL=jev-latest\n');
    const result = cli(cwd, [], { TYPESAFE_DEFAULT_MODEL: 'jev-1.14.0' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).model, 'jev-1.14.0');
    assert.doesNotMatch(result.stdout + result.stderr, /offline-secret/);
  });
});

test('live mode rejects a missing API key before creating output or contacting Jev', async () => {
  await inWorkspace(async (cwd) => {
    const result = cli(cwd, ['--live']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Set TYPESAFE_API_KEY/);
    assert.deepEqual(await readdir(cwd), []);
  });
});

test('a key from .env reaches SDK setup, which cannot send requests with fetch disabled', async () => {
  await inWorkspace(async (cwd) => {
    await writeFile(join(cwd, '.env'), 'TYPESAFE_API_KEY=offline-secret\n');
    const result = cli(cwd, ['--live']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SDK rejected/);
    assert.doesNotMatch(result.stdout + result.stderr, /offline-secret|Set TYPESAFE_API_KEY/);
  });
});

test('empty input and invalid arguments fail locally', async () => {
  await inWorkspace(async (cwd) => {
    await writeFile(join(cwd, 'empty.txt'), '  \n');
    const empty = cli(cwd, ['--input', 'empty.txt']);
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /must not be empty/);
    const invalid = cli(cwd, ['--unknown']);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Unknown option/);
    const missing = cli(cwd, ['--input', 'missing.txt']);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /ENOENT/);
  });
});

test('all synthetic governance cases preview through the CLI without credentials or writes', async () => {
  const cases = JSON.parse(await readFile(casesPath, 'utf8'));
  await inWorkspace(async (cwd) => {
    for (const entry of cases) {
      const result = cli(cwd, ['--profile', 'governance', '--input', casesPath, '--case', entry.id]);
      assert.equal(result.status, 0, result.stderr);
      const request = JSON.parse(result.stdout);
      assert.equal(request.state.ai_system_description, entry.description);
      assert.equal(request.questions.intended_use_case.type, 'choice');
      assert.equal(request.questions.supported_use_case.type, 'noul');
      assert.equal(request.questions.description_completeness.type, 'score');
      assert.match(result.stderr, /no API call made/);
    }
    assert.deepEqual(await readdir(cwd), []);
  });
});

test('unknown profiles and case IDs fail locally', async () => {
  await inWorkspace(async (cwd) => {
    const profile = cli(cwd, ['--profile', 'missing']);
    assert.equal(profile.status, 1);
    assert.match(profile.stderr, /Unknown profile/);
    const missingCase = cli(cwd, ['--input', casesPath, '--case', 'missing']);
    assert.equal(missingCase.status, 1);
    assert.match(missingCase.stderr, /Unknown case ID/);
    const live = cli(cwd, ['--profile', 'governance', '--live']);
    assert.equal(live.status, 1);
    assert.match(live.stderr, /Set TYPESAFE_API_KEY/);
    assert.deepEqual(await readdir(cwd), []);
  });
});

test('CLI help documents the supported profiles and preview default', async () => {
  await inWorkspace(async (cwd) => {
    const help = cli(cwd, ['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /technical\|governance/);
    assert.match(help.stdout, /Default: preview the request locally/);
    assert.deepEqual(await readdir(cwd), []);
  });
});
