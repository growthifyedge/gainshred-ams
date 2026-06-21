'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import type { FormState } from '@/app/(app)/members/actions';

type Plan = { id: string; name: string; monthly_fee: number };

type MemberValues = {
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  joining_date?: string;
  plan_id?: string | null;
  monthly_fee?: number;
  due_day?: number;
  status?: string;
  notes?: string | null;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : label}
    </button>
  );
}

export default function MemberForm({
  action,
  plans,
  initial,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  plans: Plan[];
  initial?: MemberValues;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState<FormState, FormData>(action, {});
  const [fee, setFee] = useState<string>(
    initial?.monthly_fee != null ? String(initial.monthly_fee) : ''
  );

  // Auto-fill the monthly fee from the selected plan (admin can still edit it).
  function onPlanChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const plan = plans.find((p) => p.id === e.target.value);
    if (plan) setFee(String(plan.monthly_fee));
  }

  return (
    <form action={formAction} className="card max-w-2xl space-y-5 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="full_name">
            Full name *
          </label>
          <input
            id="full_name"
            name="full_name"
            required
            defaultValue={initial?.full_name ?? ''}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="phone">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            defaultValue={initial?.phone ?? ''}
            className="input"
            placeholder="03001234567"
          />
        </div>

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ''}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="joining_date">
            Joining date *
          </label>
          <input
            id="joining_date"
            name="joining_date"
            type="date"
            required
            defaultValue={initial?.joining_date ?? ''}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="plan_id">
            Membership plan
          </label>
          <select
            id="plan_id"
            name="plan_id"
            defaultValue={initial?.plan_id ?? ''}
            onChange={onPlanChange}
            className="input"
          >
            <option value="">— None —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (Rs. {p.monthly_fee})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="monthly_fee">
            Monthly fee (Rs.) *
          </label>
          <input
            id="monthly_fee"
            name="monthly_fee"
            type="number"
            min={0}
            step="1"
            required
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="due_day">
            Payment due day (1–28) *
          </label>
          <input
            id="due_day"
            name="due_day"
            type="number"
            min={1}
            max={28}
            required
            defaultValue={initial?.due_day ?? 5}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="status">
            Status *
          </label>
          <select
            id="status"
            name="status"
            defaultValue={initial?.status ?? 'active'}
            className="input"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="frozen">Frozen</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={initial?.notes ?? ''}
            className="input"
          />
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{state.error}</p>
      )}

      <div className="flex gap-3">
        <Submit label={submitLabel} />
        <Link href="/members" className="btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
