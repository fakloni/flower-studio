import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { sha256, validateConfig, validateDataset, summarize, summaryCsv, scorePrediction } from './core.mjs';
import { invoke } from './providers.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const evaluationRoot = join(repoRoot, 'evaluation');
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\ufeff/, ''));
const save = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export async function prepareDataset(output) {
  const catalog = await json(join(repoRoot, 'data/catalog/catalog.json'));
  const assets = await json(join(repoRoot, 'data/catalog/assets.json'));
  const products = new Map(catalog.products.map(product => [product.id, product]));
  const { relative } = await import('node:path');
  const samples = assets.assets.filter(asset => asset.kind === 'photo' && asset.mediaOrigin === 'real-photo').map((asset, index) => {
    const product = products.get(asset.productId);
    return { id: `sample-${String(index + 1).padStart(3, '0')}`,
      image: relative(dirname(output), join(repoRoot, 'public', asset.coverUrl.replace(/^\//, ''))).replaceAll('\\', '/'),
      reviewed: false, truth: { group: product?.group ? [product.group] : [], name: product?.name ? [product.name] : [], cultivar: [] },
      productId: asset.productId, sourceGroup: asset.sourceUrl ?? asset.id,
      notes: `目录自动生成的待核标签，不能直接作为真值。${asset.notes ?? ''}` };
  });
  await mkdir(dirname(output), { recursive: true });
  await save(output, { schemaVersion: 1, catalogRevision: catalog.revision, samples });
  return samples.length;
}

export async function loadPlan(configPath, datasetPath, selectedIds) {
  const config = validateConfig(await json(configPath));
  const dataset = validateDataset(await json(datasetPath));
  const requested = selectedIds ? selectedIds.split(',').map(id => id.trim()) : null;
  if (requested && (new Set(requested).size !== requested.length || requested.some(id => !config.models.some(m => m.id === id)))) throw new Error('选择的模型 id 重复或不存在');
  if (requested?.some(id => !config.models.some(m => m.id === id && m.enabled && m.task === 'recognition'))) throw new Error('只能选择已启用的识花模型；生图和已排除模型不能运行');
  const models = config.models.filter(m => m.enabled && m.task === 'recognition' && (!requested || requested.includes(m.id)));
  if (!models.length) throw new Error('没有启用的识花模型');
  const samples = dataset.samples.filter(sample => sample.reviewed);
  const images = new Map();
  for (const sample of dataset.samples) {
    const path = resolve(dirname(datasetPath), sample.image);
    const mime = mimeTypes[extname(path).toLowerCase()];
    if (!mime) throw new Error(`只支持 PNG/JPEG/WebP：${sample.id}`);
    const bytes = await readFile(path);
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error(`图片为空或超过本工具 20MB 限制：${sample.id}`);
    images.set(sample.id, { sha256: sha256(bytes), mime, base64: bytes.toString('base64') });
  }
  const promptPath = resolve(dirname(configPath), config.defaults?.promptFile ?? '../prompts/recognition.txt');
  const prompt = await readFile(promptPath, 'utf8');
  if (!prompt.trim()) throw new Error('识花提示词为空');
  return { config, dataset, models, samples, images, prompt };
}

export async function executePlan(plan, output, maxRequests, call = invoke) {
  const { config, dataset, models, samples, images, prompt } = plan;
  if (!samples.length) throw new Error('没有人工复核样本。请核对标签后把 reviewed 改为 true');
  if (models.length * samples.length > maxRequests) throw new Error(`计划 ${models.length * samples.length} 次请求超过上限 ${maxRequests}；本次未发出请求`);
  for (const model of models) {
    if (!process.env[model.apiKeyEnv]) throw new Error(`缺少环境变量 ${model.apiKeyEnv}；本次未发出请求`);
  }
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output); // Never overwrite a previous run.
  const secrets = models.map(model => process.env[model.apiKeyEnv]);
  const { redact } = await import('./providers.mjs');
  const safeModels = redact(models, secrets);
  const metadata = { schemaVersion: 1, startedAt: new Date().toISOString(), task: 'recognition-open',
    prompt, promptSha256: sha256(prompt), configSha256: sha256(JSON.stringify(safeModels)),
    datasetSha256: sha256(JSON.stringify(dataset)), models: safeModels,
    samples: samples.map(sample => ({ ...sample, imageSha256: images.get(sample.id).sha256 })),
    maxRequests, timeoutMs: config.defaults?.timeoutMs ?? 120000,
    note: '单轮、顺序执行、无自动重试；费用为估算，未对账。失败和未完成样本纳入计划分母。' };
  await save(join(output, 'run.json'), metadata);
  await writeFile(join(output, 'results.jsonl'), '', { flag: 'wx', mode: 0o600 });
  const records = [];
  try {
    for (const sample of samples) {
      // Interleave models for each sample rather than exhausting a provider first.
      for (const model of models) {
        const result = await call(model, prompt, images.get(sample.id), process.env[model.apiKeyEnv], metadata.timeoutMs);
        const { raw, ...metrics } = result;
        const stem = `${String(records.length + 1).padStart(6, '0')}`;
        const record = { ...metrics, sampleId: sample.id, modelId: model.id, requestedModel: model.model,
          provider: model.provider, protocol: model.protocol, imageSha256: images.get(sample.id).sha256, rawFile: `${stem}.json` };
        await save(join(output, `${stem}.json`), redact(raw, secrets));
        await appendFile(join(output, 'results.jsonl'), JSON.stringify(redact(record, secrets)) + '\n');
        records.push(record);
        console.log(`${records.length}/${models.length * samples.length} ${model.id} ${sample.id}: ${record.status}`);
      }
    }
  } finally {
    const summary = summarize(samples, models.map(m => m.id), records);
    await save(join(output, 'summary.json'), summary);
    await writeFile(join(output, 'summary.csv'), summaryCsv(summary), { flag: 'wx', mode: 0o600 });
    const errors = samples.flatMap(sample => models.map(model => {
      const record = records.find(row => row.modelId === model.id && row.sampleId === sample.id);
      const scores = scorePrediction(sample, record?.status === 'ok' ? record.prediction : null);
      return { sampleId: sample.id, modelId: model.id, status: record?.status ?? 'missing',
        prediction: record?.prediction ?? null, truth: sample.truth, scores };
    })).filter(row => row.status !== 'ok' || Object.values(row.scores).some(value => value === false));
    await save(join(output, 'errors.json'), errors);
  }
  return records;
}

export async function scoreRun(input, datasetPath, output) {
  const run = await json(join(input, 'run.json'));
  const dataset = validateDataset(await json(datasetPath));
  if (sha256(JSON.stringify(dataset)) !== run.datasetSha256) throw new Error('当前样本/答案与本批次快照不同；请使用原清单，避免混用真值');
  const content = await readFile(join(input, 'results.jsonl'), 'utf8');
  const records = content.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  const summary = summarize(run.samples, run.models.map(m => m.id), records);
  await mkdir(dirname(output), { recursive: true });
  await save(output, summary);
  await writeFile(output.replace(/\.json$/i, '') + '.csv', summaryCsv(summary), { flag: 'wx', mode: 0o600 });
  return summary;
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    config: { type: 'string' }, dataset: { type: 'string' }, models: { type: 'string' },
    out: { type: 'string' }, input: { type: 'string' }, 'max-requests': { type: 'string' },
    execute: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  const command = positionals[0] ?? 'help';
  if (values.help || command === 'help') {
    console.log('命令：prepare | check | run | score。run 默认仅预览；--execute 才调用 API。详见 evaluation/README.md');
    return;
  }
  if (positionals.length > 1 || !['prepare', 'check', 'run', 'score'].includes(command)) throw new Error('未知命令或多余参数');
  const configPath = resolve(values.config ?? join(evaluationRoot, 'config/models.example.json'));
  const datasetPath = resolve(values.dataset ?? join(evaluationRoot, 'datasets/catalog-review.local.json'));
  if (command === 'prepare') {
    const output = resolve(values.out ?? datasetPath);
    console.log(`已生成 ${await prepareDataset(output)} 个待核样本：${output}`);
    return;
  }
  if (command === 'score') {
    if (!values.input || !values.out) throw new Error('score 需要 --input 批次文件夹及 --out 新的汇总 JSON 路径');
    console.log(JSON.stringify(await scoreRun(resolve(values.input), datasetPath, resolve(values.out)), null, 2));
    return;
  }
  const plan = await loadPlan(configPath, datasetPath, values.models);
  const maximum = Number(values['max-requests'] ?? plan.config.defaults?.maxRequests ?? 30);
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error('请求上限必须为正整数');
  console.log(`可用模型 ${plan.models.length}；已复核 ${plan.samples.length}/${plan.dataset.samples.length}；计划 ${plan.models.length * plan.samples.length} 次；上限 ${maximum}`);
  if (command === 'check' || !values.execute) {
    console.log('本地检查通过，未调用 API。未复核样本不会运行。');
    return;
  }
  const envFile = join(evaluationRoot, '.env.local');
  if (existsSync(envFile)) loadEnvFile(envFile);
  const output = resolve(values.out ?? join(evaluationRoot, 'runs', new Date().toISOString().replaceAll(/[:.]/g, '-') ));
  await executePlan(plan, output, maximum);
  console.log(`结果已保存：${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.code ? `操作失败（${error.code}），请检查输入文件和路径` : error.message); process.exitCode = 1; });
}
