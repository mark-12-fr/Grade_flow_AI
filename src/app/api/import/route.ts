import { NextResponse } from 'next/server';
import { extractLogo, readGrid } from '@/server/extract';
import { guard, HttpError, limiter } from '@/server/guard';
import { readUpload, toResponse } from '@/server/http';
import { MappingError, parseSchema, runImport } from '@/server/mapper';
import { readTemplate, TemplateError } from '@/server/template';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    guard(request);
    const form = await request.formData();
    const { name, data } = await readUpload(form);
    const spec = form.get('spec');
    if (typeof spec !== 'string') throw new HttpError(400, 'The import schema is missing or invalid.');
    const schema = parseSchema(spec);
    const grid = readGrid(name, data);
    limiter.takeCall();
    try {
      const result = await runImport(grid, schema);
      return NextResponse.json({ ...result, schoolLogo: extractLogo(name, data) });
    } catch (error) {
      // AI unavailable or confused: fall back to the built-in template reader so the app keeps working.
      if (!(error instanceof MappingError) || error.kind === 'config' && process.env.AI_REQUIRED === '1') throw error;
      try {
        return NextResponse.json({ ...readTemplate(grid, schema), template: true, aiError: error.message });
      } catch (templateError) {
        if (templateError instanceof TemplateError) {
          throw new MappingError(`${name}: ${templateError.message} (AI import: ${error.message})`, error.kind);
        }
        throw templateError;
      }
    }
  } catch (error) {
    return toResponse(error);
  }
}
