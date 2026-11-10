/** BACKEND: runs a job and streams its progress to the browser. */
import { toResponse } from '@/server/core/http';

/** Reports how far along the server is: percent 0-100 of the server's own work, plus a short label. */
export type Emit = (percent: number, label: string) => void;

/**
 * Runs a job and streams its progress as newline-delimited JSON:
 * {p, l} while it works, then {done: result} or {error: message}.
 */
export function streamJob(run: (emit: Emit) => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      try {
        send({ done: await run((p, l) => send({ p, l })) });
      } catch (error) {
        let detail = 'Unexpected server error.';
        try { detail = ((await toResponse(error).json()) as { detail?: string }).detail ?? detail; } catch { /* keep default */ }
        send({ error: detail });
      }
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
