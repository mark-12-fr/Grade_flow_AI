/**
 * Free-tier friendly AI client. Talks to any OpenAI-compatible chat endpoint:
 *   gemini      Google AI Studio free tier   https://aistudio.google.com/apikey
 *   groq        Groq free tier               https://console.groq.com/keys
 *   openrouter  OpenRouter ":free" models    https://openrouter.ai/keys
 *   ollama      Runs on your own computer    https://ollama.com (no key)
 * The model returns JSON that matches a schema; code validates it afterwards.
 */
export const PROVIDERS: Record<string, { base: string; model: string; needsKey: boolean }> = {
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true },
  groq: { base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', needsKey: true },
  openrouter: { base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', needsKey: true },
  ollama: { base: 'http://localhost:11434/v1', model: 'llama3.1', needsKey: false }
};

export class AiError extends Error {
  constructor(message: string, public kind: 'config' | 'ai' | 'file' = 'ai') {
    super(message);
  }
}

export function provider() {
  const name = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  const preset = PROVIDERS[name];
  if (!preset) throw new AiError(`AI_PROVIDER must be one of: ${Object.keys(PROVIDERS).join(', ')}.`, 'config');
  return {
    name,
    base: (process.env.AI_BASE_URL || preset.base).replace(/\/$/, ''),
    model: process.env.AI_MODEL || preset.model,
    needsKey: preset.needsKey
  };
}

export function isConfigured(): boolean {
  try {
    const p = provider();
    return Boolean(process.env.AI_API_KEY) || !p.needsKey;
  } catch {
    return false;
  }
}

export function parseJson(text: string): Record<string, unknown> {
  let t = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fenced) t = fenced[1].trim();
  if (!t.startsWith('{')) {
    const start = t.indexOf('{'), end = t.lastIndexOf('}');
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
  }
  let data: unknown;
  try { data = JSON.parse(t); } catch { throw new AiError('The AI answer was not valid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AiError('The AI answer was not a JSON object.');
  return data as Record<string, unknown>;
}

export interface Tool { name: string; description?: string; input_schema: Record<string, unknown> }
export type Caller = (prompt: string, tool: Tool, maxTokens?: number) => Promise<Record<string, unknown>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const callAi: Caller = async (prompt, tool, maxTokens = 4096) => {
  const { name, base, model, needsKey } = provider();
  const key = process.env.AI_API_KEY ?? '';
  if (needsKey && !key) throw new AiError(`AI_API_KEY is not set on the server (AI_PROVIDER=${name}). See .env.example.`, 'config');
  const system = 'You are a careful data-extraction engine. Reply with ONE JSON object only (no prose, no markdown) ' +
    'that follows this JSON Schema exactly. Use empty strings or empty arrays when a value is not present.\n' + JSON.stringify(tool.input_schema);
  const body: Record<string, unknown> = {
    model, max_tokens: Math.max(maxTokens, 8192), temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }]
  };
  if (name === 'gemini') body.reasoning_effort = 'none';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) };

  let res: Response | null = null;
  for (const [attempt, pause] of [0, 2000, 5000, 10000].entries()) {
    if (pause) await sleep(pause);
    try {
      res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    } catch (error) {
      if (attempt === 3) throw new AiError(`Could not reach the AI service (${name}): ${(error as Error).name}.`);
      continue;
    }
    if (![500, 502, 503, 504].includes(res.status)) break; // free tiers drop busy requests; try again shortly
  }
  if (!res) throw new AiError(`Could not reach the AI service (${name}).`);
  if (res.status === 429) throw new AiError('The free AI quota was reached. Wait a minute and try again.');
  if (res.status === 401 || res.status === 403) throw new AiError(`The AI provider rejected the key (HTTP ${res.status}). Check AI_API_KEY.`, 'config');
  if (res.status >= 400) throw new AiError(`The AI service failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  let choice: { message?: { content?: string }; finish_reason?: string };
  try { choice = (await res.json()).choices[0]; } catch { throw new AiError('The AI service returned an unexpected answer.'); }
  if (choice.finish_reason === 'length') throw new AiError('The AI answer was cut off (too long for this model). Try a smaller file or a model with a larger output limit.');
  return parseJson(choice.message?.content ?? '');
};
