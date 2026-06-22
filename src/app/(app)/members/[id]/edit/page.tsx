import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import MemberForm from '@/components/MemberForm';
import CoupleCards, { type CoupleCardData } from '@/components/CoupleCards';
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

  // ---- Couple cards (members sharing couple_group_id) ----
  let husbandCard: CoupleCardData | null = null;
  let wifeCard: CoupleCardData | null = null;
  if (member.couple_group_id) {
    const { data: groupRows } = await supabase
      .from('members')
      .select('id, registration_number, full_name, phone, offer_code')
      .eq('couple_group_id', member.couple_group_id)
      .order('created_at', { ascending: true });

    const ids = (groupRows ?? []).map((m: any) => m.id);
    if (ids.length >= 2) {
      const [{ data: billing }, { data: svcRows }] = await Promise.all([
        supabase
          .from('member_billing')
          .select('member_id, package_name, registration_fee, package_fee, services_total, net_payable')
          .in('member_id', ids),
        supabase
          .from('member_services')
          .select('member_id, price, service:services(name)')
          .in('member_id', ids),
      ]);
      const billMap: Record<string, any> = Object.fromEntries((billing ?? []).map((b: any) => [b.member_id, b]));
      const svcByMember: Record<string, { names: string[]; full: number }> = {};
      for (const r of (svcRows ?? []) as any[]) {
        const e = (svcByMember[r.member_id] ??= { names: [], full: 0 });
        const name = Array.isArray(r.service) ? r.service[0]?.name : r.service?.name;
        if (name) e.names.push(name);
        e.full += Number(r.price || 0);
      }

      const toCard = (m: any): CoupleCardData => {
        const b = billMap[m.id] ?? {};
        const sv = svcByMember[m.id] ?? { names: [], full: 0 };
        return {
          id: m.id,
          registration_number: m.registration_number,
          full_name: m.full_name,
          phone: m.phone,
          offer_code: m.offer_code,
          package_name: b.package_name ?? null,
          registration_fee: Number(b.registration_fee ?? 0),
          package_fee: Number(b.package_fee ?? 0),
          services_total: Number(b.services_total ?? 0),
          discount: Math.max(sv.full - Number(b.services_total ?? 0), 0),
          net_payable: Number(b.net_payable ?? 0),
          services: sv.names,
        };
      };

      const cards = (groupRows ?? []).map(toCard);
      wifeCard = cards.find((c) => c.offer_code === 'wife') ?? cards[1] ?? null;
      husbandCard = cards.find((c) => c.id !== wifeCard?.id) ?? cards[0] ?? null;
    }
  }

  const serviceIds = (ms ?? []).map((r: any) => r.service_id);
  const action = updateMember.bind(null, params.id);

  return (
    <div>
      <PageHeader
        title="Edit Member"
        subtitle={`${member.registration_number ?? ''} · ${member.full_name}`}
        action={
          <Link href={`/members/${params.id}/card`} className="btn-ghost">
            Membership Card
          </Link>
        }
      />

      {husbandCard && wifeCard && (
        <CoupleCards
          husband={husbandCard}
          wife={wifeCard}
          currentId={member.id}
          groupId={member.couple_group_id}
        />
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
