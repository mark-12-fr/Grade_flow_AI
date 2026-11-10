/** The SHS subjects per strand and semester, attendance months, core values and the page/step names. */
import type { PageId } from '@/lib/domain/types';

export const ATTENDANCE_MONTHS = [
  { key: 'jun', label: 'JUN' }, { key: 'jul', label: 'JUL' }, { key: 'aug', label: 'AUG' },
  { key: 'sep', label: 'SEP' }, { key: 'oct', label: 'OCT' }, { key: 'nov', label: 'NOV' },
  { key: 'dec', label: 'DEC' }, { key: 'jan', label: 'JAN' }, { key: 'feb', label: 'FEB' },
  { key: 'mar', label: 'MAR' }, { key: 'apr', label: 'APR' }
] as const;

export interface SemesterDef {
  key: 'first' | 'second';
  label: string;
  quarters: ['q1', 'q2'] | ['q3', 'q4'];
  quarterLabels: [number, number];
  finalKey: 'final';
  groups: { name: string; subjects: [string, string][] }[];
}

export const SEMESTERS: SemesterDef[] = [
  {
    key: 'first', label: 'First Semester', quarters: ['q1', 'q2'], quarterLabels: [1, 2], finalKey: 'final',
    groups: [
      { name: 'Core Subjects', subjects: [
        ['media_information_literacy', 'Media and Information Literacy'],
        ['philosophy', 'Introduction to Philosophy of the Human Person/Pambungad sa Pilosopiya ng Tao'],
        ['contemporary_arts', 'Contemporary Philippine Arts from the Regions'],
        ['physical_science', 'Physical Science'],
        ['pe_health_first', 'Physical Education and Health']
      ] },
      { name: 'Applied and Specialized Subjects', subjects: [
        ['research_daily_life', 'Research in Daily Life 2'],
        ['filipino_larang', 'Pagsulat sa Filipino sa Piling Larang'],
        ['creative_writing', 'Creative Writing/Malikhaing Pagsulat'],
        ['applied_social_sciences', 'Disciplines and Ideas in the Applied Social Sciences']
      ] }
    ]
  },
  {
    key: 'second', label: 'Second Semester', quarters: ['q3', 'q4'], quarterLabels: [3, 4], finalKey: 'final',
    groups: [
      { name: 'Core Subjects', subjects: [['pe_health_second', 'Physical Education and Health']] },
      { name: 'Applied and Specialized Subjects', subjects: [
        ['entrepreneurship', 'Entrepreneurship'],
        ['inquiries_immersion', 'Inquiries, Investigations and Immersion'],
        ['empowerment_technologies', 'Empowerment Technologies'],
        ['creative_nonfiction', 'Creative Nonfiction: The Literary Essay'],
        ['philippine_politics', 'Philippine Politics and Governance'],
        ['trends_networks', 'Trends, Networks and Critical Thinking in the 21st Century Culture'],
        ['community_engagement', 'Community Engagement, Solidarity and Citizenship'],
        ['culminating_activity', 'Culminating Activity']
      ] }
    ]
  }
];

export interface Subject {
  key: string; name: string; semester: 'first' | 'second'; group: string; alt?: string[];
  quarters: ['q1', 'q2'] | ['q3', 'q4']; finalKey: 'final';
}

export const SUBJECTS: Subject[] = SEMESTERS.flatMap((semester) =>
  semester.groups.flatMap((group) =>
    group.subjects.map(([key, name]) => ({
      key, name, semester: semester.key, group: group.name, quarters: semester.quarters, finalKey: semester.finalKey
    }))
  )
);

export const CORE_VALUE_KEYS = ['makaDiyos', 'makatao', 'makakalikasan', 'makabansa'] as const;
export const TRANSFER_FIELDS = [
  'certificateOfTransfer', 'cancellationOfEligibility', 'admittedTo', 'admittedIn',
  'eligibilityForGrade', 'transferDate', 'approvedBy'
] as const;

