/** BACKEND: POST /api/import. Reads an SF9 class grade sheet (AI column mapping, or the built-in template reader) and streams progress. */
import { NextResponse } from 'next/server';
import { extractLogo, masterListSize, readGrid, readSheets } from '@/server/import/extract';
import { guard, HttpError, limiter } from '@/server/core/guard';
import { readUpload, toResponse } from '@/server/core/http';
import { streamJob } from '@/server/core/stream';
import { ALL_SUBJECTS } from '@/lib/domain/curriculum';
import { cardDefaults, readMasterList } from '@/server/import/masterList';
import { MappingError, parseSchema, runImport } from '@/server/import/mapper';
import { readTemplate, TemplateError } from '@/server/import/template';

const ALL = '__all__';

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
      if (masterListSize(grid)) {
        const asked = form.get('section');
        const section = typeof asked === 'string' && asked ? asked : ALL; // no question asked: read every section
        emit(40, section === ALL ? 'Reading every section' : `Reading section ${section}`);
        // The only picture in a school-wide list workbook is a tiny low-resolution seal, so it is not used as the logo.
        return { ...readMasterList(grid, { ...schema, subjects: ALL_SUBJECTS.map((x) => ({ key: x.key, name: x.name, semester: x.semester })) }, section === ALL ? null : section, cardDefaults(readSheets(name, data).filter((g) => g.sheet !== grid.sheet))), roster: true };
      }
      limiter.takeCall();
      try {
        emit(15, 'Finding the learners and subjects');
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
