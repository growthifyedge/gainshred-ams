import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import MemberForm from '@/components/MemberForm';
import { updateMember } from '../../actions';

export const dynamic = 'force-dynamic';

const OFFER_LABEL: Record<string, string> = {
  none: 'No offer',
  wife: 'Wife 50% Offer',
  senior: 'Senior Citizen 67+',
  couple: 'Couple',
};

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

  // Couple context — the linked spouse (same couple_group_id).
  let spouse: any = null;
  let spouseServices: string[] = [];
  if (member.couple_group_id) {
    const { data: sp } = await supabase
      .from('members')
      .select('id, full_name, registration_number, offer_code')
      .eq('couple_group_id', member.couple_group_id)
      .neq('id', member.id)
      .limit(1)
      .maybeSingle();
    spouse = sp ?? null;
    if (spouse) {
      const { data: sms } = await supabase
        .from('member_services')
        .select('service:services(name)')
        .eq('member_id', spouse.id);
      spouseServices = (sms ?? []).map((x: any) => x.service?.name).filter(Boolean);
    }
  }

  const serviceIds = (ms ?? []).map((r: any) => r.service_id);
  const action = updateMember.bind(null, params.id);

  return (
    <div>
      <PageHeader
        title="Edit Member"
        subtitle={`${member.registration_number ?? ''} · ${member.full_name}`}
      />

      {spouse && (
        <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-sky-800">Couple Member</p>
              <p className="mt-0.5 text-sm text-neutral-700">
                Linked spouse: <span className="font-medium">{spouse.full_name}</span>{' '}
                <span className="font-mono text-xs text-neutral-500">({spouse.registration_number})</span> ·{' '}
                Offer: {OFFER_LABEL[spouse.offer_code] ?? spouse.offer_code}
              </p>
              {spouseServices.length > 0 && (
                <p className="text-xs text-neutral-500">Spouse services: {spouseServices.join(', ')}</p>
              )}
            </div>
            <Link href={`/members/${spouse.id}/edit`} className="btn-ghost btn-sm">
              Open spouse
            </Link>
          </div>
        </div>
      )}

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