export const PAGE_META: Record<PageId, { label: string; breadcrumb: string; nav: PageId }> = {
  upload: { label: 'Upload Class Details', breadcrumb: 'Upload Class Details', nav: 'upload' },
  verification: { label: 'Grade Verification', breadcrumb: 'Grade Verification', nav: 'verification' },
  'report-card': { label: 'Report Cards', breadcrumb: 'Report Cards', nav: 'report-card' },
  'generated-reports': { label: 'Generated Reports', breadcrumb: 'Report Cards', nav: 'report-card' },
  sf10: { label: 'SF10 Record', breadcrumb: 'SF10 Record', nav: 'sf10' },
  summary: { label: 'Summary & Rank', breadcrumb: 'Summary & Rank', nav: 'summary' },
  history: { label: 'Report History', breadcrumb: 'Report History', nav: 'history' },
  settings: { label: 'Workspace Settings', breadcrumb: 'Settings', nav: 'settings' },
  help: { label: 'Help', breadcrumb: 'Help', nav: 'help' }
};

export const STEP_ORDER: PageId[] = ['upload', 'report-card', 'sf10'];
export const PASSING_GRADE = 75;

export const STRAND_TRACK: Record<string, string> = {
  ABM: 'ACAD: ACCOUNTANCY, BUSINESS AND MANAGEMENT (ABM)',
  GAS: 'ACAD: GENERAL ACADEMIC STRAND (GAS)',
  GASCRIM: 'ACAD: GENERAL ACADEMIC STRAND - CRIMINOLOGY (GASCRIM)',
  HUMSS: 'ACAD: HUMANITIES AND SOCIAL SCIENCES (HUMSS)',
  STEM: 'ACAD: SCIENCE, TECHNOLOGY, ENGINEERING AND MATHEMATICS (STEM)',
  HEALTH: 'TECHNICAL-VOCATIONAL: HEALTH'
};

const STRAND_KEYS: [RegExp, string][] = [
  [/criminology/i, 'GASCRIM'], [/health/i, 'HEALTH'], [/accountancy|\babm\b/i, 'ABM'], [/humanities|humss/i, 'HUMSS'],
  [/general academic|\bgas\b/i, 'GAS'], [/science|stem/i, 'STEM']
];
/** Short strand name (ABM, STEM, HUMSS, GAS, GASCRIM, HEALTH) from a long track/strand text; the text itself when it is not recognised. */
export const strandKey = (text: string): string => STRAND_KEYS.find(([re]) => re.test(text))?.[1] ?? text;

// ---- Per-strand curricula -------------------------------------------------------------------------
// SUBJECTS / SEMESTERS above are the default (HUMSS-style) list used when a learner has no strand.
// Each strand's report card lists its own subjects, as printed on the DepEd SF9 for that strand.

type Sem = 'first' | 'second';
const EXTRA: [key: string, name: string, semester: Sem, alt?: string[]][] = [
  ['business_finance', 'Business Finance', 'first'],
  ['fabm_2', 'Fundamentals of Accounting, Business and Management 2', 'first', ['Fundamentals of Accountancy, Business and Management 2']],
  ['eapp', 'English for Academic and Professional Purposes', 'first'],
  ['applied_economics_first', 'Applied Economics', 'first'],
  ['organization_management', 'Organization and Management', 'first'],
  ['criminology_elective', 'Criminology Elective', 'first'],
  ['disaster_readiness_first', 'Disaster Readiness and Risk Reduction', 'first'],
  ['general_physics_1', 'General Physics 1', 'first'],
  ['general_biology_1', 'General Biology 1', 'first'],
  ['safety_first_aid_first', 'Safety and First Aid', 'first'],
  ['applied_economics', 'Applied Economics', 'second'],
  ['business_ethics', 'Business Ethics and Social Responsibility', 'second'],
  ['business_marketing', 'Business Marketing', 'second', ['Principles of Marketing']],
  ['business_enterprise_simulation', 'Business Enterprise Simulation', 'second'],
  ['disaster_readiness_second', 'Disaster Readiness and Risk Reduction', 'second'],
  ['safety_first_aid_second', 'Safety and First Aid', 'second'],
  ['general_physics_2', 'General Physics 2', 'second'],
  ['general_biology_2', 'General Biology 2', 'second'],
  ['general_chemistry_2', 'General Chemistry 2', 'second'],
  ['capstone_research', 'Research/Capstone Projects', 'second', ['Research in Science, Technology, Engineering and Mathematics']]
];
const ALT: Record<string, string[]> = { research_daily_life: ['Practical Research 2'] };

