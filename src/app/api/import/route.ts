import { NextResponse } from 'next/server';
import { extractLogo, readGrid } from '@/server/extract';
import { guard, HttpError, limiter } from '@/server/guard';
import { readUpload, toResponse } from '@/server/http';
import { streamJob } from '@/server/stream';
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
    return streamJob(async (emit) => {
      emit(5, 'Reading the sheet');
      const grid = readGrid(name, data);
      limiter.takeCall();
      try {
        emit(15, 'AI is finding the learners and subjects');
        const result = await runImport(grid, schema);
        emit(95, 'Copying the grades into the report cards');
        return { ...result, schoolLogo: extractLogo(name, data) };
      } catch (error) {
        // AI unavailable or confused: fall back to the built-in template reader so the app keeps working.
        if (!(error instanceof MappingError) || error.kind === 'config' && process.env.AI_REQUIRED === '1') throw error;
        try {
          return { ...readTemplate(grid, schema), template: true, aiError: error.message };
        } catch (templateError) {
          if (templateError instanceof TemplateError) {
            throw new MappingError(`${name}: ${templateError.message} (AI import: ${error.message})`, error.kind);
          }
          throw templateError;
        }
      }
    });
  } catch (error) {
    return toResponse(error);
  }
}
