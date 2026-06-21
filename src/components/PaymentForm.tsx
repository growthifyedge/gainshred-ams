'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_METHODS, formatMoney } from '@/lib/utils';
import type { FormState } from '@/app/(app)/payments/actions';

type Member = {
  id: string;
  full_name: string;
  monthly_fee: number;
  status: string;
  advance_balance?: number;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : 'Save Payment'}
    </button>
  );
}

export default function PaymentForm({
  action,
  members,
  defaultMonth,
  defaultDate,
  presetMemberId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  members: Member[];
  defaultMonth: string;
  defaultDate: string;
  presetMemberId?: string;
}) {
  const [state, formAction] = useFormState<FormState, FormData>(action, {});
  const [memberId, setMemberId] = useState(presetMemberId ?? '');
  const [amount, setAmount] = useState('');
  const [penalty, setPenalty] = useState('0');
  const [advanceAdded, setAdvanceAdded] = useState('0');
  const [advanceApplied, setAdvanceApplied] = useState('0');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const selected = useMemo(
    () => members.find((m) => m.id === memberId),
    [members, memberId]
  );
  const advanceBalance = Number(selected?.advance_balance ?? 0);

  // Live "cash to collect" = (fee paid in cash) + penalty + new advance deposited.
  const cashToCollect = Math.max(
    Number(amount || 0) - Number(advanceApplied || 0),
    0
  ) + Number(penalty || 0) + Number(advanceAdded || 0);

  function onMemberChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setMemberId(id);
    const m = members.find((x) => x.id === id);
    if (m) setAmount(String(m.monthly_fee));
    setAdvanceApplied('0');
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('receipts').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from('receipts').getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (err: any) {
      setUploadError(err?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="card max-w-2xl space-y-5 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="member_id">
            Member *
          </label>
          <select
            id="member_id"
            name="member_id"
            required
            value={memberId}
            onChange={onMemberChange}
            className="input"
          >
            <option value="">— Select member —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
                {m.status !== 'active' ? ` (${m.status})` : ''}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-1 text-xs text-neutral-500">
              Monthly fee: {formatMoney(selected.monthly_fee)} · Advance balance:{' '}
              <span className="font-semibold text-emerald-600">
                {formatMoney(advanceBalance)}
              </span>
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="payment_month">
            Payment month *
          </label>
          <input
            id="payment_month"
            name="payment_month"
            type="month"
            required
            defaultValue={defaultMonth}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="payment_date">
            Payment date *
          </label>
          <input
            id="payment_date"
            name="payment_date"
            type="date"
            required
            defaultValue={defaultDate}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="amount">
            Fee amount (Rs.)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min={0}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Pay full or partial fee for the selected month.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="penalty_amount">
            Penalty paid (Rs.)
          </label>
          <input
            id="penalty_amount"
            name="penalty_amount"
            type="number"
            min={0}
            step="1"
            value={penalty}
            onChange={(e) => setPenalty(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="advance_applied">
            Apply from advance (Rs.)
          </label>
          <input
            id="advance_applied"
            name="advance_applied"
            type="number"
            min={0}
            max={Math.min(advanceBalance, Number(amount || 0)) || 0}
            step="1"
            value={advanceApplied}
            onChange={(e) => setAdvanceApplied(e.target.value)}
            className="input"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Use existing advance to cover the fee (max {formatMoney(Math.min(advanceBalance, Number(amount || 0)))}).
          </p>
        </div>

        <div>
          <label className="label" htmlFor="advance_added">
            Add to advance (Rs.)
          </label>
          <input
            id="advance_added"
            name="advance_added"
            type="number"
            min={0}
            step="1"
            value={advanceAdded}
            onChange={(e) => setAdvanceAdded(e.target.value)}
            className="input"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Extra money kept as advance for future months.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="payment_method">
            Payment method *
          </label>
          <select id="payment_method" name="payment_method" required className="input">
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="receipt_image">
            Receipt image (optional)
          </label>
          <input
            id="receipt_image"
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="input"
          />
          {uploading && <p className="mt-1 text-xs text-neutral-500">Uploading…</p>}
          {imageUrl && !uploading && (
            <p className="mt-1 text-xs text-emerald-600">Image uploaded ✓</p>
          )}
          {uploadError && <p className="mt-1 text-xs text-brand">{uploadError}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={2} className="input" />
        </div>
      </div>

      {/* Cash summary */}
      <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3 text-sm">
        <span className="font-medium text-neutral-600">Cash to collect now</span>
        <span className="text-lg font-bold text-brand">{formatMoney(cashToCollect)}</span>
      </div>

      {/* Hidden field carries the uploaded image URL into the server action. */}
      <input type="hidden" name="receipt_image_url" value={imageUrl} />

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{state.error}</p>
      )}

      <div className="flex gap-3">
        <Submit />
        <Link href="/payments" className="btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
