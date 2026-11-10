import { describe, expect, it } from 'vitest';
import { decideObservedValues } from '@/server/observed/values';
import { applyObservedValues, gradeSummary } from '@/lib/sf9/observed';
import type { Student } from '@/lib/domain/types';

const all = (r: string) => Object.fromEntries(['makaDiyos', 'makatao', 'makakalikasan', 'makabansa'].map((k) => [k, { q1: r, q2: r, q3: r, q4: r }]));
const learner = (id: number) => ({ id, quarterAverage: { q1: 90, q2: 88, q3: null, q4: null }, failing: 0 });

describe('observed values by AI', () => {
  it('keeps valid answers and drops unknown ids and bad ratings', async () => {
    const caller = async () => ({ learners: [
      { id: 1, values: all('ao') },
      { id: 99, values: all('AO') },
      { id: 2, values: { ...all('SO'), makatao: { q1: 'XX', q2: 'SO', q3: 'SO', q4: 'SO' } } }
    ] });
    const out = await decideObservedValues([learner(1), learner(2)], caller);
    expect([...out.keys()]).toEqual([1]);
    expect(out.get(1)!.makaDiyos.q1).toBe('AO');
  });

  it('asks in batches of 25', async () => {
    let calls = 0;
    await decideObservedValues(Array.from({ length: 60 }, (_, i) => learner(i + 1)), async (promptText) => {
      calls += 1;
      const ids = JSON.parse(promptText.split('\n').pop()!).map((l: { id: number }) => l.id) as number[];
      return { learners: ids.map((id) => ({ id, values: all('SO') })) };
    });
    expect(calls).toBe(3);
  });

  it('asks again for learners the AI skipped', async () => {
    let calls = 0;
    const caller = async (promptText: string) => {
      calls += 1;
      const ids = JSON.parse(promptText.split('\n').pop()!).map((l: { id: number }) => l.id) as number[];
      return { learners: (calls === 1 ? ids.slice(0, 1) : ids).map((id) => ({ id, values: all('AO') })) };
    };
    const out = await decideObservedValues([learner(1), learner(2), learner(3)], caller);
    expect(calls).toBe(2);
    expect([...out.keys()].sort()).toEqual([1, 2, 3]);
  });

  it('fills only blanks unless told to replace', () => {
    const s = { id: 1, grades: {}, observedValues: { makaDiyos: { q1: 'RO' } } } as unknown as Student;
    const decided = { '1': all('AO') };
    const keep = applyObservedValues([s], decided, false);
    expect(keep.changed).toBe(1);
    expect(keep.students[0].observedValues.makaDiyos.q1).toBe('RO');
    expect(keep.students[0].observedValues.makaDiyos.q2).toBe('AO');
    expect(applyObservedValues([s], decided, true).students[0].observedValues.makaDiyos.q1).toBe('AO');
  });

  it('sends only grades, never the name', () => {
    const s = { id: 7, name: 'Secret Name', lrn: '123', strand: 'ABM', grades: { business_finance: { q1: 90, q2: 80, final: 70 } } } as unknown as Student;
    const sum = gradeSummary(s);
    expect(JSON.stringify(sum)).not.toContain('Secret');
    expect(sum.failing).toBe(1);
    expect(sum.quarterAverage.q1).toBe(90);
    expect(sum.quarterAverage.q3).toBeNull();
  });
});
