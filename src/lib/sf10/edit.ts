/** The functions that change a learner's SF10 when a value is edited on the page. */
import { nameParts, toSf10Data } from '@/lib/sf10/record';
import { setState } from '@/lib/state/store';
import type { AppState, Sf10Data, Sf10Row, Sf10Semester, Student } from '@/lib/domain/types';

export interface Sf10Edits {
  data: Sf10Data;
  /** Changes the learner (name, LRN, sex...). */
  learner: (change: (s: Student) => Student) => void;
  setName: (part: 'last' | 'first' | 'middle', value: string) => void;
  setBirth: (value: string) => void;
  eligibility: (key: string, value: string | boolean) => void;
  completion: (key: string, value: string) => void;
  semester: (index: number, change: (s: Sf10Semester) => Sf10Semester) => void;
  row: (index: number, row: number, part: Partial<Sf10Row>) => void;
  addRow: (index: number) => void;
  removeRow: (index: number, row: number) => void;
}

/**
 * Everything that changes one learner's SF10, shared by the form under the record and by the record itself
 * (where the teacher taps a value and types). A record built from the class grades is copied on its first edit.
 */
export function sf10Edits(student: Student, state: AppState): Sf10Edits {
  const learner = (change: (s: Student) => Student) => {
    const id = student.id;
    const apply = (list: Student[]) => list.map((x) => (x.id === id ? change(x) : x));
    // Records read from an SF10 file live in sf10Students; otherwise the learner is one of the class roster.
    setState((s) => (s.sf10Students.length ? { sf10Students: apply(s.sf10Students) } : { students: apply(s.students) }));
  };
  const sf = (change: (d: Sf10Data) => Sf10Data) => learner((s) => ({ ...s, sf10: change(toSf10Data(s, state)) }));
  const semester = (index: number, change: (s: Sf10Semester) => Sf10Semester) => sf((d) => ({ ...d, semesters: d.semesters.map((x, i) => (i === index ? change(x) : x)) }));
  return {
    data: toSf10Data(student, state),
    learner,
    setName: (part, value) => {
      const next = { ...nameParts(student), [part]: value };
      learner((s) => ({ ...s, lastName: next.last, firstName: next.first, middleName: next.middle, name: `${next.last}, ${[next.first, next.middle].filter(Boolean).join(' ')}`.trim() }));
    },
    // The birth date is printed as typed once the record has its own copy.
    setBirth: (value) => learner((s) => ({ ...s, birthdate: value, sf10: toSf10Data(s, state) })),
    eligibility: (key, value) => sf((d) => ({ ...d, eligibility: { ...d.eligibility, [key]: value } })),
    completion: (key, value) => sf((d) => ({ ...d, completion: { ...d.completion, [key]: value } })),
    semester,
    row: (index, row, part) => semester(index, (x) => ({ ...x, rows: x.rows.map((r, n) => (n === row ? { ...r, ...part } : r)) })),
    addRow: (index) => semester(index, (x) => ({ ...x, rows: [...x.rows, { category: '', subject: '', q1: '', q2: '', final: '', action: '' }] })),
    removeRow: (index, row) => semester(index, (x) => ({ ...x, rows: x.rows.filter((_, n) => n !== row) }))
  };
}
