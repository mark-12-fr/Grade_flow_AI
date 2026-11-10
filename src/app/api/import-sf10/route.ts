/** BACKEND: POST /api/import-sf10. Reads an SF10 file (one learner per sheet, or a school grading workbook) and streams progress. */
import { NextResponse } from 'next/server';
import { extractLogo, readSheets } from '@/server/import/extract';
import { guard, HttpError, limiter, limits } from '@/server/core/guard';
import { readUpload, toResponse } from '@/server/core/http';
import { streamJob } from '@/server/core/stream';
import { runImportSf10 } from '@/server/import/sf10';
import { looksLikeForm, runRosterImport } from '@/server/import/sf10Roster';

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

      // No question asked: a school grading workbook is read from its biggest learner list; otherwise the SF10 forms are read.
      const forms = grids.filter(looksLikeForm);
      if (wanted !== FORMS) {
        const lists = grids.filter((g) => !looksLikeForm(g) && g.rows.length >= 20);
        const best = lists.sort((a, b) => b.rows.length * (b.rows[0]?.length ?? 0) - a.rows.length * (a.rows[0]?.length ?? 0))[0];
        if (best && (!forms.length || best.rows.length > 50)) {
          emit(8, `Reading the learner list "${best.sheet}"`);
          const roster = await runRosterImport(best, undefined, () => limiter.takeCall(), emit);
          emit(95, 'Building the permanent records');
          return { ...roster, schoolLogo: extractLogo(name, data) };
        }
      }
      if (!forms.length) throw new HttpError(422, 'No SF10 forms or learner list with grades were found in this file.');
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
