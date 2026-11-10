/** Small formatting helpers: dates, file sizes, initials, school year, age from birthdate. */
export function prettyYear(year: string): string {
  return String(year || '').replace('-', '–');
}

export function initials(name: string): string {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase();
}

export function formatFileSize(bytes: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const toDate = (value: Date | string | number | null | undefined) => (value instanceof Date ? value : new Date(value as string));

export function formatDate(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const d = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  const t = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${d} at ${t}`;
}

export function formatLongDate(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function ageFromBirthdate(birthdate: string | undefined, onDate?: Date): string {
  const born = new Date(birthdate || '');
  if (!birthdate || Number.isNaN(born.getTime())) return '';
  const ref = onDate || new Date();
  let age = ref.getFullYear() - born.getFullYear();
  if (ref.getMonth() < born.getMonth() || (ref.getMonth() === born.getMonth() && ref.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 100 ? String(age) : '';
}
