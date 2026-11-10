/** BACKEND: POST /api/observed-values. Asks the AI to draft AO/SO/RO/NO ratings from grade summaries (no names or LRNs are sent). */
import { NextResponse } from 'next/server';
import { guard, HttpError, limiter } from '@/server/core/guard';
import { toResponse } from '@/server/core/http';
import { AiError, callAi } from '@/server/core/llm';
import { decideObservedValues, type LearnerSummary } from '@/server/observed/values';

export const runtime = 'nodejs';
export const maxDuration = 120;
const MAX_LEARNERS = 500;

const quarter = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function POST(request: Request) {
  try {
    guard(request);
    const body = (await request.json().catch(() => null)) as { learners?: unknown } | null;
    if (!body || !Array.isArray(body.learners) || !body.learners.length) throw new HttpError(400, 'No learners were sent.');
    if (body.learners.length > MAX_LEARNERS) throw new HttpError(413, `At most ${MAX_LEARNERS} learners at a time.`);
    const learners: LearnerSummary[] = body.learners.map((raw: { id?: unknown; quarterAverage?: Record<string, unknown>; failing?: unknown }) => ({
      id: Number(raw?.id),
      quarterAverage: { q1: quarter(raw?.quarterAverage?.q1), q2: quarter(raw?.quarterAverage?.q2), q3: quarter(raw?.quarterAverage?.q3), q4: quarter(raw?.quarterAverage?.q4) },
      failing: Number.isInteger(raw?.failing) ? Number(raw.failing) : 0
    })).filter((l: LearnerSummary) => Number.isFinite(l.id));
    if (!learners.length) throw new HttpError(400, 'No valid learners were sent.');
    const result = await decideObservedValues(learners, callAi, () => limiter.takeCall());
    return NextResponse.json({ values: Object.fromEntries(result) });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ detail: error.message }, { status: error.kind === 'config' ? 503 : 502 });
    return toResponse(error);
  }
}
