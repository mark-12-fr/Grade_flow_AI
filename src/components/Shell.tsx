'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { PAGE_META, STEP_ORDER } from '@/lib/curriculum';
import { formatDate, prettyYear } from '@/lib/format';
import { allCommentsReviewed, missingGradeCells, readyToGenerate } from '@/lib/grading';
import { useAppState } from '@/lib/store';
import type { PageId } from '@/lib/types';

const NAV: { page: PageId; icon: IconName; label: string }[] = [
  { page: 'upload', icon: 'upload', label: 'Upload Grades' },
  { page: 'history', icon: 'history', label: 'History' },
  { page: 'settings', icon: 'settings', label: 'Settings' },
  { page: 'help', icon: 'help', label: 'Help' }
];

const STEPS: { page: PageId; label: string }[] = [
  { page: 'upload', label: 'Upload' }, { page: 'processing', label: 'Processing' }, { page: 'report-card', label: 'SF9' },
  { page: 'sf10', label: 'SF10' }, { page: 'generated-reports', label: 'Print' }
];

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch { /* storage may be blocked */ }
    setTheme(next);
  };
  return { theme, toggle };
}
export { useTheme };

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const state = useAppState();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const page = (pathname.replace(/^\//, '') || 'upload') as PageId;
  const meta = PAGE_META[page] ?? PAGE_META.upload;
  const stepPage = page === 'verification' ? 'processing' : page;
  const stepIndex = STEP_ORDER.indexOf(stepPage);

  useEffect(() => {
    setMenuOpen(false);
    setNotificationsOpen(false);
    document.title = `${meta.label} · GradeFlow AI`;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname, meta.label]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); setNotificationsOpen(false); } };
    const onResize = () => { if (window.innerWidth > 1024) setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [menuOpen]);

  const missing = missingGradeCells(state.students);
  const items: { icon: IconName; title: string; text: string; link?: string; linkLabel?: string }[] = [];
  if (missing.length) {
    items.push({ icon: 'alert-triangle', title: `${missing.length} grade${missing.length === 1 ? '' : 's'} need review`, text: `${missing[0].student.name} · ${missing[0].subject.name}`, link: '/verification', linkLabel: 'Review grades' });
  }
  if (readyToGenerate(state.students) && !state.generated) {
    items.push({ icon: 'sparkles', title: 'Ready to generate', text: `All grades are approved for ${state.className}.`, link: '/report-card', linkLabel: 'Preview reports' });
  }
  if (!items.length) items.push({ icon: 'check-circle', title: 'You are all caught up', text: 'There are no grade checks waiting for you right now.' });
  const showDot = missing.length > 0 || (state.students.length > 0 && !allCommentsReviewed(state.students));

  return (
    <div className={`app${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} id="sidebar" aria-label="Main navigation">
        <Link className="brand" href="/upload" aria-label="GradeFlow AI home">
          <span className="brand-mark"><Icon name="layers" /></span>
          <span className="brand-name">GradeFlow</span>
          <span className="brand-ai">AI</span>
        </Link>
        <nav className="nav-links">
          {NAV.map((item) => (
            <Link key={item.page} href={`/${item.page}`} className={`nav-link nav-action${meta.nav === item.page ? ' active' : ''}`} aria-current={meta.nav === item.page ? 'page' : undefined}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className="help-card" href="/help">
            <span className="help-icon"><Icon name="heart" /></span>
            <strong>A little help, anytime.</strong>
            <span>Your first report card? We&apos;ll guide you through it.</span>
            <span className="help-link">View quick-start guide <Icon name="arrow-right" /></span>
          </Link>
          <Link className="teacher-card" href="/settings" aria-label="Open workspace settings">
            <span className="avatar avatar-sm">SC</span>
            <span className="teacher-text"><strong>Sarah Collins</strong><span>Class teacher</span></span>
            <Icon name="chevron-down" />
          </Link>
        </div>
      </aside>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button" className="icon-btn menu-toggle" aria-label={collapsed ? 'Open menu' : 'Close menu'} aria-controls="sidebar" aria-expanded={menuOpen || !collapsed}
              onClick={() => { if (window.innerWidth > 1024) setCollapsed((c) => !c); else setMenuOpen((o) => !o); }}
            ><Icon name="menu" /></button>
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <span>Workspace</span><Icon name="chevron-right" className="crumb-chevron" /><span>{meta.breadcrumb}</span>
            </nav>
          </div>
          <div className="topbar-right">
            <span className="academic-year">School year <strong>{prettyYear(state.year)}</strong></span>
            <button type="button" className="icon-btn theme-toggle" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={theme === 'dark'} onClick={toggle}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              <span className="sr-only">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
            </button>
            <button type="button" className="icon-btn notification-btn" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((o) => !o)}>
              <Icon name="bell" />
              {showDot && <span className="notification-dot" />}
            </button>
          </div>
        </header>

        {notificationsOpen && (
          <div className="notifications-popover">
            <div className="popover-head">
              <strong>Notifications</strong>
              <span className="pill pill-blue">{items.length} {items.length === 1 ? 'update' : 'updates'}</span>
            </div>
            <div>
              {items.map((item) => (
                <div className="notification-item" key={item.title}>
                  <Icon name={item.icon} />
                  <div><strong>{item.title}</strong>{item.text}{item.link && <> <Link href={item.link}>{item.linkLabel}</Link></>}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <main className="main-content" id="main-content">
          {stepIndex >= 0 && (
            <nav className="stepper" aria-label="Report card workflow">
              {STEPS.map((step, index) => {
                const done = index < stepIndex, active = index === stepIndex;
                return (
                  <Link key={step.page} className={`step-link${active ? ' active' : ''}${done ? ' completed' : ''}`} href={`/${step.page}`} aria-current={active ? 'step' : undefined}>
                    <span className="step-marker"><span className="step-number">{index + 1}</span><Icon name="check" className="step-check" /></span>
                    <span className="step-label">{step.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
          {children}
          <footer className="app-footer">
            <span><Icon name="shield-check" /> Your student data stays private and secure.</span>
            <span>GradeFlow AI · Made for teachers</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export { formatDate };
