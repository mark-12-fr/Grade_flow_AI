/** BACKEND: GET /api/health. Says whether the AI is set up. Never shows the key. */
import { NextResponse } from 'next/server';
import { isConfigured } from '@/server/core/llm';

export const dynamic = 'force-dynamic';

// Only says whether AI is set up; never exposes the key.
export function GET() {
  return NextResponse.json({ ok: true, ai_configured: isConfigured() });
}
