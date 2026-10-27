import { createHash } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const normalize = value => typeof value === 'string'
  ? value.normalize('NFKC').toLocaleLowerCase('en').replace(/[\s\p{P}]/gu, '') : '';
const numeric = value => Number.isFinite(value) && value >= 0;
const count = (...values) => values.find(value => Number.isInteger(value) && value >= 0) ?? null;

export function validateConfig(config) {
  if (config.schemaVersion !== 1 || !Array.isArray(config.models) || !config.models.length) throw new Error('模型配置格式错误');
  const ids = new Set();
  for (const model of config.models) {
    if (!model.id || ids.has(model.id)) throw new Error('模型配置 id 为空或重复');
    ids.add(model.id);
    if (!['recognition', 'generation'].includes(model.task) || typeof model.enabled !== 'boolean') throw new Error(`模型任务/开关错误：${model.id}`);
    if (model.task !== 'recognition') continue;
    if (!['openai-responses', 'ark-chat', 'gemini-interactions'].includes(model.protocol)) throw new Error(`协议不支持：${model.id}`);
    if (!model.model || !/^[A-Z][A-Z0-9_]*$/.test(model.apiKeyEnv ?? '')) throw new Error(`型号或密钥环境变量名错误：${model.id}`);
    const url = new URL(model.endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(`接口必须是无凭证/查询参数的 HTTPS URL：${model.id}`);
    const allowed = {
      'openai-responses': ['max_output_tokens', 'reasoning', 'temperature', 'top_p'],
      'ark-chat': ['max_tokens', 'thinking', 'reasoning_effort', 'temperature', 'top_p'],
      'gemini-interactions': ['generation_config'],
    }[model.protocol];
    for (const key of Object.keys(model.parameters ?? {})) {
      if (!allowed.includes(key)) throw new Error(`参数 ${key} 不允许覆盖评测请求：${model.id}`);
    }
    const price = model.price;
    if (price && (!['CNY', 'USD'].includes(price.currency) || !numeric(price.inputPerMillion) || !numeric(price.outputPerMillion)
      || (price.cachedInputPerMillion != null && !numeric(price.cachedInputPerMillion)))) throw new Error(`价格格式错误：${model.id}`);
  }
  for (const [key, fallback] of [['timeoutMs', 120000], ['maxRequests', 30]]) {
    const value = config.defaults?.[key] ?? fallback;
    if (!Number.isInteger(value) || value < 1) throw new Error(`${key} 必须是正整数`);
  }
  return config;
}

export function validateDataset(dataset) {
  if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.samples)) throw new Error('样本清单格式错误');
  const ids = new Set();
  for (const sample of dataset.samples) {
    if (!sample.id || ids.has(sample.id) || !sample.image || typeof sample.reviewed !== 'boolean') throw new Error('样本 ID 重复、图片缺失或 reviewed 非布尔值');
    ids.add(sample.id);
    for (const level of ['group', 'name', 'cultivar']) {
      if (!Array.isArray(sample.truth?.[level]) || sample.truth[level].some(label => !normalize(label))) throw new Error(`标签格式错误：${sample.id}/${level}`);
    }
    if (sample.reviewed && !sample.truth.group.length && !sample.truth.name.length) throw new Error(`已复核样本必须有可评分标签：${sample.id}`);
  }
  return dataset;
}

export function parsePrediction(text) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('预测不是对象');
  if (Object.keys(value).sort().join(',') !== 'cultivar,group,name,top3,unknown') throw new Error('预测字段不匹配');
  for (const key of ['group', 'name', 'cultivar']) {
    if (value[key] !== null && (typeof value[key] !== 'string' || !normalize(value[key]))) throw new Error('预测名称格式错误');
  }
  if (typeof value.unknown !== 'boolean' || !Array.isArray(value.top3) || value.top3.length > 3
    || value.top3.some(label => typeof label !== 'string' || !normalize(label))) throw new Error('候选结果格式错误');
  if (new Set(value.top3.map(normalize)).size !== value.top3.length) throw new Error('候选名称重复');
  if (value.unknown && (value.group !== null || value.name !== null || value.cultivar !== null || value.top3.length)) throw new Error('拒识结果不应附带猜测名称');
  if (!value.unknown && (!value.name || normalize(value.top3[0]) !== normalize(value.name))) throw new Error('Top-1 必须与 name 一致');
  return value;
}

export function scorePrediction(sample, prediction) {
  const matches = (labels, value) => labels.some(label => normalize(label) === normalize(value));
  const scores = {};
  for (const level of ['group', 'name', 'cultivar']) {
    scores[level] = sample.truth[level].length
      ? matches(sample.truth[level], prediction?.unknown ? 'unknown' : prediction?.[level]) : null;
  }
  scores.top3 = sample.truth.name.length ? (prediction?.unknown
    ? matches(sample.truth.name, 'unknown')
    : (prediction?.top3 ?? []).some(label => matches(sample.truth.name, label))) : null;
  return scores;
}

