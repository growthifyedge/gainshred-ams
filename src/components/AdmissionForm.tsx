'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { OFFER_OPTIONS } from '@/lib/packages';
import { formatMoney } from '@/lib/utils';
import { submitAdmission, type AdmissionState } from '@/app/admission/actions';

type Plan = { id: string; name: string; total_price?: number | null; monthly_fee: number };
type Service = { id: string; name: string; price: number; category: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? 'Submitting…' : 'Submit Admission Request'}
    </button>
  );
}

export default function AdmissionForm({
  plans,
  services,
}: {
  plans: Plan[];
  services: Service[];
}) {
  const [state, formAction] = useFormState<AdmissionState, FormData>(submitAdmission, {});

  if (state.success) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl">
          ✓
        </div>
        <h2 className="text-xl font-bold">Admission request submitted successfully.</h2>
        <p className="mt-2 text-sm text-neutral-500">Our team will review and contact you.</p>
        <a href="/admission" className="btn-ghost mt-5 inline-block">
          Submit another request
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="full_name">Full name *</label>
          <input id="full_name" name="full_name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Contact number *</label>
          <input id="phone" name="phone" required className="input" placeholder="03001234567" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="age">Age *</label>
          <input id="age" name="age" type="number" min={1} max={120} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="gender">Gender *</label>
          <select id="gender" name="gender" required className="input" defaultValue="">
            <option value="">— Select —</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">Address</label>
          <input id="address" name="address" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="emergency_contact">Emergency contact</label>
          <input id="emergency_contact" name="emergency_contact" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="preferred_joining_date">Preferred joining date *</label>
          <input id="preferred_joining_date" name="preferred_joining_date" type="date" required className="input" />
        </div>

        <div>
          <label className="label" htmlFor="plan_id">Membership duration *</label>
          <select id="plan_id" name="plan_id" required className="input" defaultValue="">
            <option value="">— Select —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.total_price ? ` — ${formatMoney(p.total_price)}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="offer_code">Offer (if applicable)</label>
          <select id="offer_code" name="offer_code" className="input" defaultValue="none">
            {OFFER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {services.length > 0 && (
        <div>
          <p className="label">Services required</p>
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="service_ids" value={s.id} className="h-4 w-4" />
                <span>{s.name}</span>
                <span className="text-neutral-400">{formatMoney(s.price)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={2} className="input" />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{state.error}</p>
      )}

      <Submit />
      <p className="text-center text-xs text-neutral-400">
        No photo upload required. Our team may add details manually after review.
      </p>
    </form>
  );
}
