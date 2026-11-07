import { NextResponse } from 'next/server';
import { extractLogo, readSheets } from '@/server/extract';
import { guard, HttpError, limiter, limits } from '@/server/guard';
import { readUpload, toResponse } from '@/server/http';
import { streamJob } from '@/server/stream';
import { runImportSf10 } from '@/server/sf10';
import { looksLikeForm, runRosterImport } from '@/server/sf10Roster';

const FORMS = '__forms__';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    guard(request);
    const form = await request.formData();
    const { name, data } = await readUpload(form);
    const wanted = form.get('sheet');
    return streamJob(async (emit) => {
      emit(5, 'Opening the file');
      const grids = readSheets(name, data);
      const cfg = limits();

      // The teacher picked one sheet of a school grading workbook: read its columns (roster mode).
      if (typeof wanted === 'string' && wanted && wanted !== FORMS) {
        const grid = grids.find((g) => g.sheet === wanted);
        if (!grid) throw new HttpError(422, `Sheet "${wanted}" was not found in this file.`);
        const roster = await runRosterImport(grid, undefined, () => limiter.takeCall(), emit);
        emit(95, 'Building the permanent records');
        return { ...roster, schoolLogo: extractLogo(name, data) };
      }

      // Sheets that are a learner's SF10 form are read form by form.
      const forms = grids.filter(looksLikeForm);
      const others = grids.filter((g) => !looksLikeForm(g) && g.rows.length >= 20);
      if (wanted !== FORMS && (!forms.length || others.length)) {
        // A school grading workbook (learners in rows): let the teacher pick the sheet to read.
        const sheets = grids.map((g) => ({ name: g.sheet, rows: g.rows.length, cols: g.rows[0]?.length ?? 0 }));
        if (forms.length) sheets.unshift({ name: FORMS, rows: forms.length, cols: 0, label: `SF10 forms (${forms.length} sheets: ${forms.map((g) => g.sheet).join(', ')})` } as never);
        return { mode: 'pick', sheets };
      }
      if (cfg.maxSheets && forms.length > cfg.maxSheets) {
        throw new HttpError(422, `This workbook has ${forms.length} SF10 sheets; the AI reads one learner per sheet and the limit is ${cfg.maxSheets}.`);
      }
      emit(10, `Reading ${forms.length} SF10 sheet${forms.length === 1 ? '' : 's'}`);
      const result = await runImportSf10(forms, {
        spend: () => limiter.takeCall(), maxChars: cfg.maxSheetChars,
        onProgress: (done, total) => emit(10 + Math.round((done / total) * 80), `Read ${done} of ${total} sheets`)
      });
      return { ...result, schoolLogo: extractLogo(name, data) };
    });
  } catch (error) {
    return toResponse(error);
  }
}
