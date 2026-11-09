import { NextResponse } from 'next/server';
import { extractLogo, masterListSize, readGrid } from '@/server/import/extract';
import { guard, HttpError, limiter } from '@/server/core/guard';
import { readUpload, toResponse } from '@/server/core/http';
import { streamJob } from '@/server/core/stream';
import { ALL_SUBJECTS } from '@/lib/domain/curriculum';
import { listSections, readMasterList } from '@/server/import/masterList';
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
        const section = form.get('section');
        if (typeof section !== 'string' || !section) {
          const sections = listSections(grid);
          if (!sections.length) throw new MappingError(`${name}: sheet "${grid.sheet}" is a school-wide list but no sections were found in it.`, 'file');
          return { mode: 'pick-section', sections, sheet: grid.sheet };
        }
        emit(40, section === ALL ? 'Reading every section' : `Reading section ${section}`);
        return { ...readMasterList(grid, { ...schema, subjects: ALL_SUBJECTS.map((x) => ({ key: x.key, name: x.name, semester: x.semester })) }, section === ALL ? null : section), roster: true, schoolLogo: extractLogo(name, data) };
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
