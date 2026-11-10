/** BACKEND: reads uploads and turns server errors into clear JSON responses. */
import { NextResponse } from 'next/server';
import { HttpError, LimitExceeded } from '@/server/core/guard';
import { ExtractError } from '@/server/import/extract';
import { MappingError } from '@/server/import/mapper';

export const MAX_BYTES = 10 * 1024 * 1024;

/** Turns the errors our server code throws into clear JSON responses. */
export function toResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) return NextResponse.json({ detail: error.message }, { status: error.status, headers: error.headers });
  if (error instanceof LimitExceeded) return NextResponse.json({ detail: error.message }, { status: 429 });
  if (error instanceof ExtractError) return NextResponse.json({ detail: error.message }, { status: 400 });
  if (error instanceof MappingError) {
    // 503: server not configured, 422: file can't be understood, 502: AI service failed
    const status = error.kind === 'config' ? 503 : error.kind === 'file' ? 422 : 502;
    return NextResponse.json({ detail: error.message }, { status });
  }
  console.error(error);
  return NextResponse.json({ detail: 'Unexpected server error.' }, { status: 500 });
}

export async function readUpload(form: FormData): Promise<{ name: string; data: Buffer }> {
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file was uploaded.');
  if (!file.size) throw new HttpError(400, 'The file is empty.');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'The file is larger than 10 MB.');
  return { name: file.name, data: Buffer.from(await file.arrayBuffer()) };
}
