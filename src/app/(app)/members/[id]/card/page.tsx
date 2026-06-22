import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import MembershipCard from '@/components/MembershipCard';
import PrintCardButton from '@/components/PrintCardButton';

export const dynamic = 'force-dynamic';

export default async function MemberCardPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) redirect('/login');

  const supabase = createClient();
  const { data: member } = await supabase
    .from('members')
    .select('registration_number, full_name, joining_date, plan:membership_plans(name)')
    .eq('id', params.id)
    .single();

  if (!member) notFound();

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-3">
        <Link href={`/members/${params.id}/edit`} className="btn-ghost btn-sm">
          ← Back to member
        </Link>
        <PrintCardButton />
      </div>

      <MembershipCard
        regNo={member.registration_number}
        name={member.full_name}
        packageName={(member as any).plan?.name}
        doj={member.joining_date}
      />
    </div>
  );
}
