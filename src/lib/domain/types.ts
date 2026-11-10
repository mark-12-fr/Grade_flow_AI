/** Shared types: Student, grades, attendance, SF10 records and the whole AppState. */
export type Period = 'q1' | 'q2' | 'q3' | 'q4' | 'final';
export type GradeValue = number | string | null | undefined;
export type Grades = Record<string, Partial<Record<Period, GradeValue>>>;

export interface Attendance {
  present: number | null;
  total: number | null;
  months: Record<string, number | null | undefined>;
  schoolDays: Record<string, number | null | undefined>;
  absent: Record<string, number | null | undefined>;
}

export interface Sf10Row {
  category: string; subject: string; q1: string; q2: string; final: string; action: string;
}
export interface Sf10Remedial {
  from: string; to: string; school: string; schoolId: string; teacher: string;
  rows: { category: string; subject: string; final: string; remedialMark: string; recomputed: string; action: string }[];
}
export interface Sf10Semester {
  school: string; schoolId: string; gradeLevel: string; sy: string; sem: string; track: string; section: string;
  rows: Sf10Row[]; average: string; averageAction: string; remarks: string;
  adviser: string; principal: string; dateChecked: string; remedial: Sf10Remedial;
}
export interface Sf10Data {
  eligibility: Record<string, string | boolean>;
  semesters: Sf10Semester[];
  completion: Record<string, string>;
}

export interface Student {
  id: number;
  roll: string;
  name: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  age: string;
  sex: string;
  lrn: string;
  birthdate?: string;
  /** Set when one upload holds several sections (school-wide list); overrides the class-level values on the card. */
  section?: string;
  strand?: string;
  adviser?: string;
  grades: Grades;
  attendance: Attendance;
  transfer: Record<string, string>;
  observedValues: Record<string, Record<string, string>>;
  comment: string;
  commentReviewed: boolean;
  traits: { participation: string; collaboration: string; workHabits: string } | null;
  nextSteps: string[] | null;
  sf10?: Sf10Data;
}

export interface SchoolInfo {
  name: string; address: string; principal: string; department: string; region: string; division: string; logo: string;
}

export interface UploadInfo {
  name: string; size: number; rows: number; type: 'class'; parsedAt: Date; mode: string; files: string[];
  classDetails: Record<string, string>;
  ai: { mapping: { col: number; header: string; field: string }[]; warnings: string[]; sheet: string } | null;
}

export type PageId =
  | 'upload' | 'verification' | 'report-card' | 'generated-reports'
  | 'sf10' | 'summary' | 'history' | 'settings' | 'help';

export interface AppState {
  school: SchoolInfo;
  teacher: string;
  year: string;
  term: string;
  className: string;
  strand: string;
  gradeLevel: string;
  section: string;
  studentStatus: string;
  graduationStatus: string;
  gradingScale: 'percentage' | 'deped';
  students: Student[];
  sf10Students: Student[];
  sf10File: { name: string; size: number; warnings: string[] } | null;
  upload: UploadInfo | null;
  processed: boolean;
  processing: boolean;
  progress: number;
  generated: boolean;
  generatedAt: Date | null;
  selectedStudentId: number | null;
  previewIndex: number;
  sf10Index: number;
  verificationPage: number;
  verificationSearch: string;
  verificationFilter: 'all' | 'approved' | 'needs-correction' | 'low';
  reportsPage: number;
  reportsSearch: string;
  selectedReportIds: number[];
  paperSize: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  printLayout: 'single' | 'double';
}
