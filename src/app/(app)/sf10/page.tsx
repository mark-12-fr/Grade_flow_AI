'use client';

import { Icon } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { Sf10Sheet } from '@/components/Sf10Sheet';
import { downloadSf10 } from '@/lib/pdf/sf10';
import { sf10Source } from '@/lib/sf10Record';
import { setState, useAppState } from '@/lib/store';

export default function Sf10Page() {
  const { toast } = useUi();
  const state = useAppState();
  const list = sf10Source(state);
  const total = list.length;
  const index = total ? Math.min(Math.max(0, state.sf10Index), total - 1) : 0;
  const student = list[index] ?? null;
  const go = (i: number) => setState({ sf10Index: Math.min(Math.max(0, i), Math.max(0, total - 1)) });
  const slug = (value: string) => value.replace(/[^\x20-\x7E]/g, '?').replace(/\W+/g, '_');

  async function download(students: typeof list, filename: string) {
    try { await downloadSf10(students, state, filename); }
    catch { toast('PDF support did not load. Reload the page and try again.', 'error'); }
  }

  return (
    <section className="page active" aria-labelledby="sf10-page-title">
      <div className="page-heading">
        <div>
          <h1 id="sf10-page-title">SF10 permanent record</h1>
          <p>Read from the uploaded SF10 (or built from the class grades). Pick any learner by LRN or name.</p>
        </div>
      </div>
      <div className="card student-picker">
        <label htmlFor="sf10-student-select">Learner</label>
        <div className="student-select">
          <div className="select-wrap">
            <select id="sf10-student-select" value={index} onChange={(e) => go(Number(e.target.value))}>
              {list.map((s, i) => <option key={`${s.id}-${i}`} value={i}>{s.lrn || s.name}</option>)}
            </select>
            <Icon name="chevron-down" className="select-chevron" />
          </div>
        </div>
        <div className="student-pager">
          <button type="button" className="icon-btn" aria-label="Previous learner" onClick={() => go(index - 1)}><Icon name="chevron-left" /></button>
          <span>{total ? `${index + 1} of ${total}` : '0 of 0'}</span>
          <button type="button" className="icon-btn" aria-label="Next learner" onClick={() => go(index + 1)}><Icon name="chevron-right" /></button>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!student} onClick={() => student && download([student], `SF10-${slug(student.lrn || student.name)}.pdf`)}>
          <Icon name="download" /> This learner (PDF)
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!student} onClick={() => download(list, `SF10-${slug(state.section)}.pdf`)}>
          <Icon name="download" /> Whole class (PDF)
        </button>
      </div>
      <article className="card sf10-sheet" aria-label="SF10 record">
        {student ? <div key={`${student.id}-${index}`} className="swap-in"><Sf10Sheet student={student} state={state} /></div> : <p className="sf10-incomplete">Upload an SF10 or SF9 file first.</p>}
      </article>
    </section>
  );
}
