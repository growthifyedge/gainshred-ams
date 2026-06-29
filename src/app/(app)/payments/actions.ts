'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { paymentSchema, firstError } from '@/lib/validations';
import { firstOfMonth, computeNextDueDate } from '@/lib/utils';

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
    discount_type: formData.get('discount_type'),
    discount_value: formData.get('discount_value'),
    notes: formData.get('notes'),
    receipt_image_url: formData.get('receipt_image_url'),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const input = parsed.data;
  const monthDate = monthToDate(input.payment_month);
  const supabase = createClient();

  const hasDiscount = input.discount_type !== 'none' && input.discount_value > 0;

  // Require the transaction to actually do something.
  if (
    input.amount === 0 &&
    input.penalty_amount === 0 &&
    input.advance_added === 0 &&
    input.advance_applied === 0 &&
    !hasDiscount
  ) {
    return { error: 'Enter a fee, penalty, advance, or a discount to apply.' };
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

  // Manual discount: percentage / fixed off the member's GROSS bill (member_billing).
  let discountAmount = 0;
  if (hasDiscount) {
    const { data: bill } = await supabase
      .from('member_billing')
      .select('gross_payable, discount')
      .eq('member_id', input.member_id)
      .maybeSingle();
    const gross = Number(bill?.gross_payable ?? 0);
    const existingDiscount = Number(bill?.discount ?? 0);
    discountAmount =
      input.discount_type === 'percent'
        ? (gross * input.discount_value) / 100
        : input.discount_value;
    // Don't let total discount exceed the gross bill.
    discountAmount = Math.min(Math.max(discountAmount, 0), Math.max(gross - existingDiscount, 0));
    discountAmount = Math.round(discountAmount * 100) / 100;
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      member_id: input.member_id,
      due_id: null,
      payment_month: monthDate,
      amount: input.amount,
      penalty_amount: input.penalty_amount,
      advance_added: input.advance_added,
      advance_applied: input.advance_applied,
      discount: discountAmount,
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
    discount: discountAmount,
    advance_added: input.advance_added,
    advance_applied: input.advance_applied,
  });

  // Phase 8: after a successful fee payment, advance the member's renewal date
  // by their plan duration — from the current next_due_date, or from joining_date
  // if it isn't set yet. No plan/duration => leave next_due_date unchanged.
  if (input.amount > 0) {
    const { data: m } = await supabase
      .from('members')
      .select('plan_id, next_due_date, joining_date')
      .eq('id', input.member_id)
      .single();
    if (m?.plan_id) {
      const { data: pl } = await supabase
        .from('membership_plans')
        .select('duration_months')
        .eq('id', m.plan_id)
        .single();
      const base = m.next_due_date ?? m.joining_date;
      const newNextDue = computeNextDueDate(base, pl?.duration_months ?? null);
      if (newNextDue) {
        await supabase.from('members').update({ next_due_date: newNextDue }).eq('id', input.member_id);
      }
    }
  }

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
