/** BACKEND: asks the AI for observed-value ratings and checks the answer. */
import { CORE_VALUE_KEYS } from '@/lib/domain/curriculum';
import type { Caller, Tool } from '@/server/core/llm';

export const RATINGS = ['AO', 'SO', 'RO', 'NO'] as const;
const QUARTERS = ['q1', 'q2', 'q3', 'q4'] as const;
export type ObservedValues = Record<string, Record<string, string>>;

/** What the AI sees about one learner: no name, no LRN, only the grade picture. */
export interface LearnerSummary {
  id: number;
  /** Average of the subject grades in each quarter; null when that quarter has no grades. */
  quarterAverage: Record<(typeof QUARTERS)[number], number | null>;
  /** Number of subjects with a semester final below 75. */
  failing: number;
}

const BATCH = 25;

const ratingProps = Object.fromEntries(QUARTERS.map((q) => [q, { type: 'string', enum: [...RATINGS] }]));
const tool: Tool = {
  name: 'observed_values',
  description: 'Observed values rating for each learner, quarter by quarter.',
  input_schema: {
    type: 'object',
    properties: {
      learners: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            values: { type: 'object', properties: Object.fromEntries(CORE_VALUE_KEYS.map((k) => [k, { type: 'object', properties: ratingProps, required: [...QUARTERS] }])), required: [...CORE_VALUE_KEYS] }
          },
          required: ['id', 'values']
        }
      }
    },
    required: ['learners']
  }
};

function prompt(batch: LearnerSummary[]): string {
  return [
    'A Philippine senior high school teacher needs a draft "Report on Learner\'s Observed Values" for each learner.',
    `Core values: ${CORE_VALUE_KEYS.join(', ')}. Ratings per quarter (q1 to q4): AO = Always Observed, SO = Sometimes Observed, RO = Rarely Observed, NO = Not Observed.`,
    'You only know each learner\'s grades. Behaviour was not observed by you, so be conservative and consistent:',
    '- quarter average 90 or above: AO; 80 to 89: AO or SO; 75 to 79: SO; below 75: SO or RO.',
    '- Use NO only when a quarter has no grades at all (average is null).',
    '- Several failing subjects should lower the ratings a little, never to NO.',
    '- Ratings of one learner should be similar across the four core values; vary between quarters only when the grades changed.',
    'Return a rating for every learner id, every core value and every quarter.',
    JSON.stringify(batch)
  ].join('\n');
}

/** Asks the AI for a draft of the observed values of many learners, 25 at a time. Anything invalid in the answer is dropped. */
export async function decideObservedValues(learners: LearnerSummary[], caller: Caller, spend: () => void = () => {}): Promise<Map<number, ObservedValues>> {
  const out = new Map<number, ObservedValues>();
  const ask = async (batch: LearnerSummary[]) => {
    const wanted = new Set(batch.map((l) => l.id));
    spend();
    const answer = await caller(prompt(batch), tool, 8192);
    const list = Array.isArray(answer.learners) ? answer.learners : [];
    for (const item of list as { id?: unknown; values?: Record<string, Record<string, unknown>> }[]) {
      const id = Number(item?.id);
      if (!wanted.has(id) || !item.values) continue;
      const values: ObservedValues = {};
      let complete = true;
      for (const key of CORE_VALUE_KEYS) {
        values[key] = {};
        for (const q of QUARTERS) {
          const rating = String(item.values[key]?.[q] ?? '').toUpperCase();
          if ((RATINGS as readonly string[]).includes(rating)) values[key][q] = rating; else complete = false;
        }
      }
      if (complete) out.set(id, values);
    }
  };
  for (let i = 0; i < learners.length; i += BATCH) await ask(learners.slice(i, i + BATCH));
  // Learners the AI skipped or answered badly get one more try, so nobody is left out.
  const missed = learners.filter((l) => !out.has(l.id));
  for (let i = 0; i < missed.length; i += BATCH) await ask(missed.slice(i, i + BATCH));
  return out;
}
