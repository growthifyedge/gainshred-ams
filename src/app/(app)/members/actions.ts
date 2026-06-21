'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { memberSchema, firstError } from '@/lib/validations';
import { getKarachiDate } from '@/lib/utils';

export type FormState = { error?: string };

function parseMember(formData: FormData) {
  return memberSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    joining_date: formData.get('joining_date'),
    plan_id: formData.get('plan_id'),
    monthly_fee: formData.get('monthly_fee'),
    due_day: formData.get('due_day'),
    status: formData.get('status'),
    notes: formData.get('notes'),
  });
}

function toRow(input: ReturnType<typeof memberSchema.parse>) {
  return {
    full_name: input.full_name,
    phone: input.phone || null,
    email: input.email || null,
    joining_date: input.joining_date,
    plan_id: input.plan_id || null,
    monthly_fee: input.monthly_fee,
    due_day: input.due_day,
    status: input.status,
    age: input.age ?? null,
    offer_code: input.offer_code ?? 'none',
    notes: input.notes || null,
  };
}

// Replace a member's selected services with the chosen set (admin only).
async function syncServices(supabase: any, memberId: string, serviceIds: string[]) {
  await supabase.from('member_services').delete().eq('member_id', memberId);
  if (!serviceIds.length) return;
  const { data: services } = await supabase
    .from('services')
    .select('id, price')
    .in('id', serviceIds);
  const rows = (services ?? []).map((s: any) => ({
    member_id: memberId,
    service_id: s.id,
    price: s.price,
  }));
  if (rows.length) await supabase.from('member_services').insert(rows);
}

export async function createMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return { error: 'Only admins can add members.' };

  const parsed = parseMember(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  const serviceIds = (formData.getAll('service_ids') as string[]).filter(Boolean);

  const supabase = createClient();
  const { data, error } = await supabase
    .from('members')
    .insert(toRow(parsed.data))
    .select('id')
    .single();

  if (error) return { error: error.message };

  await syncServices(supabase, data.id, serviceIds);
  await logAudit('create', 'member', data.id, { full_name: parsed.data.full_name });
  revalidatePath('/members');
  redirect('/members');
}

export async function updateMember(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return { error: 'Only admins can edit members.' };

  const parsed = parseMember(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  const serviceIds = (formData.getAll('service_ids') as string[]).filter(Boolean);

  const supabase = createClient();
  const { error } = await supabase.from('members').update(toRow(parsed.data)).eq('id', id);
  if (error) return { error: error.message };

  await syncServices(supabase, id, serviceIds);
  await logAudit('update', 'member', id, { full_name: parsed.data.full_name });
  revalidatePath('/members');
  redirect('/members');
}

// Couple admission: create husband + wife as two linked members (admin only).
// Husband = normal pricing; Wife = wife 50% offer. Each gets its own reg number.
export async function createCouple(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return { error: 'Only admins can add members.' };

  const hName = String(formData.get('h_full_name') ?? '').trim();
  const wName = String(formData.get('w_full_name') ?? '').trim();
  if (hName.length < 2 || wName.length < 2) {
    return { error: 'Both husband and wife full names are required.' };
  }

  const joining = String(formData.get('joining_date') ?? '') || getKarachiDate();
  const groupId = randomUUID();
  const supabase = createClient();

  async function createOne(prefix: 'h' | 'w', offerCode: 'none' | 'wife') {
    const planId = String(formData.get(`${prefix}_plan_id`) ?? '') || null;
    const ageRaw = String(formData.get(`${prefix}_age`) ?? '');
    const age = ageRaw === '' ? null : Number(ageRaw);

    let monthlyFee = 0;
    if (planId) {
      const { data: plan } = await supabase
        .from('membership_plans')
        .select('monthly_fee')
        .eq('id', planId)
        .single();
      monthlyFee = Number(plan?.monthly_fee ?? 0);
    }
    const isSenior = age != null && age >= 67;
    if (isSenior) monthlyFee = 0; // senior = free package

    const { data: member, error } = await supabase
      .from('members')
      .insert({
        full_name: String(formData.get(`${prefix}_full_name`)).trim(),
        phone: String(formData.get(`${prefix}_phone`) ?? '') || null,
        email: String(formData.get(`${prefix}_email`) ?? '') || null,
        age,
        joining_date: joining,
        plan_id: planId,
        monthly_fee: monthlyFee,
        offer_code: isSenior ? 'senior' : offerCode,
        due_day: 5,
        status: 'active',
        couple_group_id: groupId,
      })
      .select('id, registration_number')
      .single();
    if (error) throw new Error(error.message);

    const svcIds = (formData.getAll(`${prefix}_service_ids`) as string[]).filter(Boolean);
    if (svcIds.length) {
      const { data: svcs } = await supabase.from('services').select('id, price').in('id', svcIds);
      const rows = (svcs ?? []).map((s: any) => ({
        member_id: member.id,
        service_id: s.id,
        price: s.price,
      }));
      if (rows.length) await supabase.from('member_services').insert(rows);
    }
    return member;
  }

  try {
    const husband = await createOne('h', 'none');
    const wife = await createOne('w', 'wife');
    await logAudit('create_couple', 'member', husband.id, {
      group: groupId,
      husband: husband.registration_number,
      wife: wife.registration_number,
    });
  } catch (e: any) {
    return { error: e?.message ?? 'Could not create couple.' };
  }

  revalidatePath('/members');
  redirect('/members');
}

// Used by inline buttons in the members table.
export async function setMemberStatus(id: string, status: 'active' | 'inactive' | 'frozen') {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return;

  const supabase = createClient();
  await supabase.from('members').update({ status }).eq('id', id);
  await logAudit('status_change', 'member', id, { status });
  revalidatePath('/members');
}

export async function deleteMember(id: string) {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return;

  const supabase = createClient();
  // Members with payment history cannot be hard-deleted (FK restrict) — deactivate instead.
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) {
    await supabase.from('members').update({ status: 'inactive' }).eq('id', id);
    await logAudit('deactivate_fallback', 'member', id, { reason: error.message });
  } else {
    await logAudit('delete', 'member', id);
  }
  revalidatePath('/members');
}
