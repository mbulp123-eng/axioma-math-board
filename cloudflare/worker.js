import { AIError, validateAIRequest, buildAIMessages, parseAIResponse, RESPONSE_SCHEMA } from '../ai-core.js';

const MODEL = '@cf/google/gemma-4-26b-a4b-it';
const MAX_BYTES = 1900000;
const DEFAULT_ORIGIN = 'https://mbulp123-eng.github.io';
function headers(origin) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (origin) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
  return h;
}
function json(data, status, origin, extra = {}) { return new Response(JSON.stringify(data), { status, headers: { ...headers(origin), ...extra } }); }
async function readLimitedJSON(request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) throw new AIError('Слишком большой запрос. Уменьшите изображение.', 413, 'too_large');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AIError('Нужен формат application/json.', 415);
  const reader = request.body?.getReader(); if (!reader) throw new AIError('Пустой запрос.');
  let size = 0, text = ''; const decoder = new TextDecoder();
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new AIError('Слишком большой запрос. Уменьшите изображение.', 413, 'too_large'); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); }
  finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw new AIError('Некорректный JSON.'); }
}
export function providerError(error) {
  const message = String(error?.message || '');
  if (/3036|daily free|allocation|quota/i.test(message)) return new AIError('Бесплатный лимит ИИ исчерпан. Попробуйте после его ежедневного обновления. Доска продолжает работать.', 429, 'daily_limit');
  if (/429|rate.limit|capacity|3040|busy/i.test(message)) return new AIError('ИИ сейчас занят. Подождите немного и повторите запрос.', 429, 'busy');
  if (/5035|paid.billing|paid.plan|403/.test(message)) return new AIError('Модель недоступна на текущем тарифе. Владелец сайта должен проверить настройки бесплатного ИИ.', 503, 'model_unavailable');
  return new AIError('Сервис ИИ временно недоступен. Попробуйте позже.', 502, 'provider_error');
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
    const cors = origin === allowed ? origin : null;
    if (origin && !cors) return json({ error: 'Источник запроса не разрешён.', code: 'origin_denied' }, 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(cors) });
    const ready = typeof env.AI?.run === 'function' && typeof env.AI_RATE_LIMITER?.limit === 'function';
    if (request.method === 'GET' && ['/', '/health'].includes(url.pathname)) return json({ service: 'axioma-ai', version: 1, ready, model: MODEL, message: ready ? 'Обработчик настроен. Для проверки модели выполните запрос с доски.' : 'Не настроены AI или AI_RATE_LIMITER. Публикуйте с wrangler.jsonc из репозитория.' }, ready ? 200 : 503, cors);
    if (url.pathname !== '/api/assist') return json({ error: 'Не найдено.' }, 404, cors);
    if (request.method !== 'POST') return json({ error: 'Используйте POST.' }, 405, cors, { Allow: 'POST' });
    // CORS is not authentication. Enforce limits independently of the Origin header.
    if (!ready) return json({ error: 'ИИ ещё не настроен владельцем сайта.', code: 'not_configured' }, 503, cors);
    try {
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip) throw new AIError('Не удалось проверить источник запроса.', 403, 'missing_client');
      const permitted = await env.AI_RATE_LIMITER.limit({ key: ip });
      if (!permitted.success) throw new AIError('Слишком много запросов. Подождите минуту.', 429, 'rate_limit');
      const r = validateAIRequest(await readLimitedJSON(request));
      const { messages, protectedSource } = buildAIMessages(r);
      let output;
      try {
        output = await env.AI.run(MODEL, { messages, max_completion_tokens: r.action === 'hint' ? 700 : 2500, temperature: r.action === 'similar' || r.action === 'custom' ? 0.5 : 0.15, chat_template_kwargs: { enable_thinking: false }, response_format: { type: 'json_schema', json_schema: { name: 'math_assistant', strict: true, schema: RESPONSE_SCHEMA } }, stream: false });
      } catch (error) { throw providerError(error); }
      return json({ result: parseAIResponse(output, r, protectedSource) }, 200, cors);
    } catch (error) {
      const e = error instanceof AIError ? error : new AIError('Не удалось обработать запрос. Попробуйте позже.', 500, 'server_error');
      return json({ error: e.message, code: e.code }, e.status, cors, e.status === 429 ? { 'Retry-After': '60' } : {});
    }
  }
};
