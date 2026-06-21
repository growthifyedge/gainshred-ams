import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  return <Shell profile={profile}>{children}</Shell>;
}
