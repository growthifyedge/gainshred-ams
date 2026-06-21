'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { settingsSchema, planSchema, firstError } from '@/lib/validations';

export type SettingsState = { error?: string; message?: string };

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return { error: 'Only admins can change settings.' };

  const parsed = settingsSchema.safeParse({
    gym_name: formData.get('gym_name'),
    gym_phone: formData.get('gym_phone'),
    gym_address: formData.get('gym_address'),
    currency: formData.get('currency'),
    penalty_type: formData.get('penalty_type'),
    penalty_fixed: formData.get('penalty_fixed'),
    penalty_daily: formData.get('penalty_daily'),
    penalty_grace_days: formData.get('penalty_grace_days'),
    penalty_max: formData.get('penalty_max'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = createClient();
  const { error } = await supabase
    .from('settings')
    .update({
      ...parsed.data,
      gym_phone: parsed.data.gym_phone || null,
      gym_address: parsed.data.gym_address || null,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq('id', 1);
  if (error) return { error: error.message };

  await logAudit('update', 'settings', '1', { penalty_type: parsed.data.penalty_type });
  revalidatePath('/settings');
  revalidatePath('/dues');
  return { message: 'Settings saved.' };
}

export async function createPlan(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return { error: 'Only admins can manage plans.' };

  const parsed = planSchema.safeParse({
    name: formData.get('name'),
    monthly_fee: formData.get('monthly_fee'),
    description: formData.get('description'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const isActive = formData.get('is_active') === 'on';

  const supabase = createClient();
  const { data, error } = await supabase
    .from('membership_plans')
    .insert({
      name: parsed.data.name,
      monthly_fee: parsed.data.monthly_fee,
      description: parsed.data.description || null,
      is_active: isActive,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await logAudit('create', 'membership_plan', data.id, { name: parsed.data.name });
  revalidatePath('/settings');
  return { message: 'Plan added.' };
}

// Activate / deactivate a plan (admin only).
export async function togglePlan(id: string, isActive: boolean) {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return;

  const supabase = createClient();
  await supabase.from('membership_plans').update({ is_active: isActive }).eq('id', id);
  await logAudit('toggle_active', 'membership_plan', id, { is_active: isActive });
  revalidatePath('/settings');
}

export async function deletePlan(id: string) {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return;

  const supabase = createClient();
  // Deactivate instead of hard-delete if the plan is in use.
  const { error } = await supabase.from('membership_plans').delete().eq('id', id);
  if (error) {
    await supabase.from('membership_plans').update({ is_active: false }).eq('id', id);
    await logAudit('deactivate_fallback', 'membership_plan', id, { reason: error.message });
  } else {
    await logAudit('delete', 'membership_plan', id);
  }
  revalidatePath('/settings');
}
