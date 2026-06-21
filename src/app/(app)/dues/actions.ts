'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { firstOfMonth } from '@/lib/utils';

export type DuesState = { error?: string; message?: string };

function monthToDate(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return firstOfMonth(new Date(value));
}

// Bulk-create dues for all active members for a chosen month (admin only).
export async function generateDues(_prev: DuesState, formData: FormData): Promise<DuesState> {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return { error: 'Only admins can generate dues.' };

  const month = String(formData.get('month') ?? '');
  if (!month) return { error: 'Choose a month.' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('generate_dues_for_month', {
    p_month: monthToDate(month),
  });
  if (error) return { error: error.message };

  await logAudit('generate_dues', 'dues', null, { month, created: data });
  revalidatePath('/dues');
  revalidatePath('/dashboard');
  return { message: `Generated ${data ?? 0} new due(s) for the selected month.` };
}

// Waive the outstanding penalty on a single due (admin only).
export async function waivePenalty(dueId: string, memberId: string, amount: number) {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return;

  const supabase = createClient();
  await supabase.from('dues').update({ penalty_waived: true }).eq('id', dueId);
  await supabase.from('penalties').insert({
    due_id: dueId,
    member_id: memberId,
    amount,
    type: 'waiver',
    reason: 'Waived by admin',
    created_by: profile.id,
  });
  await logAudit('waive_penalty', 'due', dueId, { amount });
  revalidatePath('/dues');
  revalidatePath('/dashboard');
}
