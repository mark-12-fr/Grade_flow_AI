/** Root layout: page title, fonts, the saved light/dark theme, the icon sprite and the toast/dialog providers. */
import type { Metadata } from 'next';
import { IconSprite } from '@/components/ui/Icon';
import { Providers } from '@/components/layout/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'GradeFlow AI',
  description: 'Build SF9 report cards and SF10 permanent records from your grade sheets.',
  icons: { icon: '/assets/favicon.svg' }
};

// Apply the saved theme before first paint so dark mode does not flash light.
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');var t=s==='dark'||s==='light'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <IconSprite />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
