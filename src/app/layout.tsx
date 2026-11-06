import type { Metadata } from 'next';
import { IconSprite } from '@/components/Icon';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'GradeFlow AI',
  description: 'GradeFlow AI reads your SF9 and SF10 grade sheets with AI and builds report cards and permanent records.',
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
      <body>
        <IconSprite />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