/** Every subject any strand can have; use it to look a subject up by key. */
export const ALL_SUBJECTS: Subject[] = [
  ...SUBJECTS.map((s) => ({ ...s, alt: ALT[s.key] })),
  ...EXTRA.map(([key, name, semester, alt]): Subject => ({
    key, name, semester, alt, group: 'Applied and Specialized Subjects',
    quarters: semester === 'first' ? ['q1', 'q2'] : ['q3', 'q4'], finalKey: 'final'
  }))
];
const nameOf = (key: string) => ALL_SUBJECTS.find((s) => s.key === key)!.name;

const semester = (base: SemesterDef, core: string[], applied: string[]): SemesterDef => ({
  ...base,
  groups: [
    { name: 'Core Subjects', subjects: core.map((k): [string, string] => [k, nameOf(k)]) },
    { name: 'Applied and Specialized Subjects', subjects: applied.map((k): [string, string] => [k, nameOf(k)]) }
  ]
});
const strandCurriculum = (s1: [string[], string[]], s2: [string[], string[]]): SemesterDef[] => [semester(SEMESTERS[0], ...s1), semester(SEMESTERS[1], ...s2)];

const CORE1 = ['media_information_literacy', 'philosophy', 'contemporary_arts'];
const STEM_1: [string[], string[]] = [[...CORE1, 'disaster_readiness_first', 'pe_health_first'], ['research_daily_life', 'filipino_larang', 'general_physics_1', 'general_biology_1']];
const STEM_2: [string[], string[]] = [['pe_health_second'], ['entrepreneurship', 'inquiries_immersion', 'empowerment_technologies', 'general_physics_2', 'general_biology_2', 'general_chemistry_2', 'capstone_research']];

export const STRAND_CURRICULA: Record<string, SemesterDef[]> = {
  HUMSS: SEMESTERS,
  ABM: strandCurriculum(
    [[...CORE1, 'physical_science', 'pe_health_first'], ['research_daily_life', 'filipino_larang', 'business_finance', 'fabm_2']],
    [['pe_health_second'], ['entrepreneurship', 'inquiries_immersion', 'empowerment_technologies', 'applied_economics', 'business_ethics', 'business_marketing', 'business_enterprise_simulation']]
  ),
  GAS: strandCurriculum(
    [[...CORE1, 'pe_health_first'], ['eapp', 'filipino_larang']],
    [['pe_health_second'], ['inquiries_immersion', 'trends_networks']]
  ),
  GASCRIM: strandCurriculum(
    [[...CORE1, 'physical_science', 'pe_health_first'], ['research_daily_life', 'filipino_larang', 'applied_economics_first', 'organization_management', 'criminology_elective']],
    [['pe_health_second'], ['entrepreneurship', 'inquiries_immersion', 'empowerment_technologies', 'disaster_readiness_second', 'trends_networks', 'community_engagement', 'culminating_activity', 'safety_first_aid_second']]
  ),
  STEM: strandCurriculum(STEM_1, STEM_2),
  HEALTH: strandCurriculum(
    [STEM_1[0], [...STEM_1[1], 'safety_first_aid_first']],
    [STEM_2[0], [...STEM_2[1], 'culminating_activity']]
  )
};

/** The semesters (and subjects) printed on this strand's report card; the default list when the strand is unknown. */
export const semestersFor = (strand?: string): SemesterDef[] => (strand && STRAND_CURRICULA[strand]) || SEMESTERS;
export const subjectsFor = (strand?: string): Subject[] =>
  semestersFor(strand).flatMap((sem) => sem.groups.flatMap((g) => g.subjects.map(([key]) => ALL_SUBJECTS.find((s) => s.key === key)!)));
