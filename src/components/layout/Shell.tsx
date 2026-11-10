'use client';

/** The frame around every page: sidebar, top bar, notifications, step bar and the Ctrl+S shortcut. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useUi } from '@/components/layout/Providers';
import { SaveStatus } from '@/components/layout/SaveStatus';
import { PAGE_META, STEP_ORDER } from '@/lib/domain/curriculum';
import { formatDate } from '@/lib/domain/format';
import { allCommentsReviewed, missingGradeCells } from '@/lib/domain/grading';
import { saveNow, useAppState } from '@/lib/state/store';
import type { PageId } from '@/lib/domain/types';

const NAV: { page: PageId; icon: IconName; label: string }[] = [
  { page: 'upload', icon: 'upload', label: 'Uploads' },
  { page: 'history', icon: 'history', label: 'History' }
];

const STEPS: { page: PageId; label: string }[] = [
  { page: 'upload', label: 'Upload' }, { page: 'report-card', label: 'SF9' },
  { page: 'sf10', label: 'SF10' }
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
  const { toast } = useUi();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const page = (pathname.replace(/^\//, '') || 'upload') as PageId;
  const meta = PAGE_META[page] ?? PAGE_META.upload;
  const stepPage = page === 'verification' ? 'report-card' : page === 'generated-reports' ? 'sf10' : page;
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

  // Ctrl+S (or Cmd+S) saves right now instead of opening the browser's own "save page" dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void saveNow().then((ok) => toast(ok ? 'Saved in this browser.' : 'Could not save in this browser. Download your files before closing the page.', ok ? 'success' : 'error'));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toast]);

  const missing = missingGradeCells(state.students);
  const items: { icon: IconName; title: string; text: string; link?: string; linkLabel?: string }[] = [];
  if (missing.length) {
    items.push({ icon: 'alert-triangle', title: `${missing.length} grade${missing.length === 1 ? '' : 's'} need review`, text: `${missing[0].student.name} · ${missing[0].subject.name}`, link: '/verification', linkLabel: 'Review grades' });
  }
  if (!items.length) items.push({ icon: 'check-circle', title: 'You are all caught up', text: 'There are no grade checks waiting for you right now.' });
  const showDot = missing.length > 0 || (state.students.length > 0 && !allCommentsReviewed(state.students));

  return (
    <div className={`app${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} id="sidebar" aria-label="Main navigation">
        <Link className="brand" href="/upload" aria-label="GradeFlow AI home">
          <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="16" fill="currentColor" />
            <path d="M44.3 23.4A15 15 0 1 0 47 32" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
            <path d="M34 32h13" fill="none" stroke="#f5a524" strokeWidth="6" strokeLinecap="round" />
          </svg>
          <span className="brand-name">Grade<span>Flow</span><b>AI</b></span>
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
            <span className="help-icon"><Icon name="help" /></span>
            <strong>Help</strong>
            <span>Steps for preparing and printing report cards.</span>
            <span className="help-link">Open the guide <Icon name="arrow-right" /></span>
          </Link>
          <Link className="teacher-card" href="/settings" aria-label="Open workspace settings">
            <span className="avatar avatar-sm"><Icon name="settings" /></span>
            <span className="teacher-text"><strong>Settings</strong><span>Class and report details</span></span>
            <Icon name="chevron-right" />
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
            <SaveStatus />
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
            <span>GradeFlow</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export { formatDate };
