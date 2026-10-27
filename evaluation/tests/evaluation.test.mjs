import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig, validateDataset, parsePrediction, scorePrediction, normalizeUsage, estimateCost, summarize, sha256 } from '../src/core.mjs';
import { buildRequest, invoke } from '../src/providers.mjs';
import { executePlan, loadPlan, scoreRun } from '../src/cli.mjs';

const prediction = { group: '菊花', name: '乒乓菊', cultivar: null, top3: ['乒乓菊', '小菊'], unknown: false };
const sample = { id: 's1', image: 'flower.png', reviewed: true, truth: { group: ['菊花'], name: ['乒乓菊'], cultivar: [] } };
const price = { currency: 'USD', inputPerMillion: 2, cachedInputPerMillion: .2, outputPerMillion: 10, validFrom: '2026-10-27', validThrough: '2026-11-30' };
const model = { id: 'test', provider: 'fixture', enabled: true, task: 'recognition', model: 'fixture-model', protocol: 'openai-responses',
  endpoint: 'https://example.com/v1/responses', apiKeyEnv: 'EVAL_TEST_KEY', parameters: { max_output_tokens: 1000 }, price };
const image = { mime: 'image/png', base64: 'AA==', sha256: 'fixture' };
const day = '2026-10-27T00:00:00.000Z';
const completed = { status: 'completed', model: 'fixture-model', id: 'response-test',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(prediction) }] }],
  usage: { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 100 }, output_tokens_details: { reasoning_tokens: 50 } } };

test('strict aliases and hierarchy: a broad answer cannot pass a specific label', () => {
  assert.deepEqual(scorePrediction(sample, prediction), { group: true, name: true, cultivar: null, top3: true });
  const broad = { ...prediction, name: '菊花', top3: ['菊花'] };
  assert.equal(scorePrediction(sample, broad).name, false);
  assert.equal(scorePrediction(sample, broad).group, true);
  assert.equal(scorePrediction(sample, { ...prediction, name: '球菊', top3: ['球菊'] }).name, false);
  assert.equal(scorePrediction({ ...sample, truth: { ...sample.truth, name: ['乒乓菊', '球菊'] } }, { ...prediction, name: '球菊', top3: ['球菊'] }).name, true);
});

test('unknown, malformed and missing predictions never inflate accuracy', () => {
  assert.throws(() => parsePrediction(JSON.stringify({ ...prediction, unknown: true })));
  assert.throws(() => parsePrediction(JSON.stringify({ ...prediction, top3: ['小菊'] })));
  assert.throws(() => parsePrediction(JSON.stringify({ ...prediction, top3: ['乒乓菊', '乒乓菊'] })));
  const unknown = parsePrediction('{"group":null,"name":null,"cultivar":null,"top3":[],"unknown":true}');
  assert.equal(scorePrediction(sample, unknown).name, false);
  assert.equal(scorePrediction({ ...sample, truth: { group: [], name: ['unknown'], cultivar: [] } }, unknown).name, true);
  const samples = [sample, { ...sample, id: 's2' }, { ...sample, id: 's3' }];
  const result = summarize(samples, ['test'], [
    { modelId: 'test', sampleId: 's1', status: 'ok', prediction, elapsedMs: 100 },
    { modelId: 'test', sampleId: 's2', status: 'invalid_response' },
  ])[0];
  assert.equal(result.metrics.name.accuracy, 1 / 3);
  assert.equal(result.failed, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.metrics.cultivar.accuracy, null);
  assert.throws(() => summarize(samples, ['test'], [{ modelId: 'test', sampleId: 'outside', status: 'ok', prediction }]));
  assert.throws(() => summarize(samples, ['test'], Array(2).fill({ modelId: 'test', sampleId: 's1', status: 'ok', prediction })));
});

test('cost avoids reasoning double-counting; Gemini thought tokens are additive', () => {
  const openai = normalizeUsage('openai-responses', completed.usage);
  assert.equal(openai.billableOutput, 100);
  assert.ok(Math.abs(estimateCost({ price }, openai, day).amount - .00282) < 1e-12);
  const gemini = normalizeUsage('gemini-interactions', { total_input_tokens: 1000, total_output_tokens: 100, total_thought_tokens: 50, total_cached_tokens: 100 });
  assert.equal(gemini.billableOutput, 150);
  assert.ok(Math.abs(estimateCost({ price }, gemini, day).amount - .00332) < 1e-12);
  assert.equal(normalizeUsage('gemini-interactions', { total_input_tokens: 10, total_output_tokens: 20 }).billableOutput, null);
  assert.equal(estimateCost({ price }, normalizeUsage('ark-chat', null), day).amount, null);
  assert.equal(estimateCost({ price }, openai, '2026-12-01').amount, null);
  assert.equal(estimateCost({ price: { ...price, maxInputTokens: 10 } }, openai, day).amount, null);
  assert.equal(estimateCost({ price }, { ...openai, cachedInput: null }, day).status, 'uncached_upper_bound');
});

