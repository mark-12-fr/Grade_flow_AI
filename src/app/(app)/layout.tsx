/** Layout for every app page: wraps them in the sidebar, top bar and step bar (components/layout/Shell). */
import { Shell } from '@/components/layout/Shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
