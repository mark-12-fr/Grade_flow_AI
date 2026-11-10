'use client';

/** Read-only view of the class and school details, and the light/dark switch. */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/components/layout/Shell';
import { prettyYear } from '@/lib/domain/format';
import { useAppState } from '@/lib/state/store';

function Details({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="workspace-details">
      {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

export default function SettingsPage() {
  const state = useAppState();
  const { theme, toggle } = useTheme();
  return (
    <section className="page active" aria-labelledby="settings-title">
      <div className="page-heading">
        <div>
          <h1 id="settings-title">Workspace settings</h1>
          <p>Review your class details, report preferences, and appearance.</p>
        </div>
        <span className="pill pill-blue">Your workspace</span>
      </div>
      <div className="workspace-settings-grid">
        <article className="card workspace-card">
          <div className="card-heading"><h2>School and teacher</h2><p>Details shown on your report cards.</p></div>
          <Details rows={[['School', state.school.name], ['Address', state.school.address], ['Principal', state.school.principal], ['Teacher', state.teacher]]} />
        </article>
        <article className="card workspace-card">
          <div className="card-heading"><h2>Class and term</h2><p>Used to identify this report set.</p></div>
          <Details rows={[['Class', state.className], ['Term', state.term], ['Academic year', prettyYear(state.year)],
            ['Grading scale', state.gradingScale === 'deped' ? 'DepEd · 60–100' : 'Percentage · 0–100']]} />
          <Link className="btn btn-secondary btn-sm workspace-card-action" href="/upload">Edit class details</Link>
        </article>
        <article className="card workspace-card">
          <div className="card-heading"><h2>Print preferences</h2><p>Choose paper and layout options before printing.</p></div>
          <Details rows={[['Paper size', state.paperSize.toUpperCase()], ['Orientation', state.orientation.charAt(0).toUpperCase() + state.orientation.slice(1)],
            ['Print layout', state.printLayout === 'double' ? 'Duplex · Sheet estimate' : 'Single-sided · Sheet estimate']]} />
          <Link className="btn btn-secondary btn-sm workspace-card-action" href="/generated-reports">Manage print settings</Link>
        </article>
        <article className="card workspace-card">
          <div className="card-heading"><h2>Appearance</h2><p>Choose a comfortable look for your workspace.</p></div>
          <div className="workspace-appearance">
            <span className="history-icon"><Icon name="sun" /></span>
            <div className="history-copy"><strong>Color theme</strong><span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span></div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={toggle}>Switch theme</button>
          </div>
        </article>
      </div>
    </section>
  );
}
