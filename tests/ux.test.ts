import { describe, expect, it } from 'vitest';
import { explainError, removeSf10Undoable, removeSf9Undoable } from '@/lib/state/actions';
import { getState, setState } from '@/lib/state/store';
import type { Student } from '@/lib/domain/types';

describe('explainError', () => {
  it('says what to do for the common AI problems and keeps the original text', () => {
    const quota = explainError('The free AI quota was reached (gemini). Wait a minute and try again.');
    expect(quota).toMatch(/busy right now/);
    expect(quota).toMatch(/Details: The free AI quota/);
    expect(explainError('The AI provider rejected the key (groq, HTTP 401).')).toMatch(/ask the person who installed/i);
    expect(explainError('The AI import took too long.')).toMatch(/smaller file/);
    expect(explainError('The server is not reachable.')).toMatch(/internet connection/);
  });
  it('leaves other messages alone', () => {
    expect(explainError('book.xlsx: no learners were found.')).toBe('book.xlsx: no learners were found.');
  });
});

describe('undo', () => {
  const learner = { id: 1, name: 'Test Learner' } as unknown as Student;
  it('puts back the removed class and nothing else', () => {
    setState({ students: [learner], sf10Students: [learner], className: 'Kept' });
    const undo = removeSf9Undoable();
    expect(getState().students).toHaveLength(0);
    expect(getState().sf10Students).toHaveLength(1); // the SF10 side is untouched
    setState({ className: 'Changed meanwhile' });
    undo();
    expect(getState().students).toEqual([learner]);
    expect(getState().className).toBe('Changed meanwhile');
  });
  it('restores a removed SF10 file', () => {
    setState({ sf10Students: [learner] });
    const undo = removeSf10Undoable();
    expect(getState().sf10Students).toHaveLength(0);
    undo();
    expect(getState().sf10Students).toEqual([learner]);
  });
});
