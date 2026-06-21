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
  const [{ data: member }, { data: plans }, { data: services }, { data: ms }] = await Promise.all([
    supabase.from('members').select('*').eq('id', params.id).single(),
    supabase
      .from('membership_plans')
      .select('id, name, monthly_fee, duration_months, advance_amount, total_price, saving_amount')
      .order('monthly_fee'),
    supabase
      .from('services')
      .select('id, name, price, category')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('member_services').select('service_id').eq('member_id', params.id),
  ]);

  if (!member) notFound();

  const serviceIds = (ms ?? []).map((r: any) => r.service_id);
  const action = updateMember.bind(null, params.id);

  return (
    <div>
      <PageHeader title="Edit Member" subtitle={member.full_name} />
      <MemberForm
        action={action}
        plans={plans ?? []}
        services={services ?? []}
        initial={{ ...member, service_ids: serviceIds }}
        submitLabel="Save Changes"
      />
    </div>
  );
}
