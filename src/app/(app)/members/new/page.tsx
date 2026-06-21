import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import AdmissionTypeTabs from '@/components/AdmissionTypeTabs';
import { todayInput } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function NewMemberPage() {
  const profile = await getProfile();
  if (profile?.role !== 'admin') redirect('/members');

  const supabase = createClient();
  const [{ data: plans }, { data: services }] = await Promise.all([
    supabase
      .from('membership_plans')
      .select('id, name, monthly_fee, duration_months, advance_amount, total_price, saving_amount')
      .eq('is_active', true)
      .order('monthly_fee'),
    supabase
      .from('services')
      .select('id, name, price, category')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  return (
    <div>
      <PageHeader title="Add Member" subtitle="Single member, or a couple (husband + wife) together." />
      <AdmissionTypeTabs plans={plans ?? []} services={services ?? []} joiningDate={todayInput()} />
    </div>
  );
}
