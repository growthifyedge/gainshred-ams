'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { memberSchema, firstError } from '@/lib/validations';

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
    notes: input.notes || null,
  };
}

export async function createMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return { error: 'Only admins can add members.' };

  const parsed = parseMember(formData);
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('members')
    .insert(toRow(parsed.data))
    .select('id')
    .single();

  if (error) return { error: error.message };

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

  const supabase = createClient();
  const { error } = await supabase.from('members').update(toRow(parsed.data)).eq('id', id);
  if (error) return { error: error.message };

  await logAudit('update', 'member', id, { full_name: parsed.data.full_name });
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
