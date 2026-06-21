'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { paymentSchema, firstError } from '@/lib/validations';
import { firstOfMonth } from '@/lib/utils';

export type FormState = { error?: string };

// Normalise a YYYY-MM (from <input type="month">) to the 1st of that month.
function monthToDate(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return firstOfMonth(new Date(value));
}

export async function createPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (!profile) return { error: 'Not authenticated.' };

  const parsed = paymentSchema.safeParse({
    member_id: formData.get('member_id'),
    payment_month: formData.get('payment_month'),
    amount: formData.get('amount'),
    penalty_amount: formData.get('penalty_amount'),
    advance_added: formData.get('advance_added'),
    advance_applied: formData.get('advance_applied'),
    payment_method: formData.get('payment_method'),
    payment_date: formData.get('payment_date'),
    notes: formData.get('notes'),
    receipt_image_url: formData.get('receipt_image_url'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const input = parsed.data;
  const monthDate = monthToDate(input.payment_month);
  const supabase = createClient();

  // Require the transaction to actually do something.
  if (
    input.amount === 0 &&
    input.penalty_amount === 0 &&
    input.advance_added === 0 &&
    input.advance_applied === 0
  ) {
    return { error: 'Enter a fee, penalty, advance deposit, or advance to apply.' };
  }

  // Advance applied cannot exceed the fee it is paying for.
  if (input.advance_applied > input.amount) {
    return { error: 'Advance applied cannot exceed the fee amount.' };
  }

  // Advance applied cannot exceed the member's available advance balance.
  if (input.advance_applied > 0) {
    const { data: m } = await supabase
      .from('members')
      .select('advance_balance')
      .eq('id', input.member_id)
      .single();
    const balance = Number(m?.advance_balance ?? 0);
    if (input.advance_applied > balance) {
      return { error: `Not enough advance balance (available Rs. ${balance}).` };
    }
  }

  // Find or open the due for this member + month (works for staff via SECURITY DEFINER).
  const { data: dueId, error: dueErr } = await supabase.rpc('get_or_create_due', {
    p_member: input.member_id,
    p_month: monthDate,
  });
  if (dueErr) return { error: dueErr.message };

  const { data, error } = await supabase
    .from('payments')
    .insert({
      member_id: input.member_id,
      due_id: dueId,
      payment_month: monthDate,
      amount: input.amount,
      penalty_amount: input.penalty_amount,
      advance_added: input.advance_added,
      advance_applied: input.advance_applied,
      payment_method: input.payment_method,
      payment_date: input.payment_date,
      notes: input.notes || null,
      receipt_image_url: input.receipt_image_url || null,
      created_by: profile.id,
    })
    .select('id, receipt_number')
    .single();

  if (error) return { error: error.message };

  await logAudit('create', 'payment', data.id, {
    receipt_number: data.receipt_number,
    amount: input.amount,
    penalty: input.penalty_amount,
    advance_added: input.advance_added,
    advance_applied: input.advance_applied,
  });

  revalidatePath('/payments');
  revalidatePath('/dues');
  revalidatePath('/dashboard');
  redirect(`/receipt/${data.id}`);
}

// Void (cancel) a payment — admin only. Records are never hard-deleted.
export async function voidPayment(id: string) {
  const profile = await getProfile();
  if (profile?.role !== 'admin') return;

  const supabase = createClient();
  await supabase.from('payments').update({ status: 'void' }).eq('id', id);
  await logAudit('void', 'payment', id);
  revalidatePath('/payments');
  revalidatePath('/dues');
  revalidatePath('/dashboard');
}
