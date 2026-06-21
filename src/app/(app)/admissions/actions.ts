'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getKarachiDate } from '@/lib/utils';

export type AdmissionState = { error?: string };

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

  // Duplicate guard: existing member with same phone or email.
  const orParts: string[] = [];
  if (req.phone) orParts.push(`phone.eq.${req.phone}`);
  if (req.email) orParts.push(`email.eq.${req.email}`);
  if (orParts.length) {
    const { data: dup } = await supabase
      .from('members')
      .select('id, full_name')
      .or(orParts.join(','))
      .limit(1);
    if (dup && dup.length) {
      return { error: `A member with this phone/email already exists: ${dup[0].full_name}.` };
    }
  }

  // Monthly fee from the selected plan.
  let monthlyFee = 0;
  if (req.selected_membership_plan_id) {
    const { data: plan } = await supabase
      .from('membership_plans')
      .select('monthly_fee')
      .eq('id', req.selected_membership_plan_id)
      .single();
    monthlyFee = Number(plan?.monthly_fee ?? 0);
  }

  // Create the member (registration_number auto-generates via DB default).
  const { data: member, error } = await supabase
    .from('members')
    .insert({
      full_name: req.full_name,
      phone: req.phone,
      email: req.email,
      age: req.age,
      joining_date: req.preferred_joining_date || getKarachiDate(),
      plan_id: req.selected_membership_plan_id,
      monthly_fee: monthlyFee,
      offer_code: req.offer_code || 'none',
      due_day: 5,
      status: 'active',
      notes: req.notes,
    })
    .select('id, registration_number')
    .single();
  if (error) return { error: error.message };

  // Apply selected services.
  const serviceIds: string[] = Array.isArray(req.selected_services) ? req.selected_services : [];
  if (serviceIds.length) {
    const { data: svcs } = await supabase.from('services').select('id, price').in('id', serviceIds);
    const rows = (svcs ?? []).map((s: any) => ({
      member_id: member.id,
      service_id: s.id,
      price: s.price,
    }));
    if (rows.length) await supabase.from('member_services').insert(rows);
  }

  // Open a receivable (current month's due) so it shows in Dues immediately.
  await supabase.rpc('get_or_create_due', { p_member: member.id, p_month: getKarachiDate() });

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
