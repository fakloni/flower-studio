import { normalizeUsage, parsePrediction, estimateCost } from './core.mjs';

export const predictionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    group: { type: ['string', 'null'] }, name: { type: ['string', 'null'] },
    cultivar: { type: ['string', 'null'] },
    top3: { type: 'array', items: { type: 'string' }, maxItems: 3 }, unknown: { type: 'boolean' },
  }, required: ['group', 'name', 'cultivar', 'top3', 'unknown'],
};

export function buildRequest(model, prompt, image, apiKey) {
  const dataUrl = `data:${image.mime};base64,${image.base64}`;
  const format = { type: 'json_schema', name: 'flower_recognition', strict: true, schema: predictionSchema };
  let body;
  let headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  if (model.protocol === 'openai-responses') {
    body = { ...model.parameters, model: model.model, store: false,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: dataUrl }] }],
      text: { format } };
  } else if (model.protocol === 'ark-chat') {
    body = { ...model.parameters, model: model.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      response_format: { type: 'json_schema', json_schema: { name: format.name, strict: true, schema: predictionSchema } } };
  } else if (model.protocol === 'gemini-interactions') {
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
    body = { ...model.parameters, model: model.model, store: false,
      input: [{ type: 'text', text: prompt }, { type: 'image', mime_type: image.mime, data: image.base64 }],
      response_format: { type: 'text', mime_type: 'application/json', schema: predictionSchema } };
  } else throw new Error('不支持的识别协议');
  return { headers, body };
}

export function extractText(protocol, raw) {
  if (protocol === 'ark-chat') {
    const choice = raw.choices?.[0];
    if (choice?.finish_reason !== 'stop') throw new Error('返回未正常完成');
    if (typeof choice.message?.content !== 'string') throw new Error('未返回文本');
    return choice.message.content;
  }
  if (protocol === 'openai-responses') {
    if (raw.status !== 'completed') throw new Error('返回未正常完成');
    return (raw.output ?? []).filter(item => item.type === 'message' && item.role === 'assistant')
      .flatMap(item => item.content ?? []).filter(item => item.type === 'output_text').map(item => item.text).join('');
  }
  if (raw.status !== 'completed') throw new Error('返回未正常完成');
  // The current REST response uses steps; output_text is an SDK convenience.
  return (raw.steps ?? []).filter(step => step.type === 'model_output')
    .flatMap(step => step.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('');
}

export function redact(value, secrets) {
  let serialized = JSON.stringify(value);
  if (serialized === undefined) return null;
  for (const secret of secrets.filter(Boolean)) serialized = serialized.split(secret).join('[REDACTED]');
  return JSON.parse(serialized);
}

export async function invoke(model, prompt, image, apiKey, timeoutMs, fetchImpl = fetch) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const request = buildRequest(model, prompt, image, apiKey);
  let raw = null;
  let requestId = null;
  let httpStatus = null;
  let prediction = null;
  let status = 'network_error';
  let error = null;
  try {
    const response = await fetchImpl(model.endpoint, { method: 'POST', headers: request.headers,
      body: JSON.stringify(request.body), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    httpStatus = response.status;
    requestId = response.headers.get('x-request-id') ?? response.headers.get('x-tt-logid') ?? response.headers.get('request-id');
    const text = await response.text();
    try { raw = JSON.parse(text); } catch { raw = { nonJsonResponse: text }; }
    if (!response.ok) { status = 'http_error'; error = `HTTP ${httpStatus}`; }
    else {
      try { prediction = parsePrediction(extractText(model.protocol, raw)); status = 'ok'; }
      catch { status = 'invalid_response'; error = '响应未完成或不符合识别 JSON 结构'; }
    }
  } catch (cause) {
    status = cause?.name === 'TimeoutError' || cause?.name === 'AbortError' ? 'timeout' : 'network_error';
    error = status === 'timeout' ? '请求超时，费用可能已产生' : '网络请求失败，费用状态未知';
  }
  const usageRaw = raw?.usage ?? null;
  const usage = normalizeUsage(model.protocol, usageRaw);
  return { startedAt, elapsedMs: performance.now() - started, status, error, httpStatus, requestId,
    responseId: raw?.id ?? null, returnedModel: raw?.model ?? null,
    prediction, usage, usageRaw: redact(usageRaw, [apiKey]),
    cost: estimateCost(model, usage, startedAt), billedCost: null, raw: redact(raw, [apiKey]) };
}
