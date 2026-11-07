import type { PageId } from './types';

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
  key: string; name: string; semester: 'first' | 'second'; group: string;
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
  upload: { label: 'Upload Grades', breadcrumb: 'Upload Grades', nav: 'upload' },
  verification: { label: 'Grade Verification', breadcrumb: 'Grade Verification', nav: 'verification' },
  'report-card': { label: 'Report Cards', breadcrumb: 'Report Cards', nav: 'report-card' },
  'generated-reports': { label: 'Generated Reports', breadcrumb: 'Report Cards', nav: 'report-card' },
  sf10: { label: 'SF10 Record', breadcrumb: 'SF10 Record', nav: 'sf10' },
  summary: { label: 'Summary & Rank', breadcrumb: 'Summary & Rank', nav: 'summary' },
  history: { label: 'Report History', breadcrumb: 'Report History', nav: 'history' },
  settings: { label: 'Workspace Settings', breadcrumb: 'Settings', nav: 'settings' },
  help: { label: 'Help', breadcrumb: 'Help', nav: 'help' }
};

export const STEP_ORDER: PageId[] = ['upload', 'report-card', 'sf10', 'generated-reports'];
export const PASSING_GRADE = 75;

export const STRAND_TRACK: Record<string, string> = {
  ABM: 'ACAD: ACCOUNTANCY, BUSINESS AND MANAGEMENT (ABM)',
  GAS: 'ACAD: GENERAL ACADEMIC STRAND (GAS)',
  GASCRIM: 'ACAD: GENERAL ACADEMIC STRAND - CRIMINOLOGY (GASCRIM)',
  HUMSS: 'ACAD: HUMANITIES AND SOCIAL SCIENCES (HUMSS)',
  STEM: 'ACAD: SCIENCE, TECHNOLOGY, ENGINEERING AND MATHEMATICS (STEM)',
  HEALTH: 'TECHNICAL-VOCATIONAL: HEALTH'
};
