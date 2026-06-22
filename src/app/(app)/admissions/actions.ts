'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getKarachiDate } from '@/lib/utils';
import { memberBillSnapshot } from '@/lib/billing';

export type AdmissionState = { error?: string };

// Create ONE member from request/spouse data using the existing billing engine.
async function createMemberFrom(
  supabase: any,
  data: {
    full_name: string;
    phone?: string | null;
    email?: string | null;
    age?: number | null;
    joining_date: string;
    plan_id?: string | null;
    offer_code: string;
    notes?: string | null;
    couple_group_id?: string | null;
    service_ids: string[];
    includeRegistration?: boolean;
  }
) {
  const snap = await memberBillSnapshot(supabase, {
    planId: data.plan_id ?? null,
    serviceIds: data.service_ids,
    offer: data.offer_code,
    age: data.age ?? null,
    includeRegistration: data.includeRegistration,
  });
  const { data: member, error } = await supabase
    .from('members')
    .insert({
      full_name: data.full_name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      age: data.age ?? null,
      joining_date: data.joining_date,
      plan_id: data.plan_id ?? null,
      offer_code: data.offer_code,
      due_day: 5,
      status: 'active',
      notes: data.notes ?? null,
      couple_group_id: data.couple_group_id ?? null,
      ...snap,
    })
    .select('id, registration_number')
    .single();
  if (error) throw new Error(error.message);

  if (data.service_ids.length) {
    const { data: svcs } = await supabase.from('services').select('id, price').in('id', data.service_ids);
    const rows = (svcs ?? []).map((s: any) => ({ member_id: member.id, service_id: s.id, price: s.price }));
    if (rows.length) await supabase.from('member_services').insert(rows);
  }
  return member;
}

async function existingMemberWith(supabase: any, phone?: string | null, email?: string | null) {
  const parts: string[] = [];
  if (phone) parts.push(`phone.eq.${phone}`);
  if (email) parts.push(`email.eq.${email}`);
  if (!parts.length) return null;
  const { data } = await supabase.from('members').select('full_name').or(parts.join(',')).limit(1);
  return data && data.length ? data[0] : null;
}

// Approve / reject a request (admin only).
export async function setAdmissionStatus(id: string, status: 'approved' | 'rejected' | 'pending') {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return;
  const supabase = createClient();
  await supabase.from('admission_requests').update({ status }).eq('id', id);
  await logAudit('status_change', 'admission_request', id, { status });
  revalidatePath('/admissions');
}

// Convert a request into a real member (admin only). Checks duplicate phone/email.
export async function convertAdmission(
  id: string,
  _prev: AdmissionState,
  _formData: FormData
): Promise<AdmissionState> {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return { error: 'Admin access only.' };

  const supabase = createClient();
  const { data: req } = await supabase.from('admission_requests').select('*').eq('id', id).single();
  if (!req) return { error: 'Request not found.' };
  if (req.status === 'converted') return { error: 'Already converted.' };

  const joining = req.preferred_joining_date || getKarachiDate();
  const husbandServices: string[] = Array.isArray(req.selected_services) ? req.selected_services : [];
  const isCouple = req.member_type === 'couple' && req.spouse;

  // Duplicate guard for the primary (husband / single).
  const dupPrimary = await existingMemberWith(supabase, req.phone, req.email);
  if (dupPrimary) {
    return { error: `A member with this phone/email already exists: ${dupPrimary.full_name}.` };
  }

  // ---------------- COUPLE: create husband + wife ----------------
  if (isCouple) {
    const sp = req.spouse as any;
    const dupWife = await existingMemberWith(supabase, sp.phone, sp.email);
    if (dupWife) {
      return { error: `A member with the wife's phone/email already exists: ${dupWife.full_name}.` };
    }

    const groupId = randomUUID();
    // Same per-person offer rule as the working Add Member → Couple flow
    // (createCouple): 67+ becomes senior; otherwise husband=none, wife=wife.
    const husbandOffer = req.age != null && req.age >= 67 ? 'senior' : 'none';
    const wifeOffer = sp.age != null && sp.age >= 67 ? 'senior' : 'wife';
    let husband, wife;
    try {
      husband = await createMemberFrom(supabase, {
        full_name: req.full_name,
        phone: req.phone,
        email: req.email,
        age: req.age,
        joining_date: joining,
        plan_id: req.selected_membership_plan_id,
        offer_code: husbandOffer,
        notes: req.notes,
        couple_group_id: groupId,
        service_ids: husbandServices,
      });
      wife = await createMemberFrom(supabase, {
        full_name: sp.full_name,
        phone: sp.phone ?? null,
        email: sp.email ?? null,
        age: sp.age ?? null,
        joining_date: joining,
        plan_id: sp.plan_id ?? null,
        offer_code: wifeOffer,
        notes: null,
        couple_group_id: groupId,
        service_ids: Array.isArray(sp.service_ids) ? sp.service_ids : [],
        includeRegistration: false, // wife pays no registration in a couple
      });
    } catch (e: any) {
      return { error: e?.message ?? 'Could not convert the couple.' };
    }

    await supabase
      .from('admission_requests')
      .update({ status: 'converted', converted_member_id: husband.id, converted_spouse_member_id: wife.id })
      .eq('id', id);

    await logAudit('convert_couple', 'admission_request', id, {
      group: groupId,
      husband: husband.registration_number,
      wife: wife.registration_number,
    });

    revalidatePath('/admissions');
    revalidatePath('/members');
    redirect(`/members/${husband.id}/edit`);
  }

  // ---------------- SINGLE: create one member ----------------
  let member;
  try {
    member = await createMemberFrom(supabase, {
      full_name: req.full_name,
      phone: req.phone,
      email: req.email,
      age: req.age,
      joining_date: joining,
      plan_id: req.selected_membership_plan_id,
      offer_code: req.offer_code || 'none',
      notes: req.notes,
      service_ids: husbandServices,
    });
  } catch (e: any) {
    return { error: e?.message ?? 'Could not convert the request.' };
  }

  await supabase
    .from('admission_requests')
    .update({ status: 'converted', converted_member_id: member.id })
    .eq('id', id);

  await logAudit('convert', 'admission_request', id, {
    member_id: member.id,
    registration_number: member.registration_number,
  });

  revalidatePath('/admissions');
  revalidatePath('/members');
  redirect(`/members/${member.id}/edit`);
}
