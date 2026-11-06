/**
 * Spend and abuse protection for the AI endpoints.
 * - Optional access code (APP_ACCESS_CODE) so nobody else can use your key through this server.
 * - Per-visitor rate limit (sliding window) and a global daily cap on AI calls.
 * Everything is in memory and configurable with environment variables.
 */
import { timingSafeEqual } from 'node:crypto';

const int = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// 0 means "no limit". All limits are off by default; set them in .env to protect your quota or bill.
export const limits = () => ({
  rateLimit: int('AI_RATE_LIMIT', 0),
  rateWindow: int('AI_RATE_WINDOW', 600),
  dailyCap: int('AI_DAILY_CAP', 0),
  maxSheets: int('AI_MAX_SHEETS', 0),
  maxSheetChars: int('AI_MAX_SHEET_CHARS', 0)
});

export class HttpError extends Error {
  constructor(public status: number, message: string, public headers: Record<string, string> = {}) {
    super(message);
  }
}

export class LimitExceeded extends Error {}

class Limiter {
  hits = new Map<string, number[]>();
  day = new Date().toISOString().slice(0, 10);
  calls = 0;

  reset() { this.hits.clear(); this.calls = 0; }

  checkIp(ip: string) {
    const cfg = limits();
    if (!cfg.rateLimit) return;
    const now = Date.now() / 1000;
    const q = (this.hits.get(ip) ?? []).filter((t) => now - t <= cfg.rateWindow);
    if (q.length >= cfg.rateLimit) {
      const wait = Math.floor(cfg.rateWindow - (now - q[0])) + 1;
      throw new HttpError(429, `Too many AI requests. Try again in ${wait} seconds.`, { 'Retry-After': String(wait) });
    }
    q.push(now);
    this.hits.set(ip, q);
  }

  /** Count one AI call against the daily cap. */
  takeCall() {
    const cap = limits().dailyCap;
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.calls = 0; }
    if (cap && this.calls >= cap) throw new LimitExceeded('The daily AI limit was reached. Try again tomorrow or raise AI_DAILY_CAP.');
    this.calls += 1;
  }
}

const g = globalThis as unknown as { __gfLimiter?: Limiter };
export const limiter = (g.__gfLimiter ??= new Limiter());

export function clientIp(request: Request): string {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return 'local';
}

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/** Throws HttpError when the request must not reach the AI. */
export function guard(request: Request) {
  const code = process.env.APP_ACCESS_CODE ?? '';
  if (code && !safeEqual(request.headers.get('x-access-code') ?? '', code)) {
    throw new HttpError(401, 'An access code is required to use the AI import.');
  }
  limiter.checkIp(clientIp(request));
}
