import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import MemberForm from '@/components/MemberForm';
import { updateMember } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function EditMemberPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (profile?.role !== 'admin') redirect('/members');

  const supabase = createClient();
  const [{ data: member }, { data: plans }] = await Promise.all([
    supabase.from('members').select('*').eq('id', params.id).single(),
    supabase
      .from('membership_plans')
      .select('id, name, monthly_fee')
      .order('monthly_fee'),
  ]);

  if (!member) notFound();

  const action = updateMember.bind(null, params.id);

  return (
    <div>
      <PageHeader title="Edit Member" subtitle={member.full_name} />
      <MemberForm
        action={action}
        plans={plans ?? []}
        initial={member}
        submitLabel="Save Changes"
      />
    </div>
  );
}
