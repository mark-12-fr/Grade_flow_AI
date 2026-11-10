import { describe, expect, it } from 'vitest';
import { initialState } from '@/lib/state/store';
import { ALL_SUBJECTS } from '@/lib/domain/curriculum';
import { recordFor, toSf10Data } from '@/lib/sf10/record';
import type { AppState, Student } from '@/lib/domain/types';

const grades = Object.fromEntries(ALL_SUBJECTS.map((s) => [s.key, { q1: 80, q2: 85, q3: 88, q4: 90, final: 86 }]));
const student = { id: 1, roll: '1', name: 'GALLO, THERESE ANNE D.', age: '17', sex: 'F', lrn: '136388831130', strand: 'ABM', grades, attendance: { present: 0, total: 0, months: {}, schoolDays: {}, absent: {} }, transfer: {}, observedValues: {}, comment: '', commentReviewed: false, traits: null, nextSteps: null } as unknown as Student;
const state: AppState = { ...initialState, students: [student] };

describe('SF10 editing', () => {
  it('a copy made from the class grades prints the same record', () => {
    const before = recordFor(student, state);
    const copy = { ...student, sf10: toSf10Data(student, state) };
    const after = recordFor(copy, state);
    expect(after.semesters.map((s) => s.rows)).toEqual(before.semesters.map((s) => s.rows));
    expect(after.semesters.map((s) => [s.semLabel, s.quarters, s.average])).toEqual(before.semesters.map((s) => [s.semLabel, s.quarters, s.average]));
    expect(after.completion).toEqual(before.completion);
  });

  it('an edit shows on the record', () => {
    const data = toSf10Data(student, state);
    data.semesters[0].rows[0].final = '99';
    const rec = recordFor({ ...student, sf10: data }, state);
    expect(rec.semesters[0].rows[0].final).toBe('99');
  });
});
