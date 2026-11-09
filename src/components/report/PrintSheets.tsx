'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ReportCardBack, ReportCardFront } from '@/components/report/ReportCard';
import type { ReportContext } from '@/lib/domain/grading';
import type { SchoolInfo, Student } from '@/lib/domain/types';

const PX_PER_MM = 96 / 25.4;

/** Opens the browser's print dialog for the given learners (front and back of each card). */
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
 * The print-only pages: A4 portrait, two pages per learner (front, then back) for double-sided printing.
 * It is rendered straight into <body>, outside the app, so the menus and buttons never reach the paper.
 */
export function PrintSheets({ students, context, school }: { students: Student[]; context: ReportContext; school: SchoolInfo }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div id="print-area" aria-hidden="true">
      {students.map((student) => (
        <Fragment key={student.id}>
          <div className="print-page"><article className="a4-page"><ReportCardFront student={student} context={context} school={school} /></article></div>
          <div className="print-page"><article className="a4-page"><ReportCardBack student={student} context={context} school={school} /></article></div>
        </Fragment>
      ))}
    </div>,
    document.body
  );
}

/** Shows an A4 page on screen at any width. It is drawn at its real 210 x 297 mm size and scaled down to fit. */
export function A4Preview({ children, label }: { children: ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / (210 * PX_PER_MM));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className="a4-preview" role="img" aria-label={label} style={{ height: `${297 * PX_PER_MM * scale}px` }}>
      <div className="a4-preview-inner" style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
}
