'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReportCard } from '@/components/report/ReportCard';
import type { ReportContext } from '@/lib/domain/grading';
import type { SchoolInfo, Student } from '@/lib/domain/types';

/** Opens the browser's print dialog for the given learners. */
export function usePrint() {
  const [list, setList] = useState<Student[] | null>(null);
  useEffect(() => {
    if (!list) return;
    const after = () => setList(null);
    window.addEventListener('afterprint', after, { once: true });
    const timer = window.setTimeout(() => window.print(), 80);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', after); };
  }, [list]);
  return [list, setList] as const;
}

/**
 * The print-only pages: the report card exactly as designed (A4 landscape, one page per learner).
 * It is rendered straight into <body>, outside the app, so the menus and buttons never reach the paper.
 */
export function PrintSheets({ students, context, school }: { students: Student[]; context: ReportContext; school: SchoolInfo }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <style>{'@page { size: A4 landscape; margin: 0; }'}</style>
      <div id="print-area" className="print-landscape" aria-hidden="true" style={{ ['--print-page-height' as string]: '208mm' }}>
        {students.map((student) => (
          <div className="print-page" key={student.id}>
            <article className="report-sheet report-front"><ReportCard student={student} context={context} school={school} /></article>
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}