test('each provider sends image bytes and prompt, without truth or filename', () => {
  for (const protocol of ['openai-responses', 'ark-chat', 'gemini-interactions']) {
    const request = buildRequest({ ...model, protocol, parameters: {} }, 'anonymous recognition', image, 'secret');
    const body = JSON.stringify(request.body);
    assert.ok(body.includes('AA=='));
    assert.ok(!body.includes('flower.png'));
    assert.ok(!body.includes('乒乓菊'));
    assert.ok(!body.includes('secret'));
    if (protocol !== 'ark-chat') assert.equal(request.body.store, false);
  }
});

test('native adapters extract final text and keep usage even on invalid responses', async () => {
  const replies = [
    ['openai-responses', completed],
    ['ark-chat', { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(prediction) } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }],
    ['gemini-interactions', { status: 'completed', steps: [{ type: 'thought', summary: [{ type: 'text', text: 'ignore' }] },
      { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(prediction) }] }],
    usage: { total_input_tokens: 10, total_output_tokens: 20, total_thought_tokens: 30 } }],
  ];
  for (const [protocol, reply] of replies) {
    const result = await invoke({ ...model, protocol }, 'prompt', image, 'secret', 1000,
      async () => new Response(JSON.stringify(reply), { headers: { 'x-request-id': 'fixture-request' } }));
    assert.equal(result.status, 'ok');
    assert.equal(result.prediction.name, '乒乓菊');
    assert.equal(result.requestId, 'fixture-request');
  }
  const invalid = await invoke(model, 'prompt', image, 'secret', 1000,
    async () => new Response(JSON.stringify({ ...completed, output: [], echo: 'secret' })));
  assert.equal(invalid.status, 'invalid_response');
  assert.equal(invalid.usage.input, 1000);
  assert.equal(invalid.raw.echo, '[REDACTED]');
  const httpError = await invoke(model, 'prompt', image, 'secret', 1000,
    async () => new Response('rate limited', { status: 429 }));
  assert.equal(httpError.status, 'http_error');
  assert.equal(httpError.cost.amount, null);
  const timedOut = await invoke(model, 'prompt', image, 'secret', 1000,
    async () => { throw new DOMException('fixture', 'TimeoutError'); });
  assert.equal(timedOut.status, 'timeout');
  assert.equal(timedOut.cost.amount, null);
});

test('config rejects injected request fields, credentials in URL and duplicate IDs', async () => {
  const checkedIn = JSON.parse(await readFile(new URL('../config/models.example.json', import.meta.url), 'utf8'));
  validateConfig(checkedIn);
  assert.equal(checkedIn.models.filter(m => m.task === 'recognition' && m.enabled).length, 9);
  const config = { schemaVersion: 1, models: [model] };
  validateConfig(config);
  assert.throws(() => validateConfig({ ...config, models: [model, model] }));
  assert.throws(() => validateConfig({ ...config, models: [{ ...model, parameters: { input: 'replace' } }] }));
  assert.throws(() => validateConfig({ ...config, models: [{ ...model, endpoint: 'https://secret@example.com/' }] }));
  assert.throws(() => validateDataset({ schemaVersion: 1, samples: [sample, sample] }));
});

test('offline end-to-end: request cap, run snapshots, scoring and no overwrite', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flower-evaluation-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const oldKey = process.env.EVAL_TEST_KEY;
  process.env.EVAL_TEST_KEY = 'fixture-not-a-real-key';
  t.after(() => { if (oldKey === undefined) delete process.env.EVAL_TEST_KEY; else process.env.EVAL_TEST_KEY = oldKey; });
  await mkdir(join(dir, 'config'));
  await writeFile(join(dir, 'prompt.txt'), 'Identify the visible flower.');
  await writeFile(join(dir, 'flower.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
  const datasetPath = join(dir, 'dataset.json');
  const dataset = { schemaVersion: 1, samples: [sample] };
  await writeFile(datasetPath, JSON.stringify(dataset));
  const configPath = join(dir, 'config', 'models.json');
  await writeFile(configPath, JSON.stringify({ schemaVersion: 1, defaults: { promptFile: '../prompt.txt' }, models: [model] }));
  const plan = await loadPlan(configPath, datasetPath);
  let calls = 0;
  const callback = async () => { calls++; return { ...await invoke(model, 'prompt', image, 'fixture-not-a-real-key', 1000,
    async () => new Response(JSON.stringify(completed))), startedAt: day }; };
  await assert.rejects(executePlan(plan, join(dir, 'too-many'), 0, callback), /超过上限/);
  assert.equal(calls, 0);
  const out = join(dir, 'run');
  await executePlan(plan, out, 1, callback);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await readFile(join(out, 'run.json'), 'utf8')).datasetSha256, sha256(JSON.stringify(dataset)));
  const summary = await scoreRun(out, datasetPath, join(dir, 'rescored.json'));
  assert.equal(summary[0].metrics.name.accuracy, 1);
  await assert.rejects(executePlan(plan, out, 1, callback), { code: 'EEXIST' });
  await writeFile(datasetPath, JSON.stringify({ ...dataset, samples: [{ ...sample, notes: 'changed' }] }));
  await assert.rejects(scoreRun(out, datasetPath, join(dir, 'different.json')), /快照不同/);
});