// Counts preserve protocol semantics. Gemini Interactions bills final output plus thoughts;
// OpenAI/Ark output totals already include reasoning and must not add it twice.
export function normalizeUsage(protocol, raw) {
  const u = raw ?? {};
  if (protocol === 'gemini-interactions') {
    const output = count(u.total_output_tokens);
    const reasoning = count(u.total_thought_tokens);
    return { input: count(u.total_input_tokens), output,
      billableOutput: output !== null && reasoning !== null ? output + reasoning : null,
      cachedInput: count(u.total_cached_tokens), reasoning, total: count(u.total_tokens) };
  }
  const output = count(u.output_tokens, u.completion_tokens);
  return { input: count(u.input_tokens, u.prompt_tokens), output, billableOutput: output,
    cachedInput: count(u.input_tokens_details?.cached_tokens, u.prompt_tokens_details?.cached_tokens),
    reasoning: count(u.output_tokens_details?.reasoning_tokens, u.completion_tokens_details?.reasoning_tokens),
    total: count(u.total_tokens) };
}

export function estimateCost(model, usage, startedAt) {
  const p = model.price;
  const unknown = reason => ({ amount: null, currency: p?.currency ?? null, status: 'unknown', reason });
  if (!p || usage.input === null || usage.billableOutput === null) return unknown('缺少价格或可计费用量');
  const date = startedAt.slice(0, 10);
  if ((p.validFrom && date < p.validFrom) || (p.validThrough && date > p.validThrough)) return unknown('价格不在已核实有效期内');
  if (p.maxInputTokens && usage.input > p.maxInputTokens) return unknown('超出当前价格规则的输入档位');
  if (usage.cachedInput !== null && usage.cachedInput > usage.input) return unknown('缓存用量大于输入总量');
  if (usage.cachedInput > 0 && p.cachedInputPerMillion == null) return unknown('缺少缓存价格');
  const cached = usage.cachedInput ?? 0;
  const amount = ((usage.input - cached) * p.inputPerMillion + cached * (p.cachedInputPerMillion ?? 0)
    + usage.billableOutput * p.outputPerMillion) / 1e6;
  return { amount, currency: p.currency, status: usage.cachedInput === null ? 'uncached_upper_bound' : 'estimated', reason: null };
}

const fraction = (correct, total) => ({ correct, total, accuracy: total ? correct / total : null });
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] : null;

export function summarize(samples, modelIds, records) {
  const sampleIds = new Set(samples.map(s => s.id));
  const results = new Map();
  for (const record of records) {
    if (!sampleIds.has(record.sampleId) || !modelIds.includes(record.modelId)) throw new Error('结果包含计划外样本或模型');
    const key = JSON.stringify([record.modelId, record.sampleId]);
    if (results.has(key)) throw new Error('同一模型/样本有重复结果，请分开评测批次');
    if (record.status === 'ok') parsePrediction(JSON.stringify(record.prediction));
    results.set(key, record);
  }
  return modelIds.map(modelId => {
    const rows = samples.map(sample => {
      const record = results.get(JSON.stringify([modelId, sample.id]));
      return { sample, record, scores: scorePrediction(sample, record?.status === 'ok' ? record.prediction : null) };
    });
    const metrics = Object.fromEntries(['group', 'name', 'cultivar', 'top3'].map(level => {
      const scored = rows.filter(row => row.scores[level] !== null);
      return [level, fraction(scored.filter(row => row.scores[level]).length, scored.length)];
    }));
    const byClass = {};
    for (const row of rows.filter(row => row.scores.name !== null)) {
      const label = row.sample.truth.name[0];
      byClass[label] ??= { correct: 0, total: 0 };
      byClass[label].total++;
      if (row.scores.name) byClass[label].correct++;
    }
    const classes = Object.entries(byClass).map(([name, value]) => ({ name, ...fraction(value.correct, value.total) }));
    const latencies = rows.filter(row => row.record?.status === 'ok' && numeric(row.record.elapsedMs)).map(row => row.record.elapsedMs);
    const costs = {};
    let unknownCosts = 0;
    for (const { record } of rows) {
      if (!record) continue;
      if (!numeric(record.cost?.amount) || !record.cost?.currency) { unknownCosts++; continue; }
      const currency = record.cost.currency;
      costs[currency] ??= { amount: 0, uncachedUpperBounds: 0 };
      costs[currency].amount += record.cost.amount;
      if (record.cost.status === 'uncached_upper_bound') costs[currency].uncachedUpperBounds++;
    }
    return { modelId, planned: rows.length, completed: rows.filter(row => row.record).length,
      succeeded: rows.filter(row => row.record?.status === 'ok').length,
      failed: rows.filter(row => row.record && row.record.status !== 'ok').length,
      missing: rows.filter(row => !row.record).length, metrics, classes,
      macroNameAccuracy: classes.length ? classes.reduce((sum, row) => sum + row.accuracy, 0) / classes.length : null,
      p50Ms: percentile(latencies, .5), p95Ms: percentile(latencies, .95), costs, unknownCosts };
  });
}

export function summaryCsv(summaries) {
  const fields = ['modelId', 'planned', 'completed', 'succeeded', 'failed', 'missing', 'groupAccuracy', 'nameAccuracy', 'top3Accuracy', 'macroNameAccuracy', 'p50Ms', 'p95Ms', 'costs', 'unknownCosts'];
  const escape = value => '"' + String(value ?? '').replaceAll('"', '""').replace(/^[=+@-]/, "'$&") + '"';
  const rows = summaries.map(s => ({ ...s, groupAccuracy: s.metrics.group.accuracy, nameAccuracy: s.metrics.name.accuracy,
    top3Accuracy: s.metrics.top3.accuracy, costs: JSON.stringify(s.costs) }));
  return '\ufeff' + [fields.map(escape).join(','), ...rows.map(row => fields.map(field => escape(row[field])).join(','))].join('\n') + '\n';
}
