import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import MemberForm from '@/components/MemberForm';
import { createMember } from '../actions';
import { todayInput } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function NewMemberPage() {
  const profile = await getProfile();
  if (profile?.role !== 'admin') redirect('/members');

  const supabase = createClient();
  const { data: plans } = await supabase
    .from('membership_plans')
    .select('id, name, monthly_fee')
    .eq('is_active', true)
    .order('monthly_fee');

  return (
    <div>
      <PageHeader title="Add Member" subtitle="Create a new gym member." />
      <MemberForm
        action={createMember}
        plans={plans ?? []}
        initial={{ joining_date: todayInput(), due_day: 5, status: 'active' }}
        submitLabel="Create Member"
      />
    </div>
  );
}
