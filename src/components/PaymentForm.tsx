'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_METHODS, formatMoney } from '@/lib/utils';
import type { FormState } from '@/app/(app)/payments/actions';

type Member = {
  id: string;
  full_name: string;
  registration_number?: string | null;
  monthly_fee: number;
  status: string;
  advance_balance?: number;
};

type DiscountType = 'none' | 'percent' | 'fixed';

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
  const [month, setMonth] = useState(defaultMonth);
  const [amount, setAmount] = useState('');
  const [penalty, setPenalty] = useState('0');
  const [advanceAdded, setAdvanceAdded] = useState('0');
  const [advanceApplied, setAdvanceApplied] = useState('0');
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = useState('0');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  type Bill = {
    registration_fee: number;
    package_fee: number;
    services_total: number;
    gross_payable: number;
    discount: number;
    paid: number;
    receivable: number;
    package_name?: string | null;
  };
  const [summary, setSummary] = useState<Bill | null>(null);

  const selected = useMemo(() => members.find((m) => m.id === memberId), [members, memberId]);
  const advanceBalance = Number(selected?.advance_balance ?? 0);

  // Load the member's FULL bill from the single source of truth (member_billing).
  useEffect(() => {
    if (!memberId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('member_billing')
        .select(
          'registration_fee, package_fee, services_total, gross_payable, discount, paid, receivable, package_name'
        )
        .eq('member_id', memberId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setSummary({
          registration_fee: Number(data.registration_fee),
          package_fee: Number(data.package_fee),
          services_total: Number(data.services_total),
          gross_payable: Number(data.gross_payable),
          discount: Number(data.discount),
          paid: Number(data.paid),
          receivable: Number(data.receivable),
          package_name: data.package_name,
        });
        setAmount(String(Number(data.receivable)));
      } else {
        setSummary(null);
        setAmount('0');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // Live accounting figures (gross is the member's full lump-sum bill).
  const gross = summary?.gross_payable ?? 0;
  const existingDiscount = summary?.discount ?? 0;
  const paidToDate = summary?.paid ?? 0;
  const manualDiscount =
    discountType === 'percent'
      ? (gross * Number(discountValue || 0)) / 100
      : discountType === 'fixed'
        ? Number(discountValue || 0)
        : 0;
  const totalDiscount = Math.min(
    existingDiscount + (discountType === 'none' ? 0 : Math.max(manualDiscount, 0)),
    gross
  );
  const netPayable = Math.max(gross - totalDiscount, 0);
  const dueBefore = Math.max(netPayable - paidToDate, 0);
  const dueAfter = Math.max(netPayable - paidToDate - Number(amount || 0), 0);

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
          <label className="label" htmlFor="member_id">Member *</label>
          <select
            id="member_id"
            name="member_id"
            required
            value={memberId}
            onChange={(e) => {
              setMemberId(e.target.value);
              setAdvanceApplied('0');
            }}
            className="input"
          >
            <option value="">— Select member —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.registration_number ? `${m.registration_number} · ` : ''}
                {m.full_name}
                {m.status !== 'active' ? ` (${m.status})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="payment_month">Payment month *</label>
          <input id="payment_month" name="payment_month" type="month" required value={month} onChange={(e) => setMonth(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="payment_date">Payment date *</label>
          <input id="payment_date" name="payment_date" type="date" required defaultValue={defaultDate} className="input" />
        </div>
      </div>

      {/* Financial summary (auto-filled from member_billing) */}
      {selected && summary && (
        <div className="rounded-lg bg-neutral-50 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Fee Summary{summary.package_name ? ` · ${summary.package_name}` : ''}</span>
            <span className="font-mono text-xs text-neutral-500">{selected.registration_number ?? ''}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Row label="Registration Fee" value={formatMoney(summary.registration_fee)} />
            <Row label="Package Fee" value={formatMoney(summary.package_fee)} />
            <Row label="Services Total" value={formatMoney(summary.services_total)} />
            <Row label="Gross Payable" value={formatMoney(gross)} />
            <Row label="Discount" value={formatMoney(totalDiscount)} />
            <Row label="Net Payable" value={formatMoney(netPayable)} />
            <Row label="Paid to date" value={formatMoney(paidToDate)} />
            <Row label="Advance balance" value={formatMoney(advanceBalance)} />
          </dl>
          <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-2">
            <span className="font-semibold">Due / receivable after this payment</span>
            <span className="text-base font-bold text-brand">{formatMoney(dueAfter)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="amount">Amount received (Rs.)</label>
          <input id="amount" name="amount" type="number" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="penalty_amount">Penalty paid (Rs.)</label>
          <input id="penalty_amount" name="penalty_amount" type="number" min={0} step="1" value={penalty} onChange={(e) => setPenalty(e.target.value)} className="input" />
        </div>

        <div>
          <label className="label" htmlFor="discount_type">Discount type</label>
          <select id="discount_type" name="discount_type" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} className="input">
            <option value="none">No discount</option>
            <option value="percent">Percentage (%)</option>
            <option value="fixed">Fixed amount (Rs.)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="discount_value">Discount value</label>
          <input id="discount_value" name="discount_value" type="number" min={0} step="1" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} disabled={discountType === 'none'} className="input disabled:bg-neutral-100" />
        </div>

        <div>
          <label className="label" htmlFor="advance_applied">Apply from advance (Rs.)</label>
          <input id="advance_applied" name="advance_applied" type="number" min={0} step="1" value={advanceApplied} onChange={(e) => setAdvanceApplied(e.target.value)} className="input" />
          <p className="mt-1 text-xs text-neutral-400">Available {formatMoney(advanceBalance)}.</p>
        </div>
        <div>
          <label className="label" htmlFor="advance_added">Add to advance (Rs.)</label>
          <input id="advance_added" name="advance_added" type="number" min={0} step="1" value={advanceAdded} onChange={(e) => setAdvanceAdded(e.target.value)} className="input" />
        </div>

        <div>
          <label className="label" htmlFor="payment_method">Payment method *</label>
          <select id="payment_method" name="payment_method" required className="input">
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="receipt_image">Receipt image (optional)</label>
          <input id="receipt_image" type="file" accept="image/*" onChange={onFileChange} className="input" />
          {uploading && <p className="mt-1 text-xs text-neutral-500">Uploading…</p>}
          {imageUrl && !uploading && <p className="mt-1 text-xs text-emerald-600">Image uploaded ✓</p>}
          {uploadError && <p className="mt-1 text-xs text-brand">{uploadError}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={2} className="input" />
        </div>
      </div>

      <input type="hidden" name="receipt_image_url" value={imageUrl} />

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{state.error}</p>
      )}

      <div className="flex gap-3">
        <Submit />
        <Link href="/payments" className="btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
