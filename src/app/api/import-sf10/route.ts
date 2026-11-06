import { NextResponse } from 'next/server';
import { extractLogo, readSheets } from '@/server/extract';
import { guard, HttpError, limiter, limits } from '@/server/guard';
import { readUpload, toResponse } from '@/server/http';
import { runImportSf10 } from '@/server/sf10';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    guard(request);
    const { name, data } = await readUpload(await request.formData());
    const grids = readSheets(name, data);
    const cfg = limits();
    if (cfg.maxSheets && grids.length > cfg.maxSheets) {
      throw new HttpError(422, `This workbook has ${grids.length} sheets; the AI reads one learner per sheet and the limit is ${cfg.maxSheets}. Upload a file with only the SF10 sheets.`);
    }
    const result = await runImportSf10(grids, { spend: () => limiter.takeCall(), maxChars: cfg.maxSheetChars });
    return NextResponse.json({ ...result, schoolLogo: extractLogo(name, data) });
  } catch (error) {
    return toResponse(error);
  }
}
