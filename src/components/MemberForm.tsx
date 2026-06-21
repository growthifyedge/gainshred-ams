'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { formatMoney } from '@/lib/utils';
import {
  computePackage,
  servicePayable,
  effectiveOffer,
  OFFER_OPTIONS,
  type OfferCode,
  type Plan,
  type Service,
} from '@/lib/packages';
import type { FormState } from '@/app/(app)/members/actions';

type MemberValues = {
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  joining_date?: string;
  plan_id?: string | null;
  monthly_fee?: number;
  due_day?: number;
  status?: string;
  age?: number | null;
  offer_code?: string | null;
  notes?: string | null;
  service_ids?: string[];
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : label}
    </button>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  registration: 'Registration',
  membership: 'Membership',
  training: 'Training',
  cardio: 'Cardio',
  class: 'Classes',
  other: 'Other',
};

export default function MemberForm({
  action,
  plans,
  services,
  initial,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  plans: Plan[];
  services: Service[];
  initial?: MemberValues;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState<FormState, FormData>(action, {});
  const [planId, setPlanId] = useState(initial?.plan_id ?? '');
  const [age, setAge] = useState<string>(initial?.age != null ? String(initial.age) : '');
  const [offer, setOffer] = useState<OfferCode>((initial?.offer_code as OfferCode) ?? 'none');
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.service_ids ?? []));

  const ageNum = age === '' ? null : Number(age);
  const eff = effectiveOffer(offer, ageNum);

  const pricing = useMemo(() => {
    const plan = plans.find((p) => p.id === planId) ?? null;
    const svc = services.filter((s) => selected.has(s.id));
    return computePackage({ plan, services: svc, offer, age: ageNum });
  }, [plans, services, planId, selected, offer, ageNum]);

  const grouped = useMemo(() => {
    const g: Record<string, Service[]> = {};
    for (const s of services) (g[s.category] ??= []).push(s);
    return g;
  }, [services]);

  function toggleService(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="card max-w-3xl space-y-6 p-6">
      {/* Member Details */}
      <Section title="Member Details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="full_name">Full name *</label>
            <input id="full_name" name="full_name" required defaultValue={initial?.full_name ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone number</label>
            <input id="phone" name="phone" defaultValue={initial?.phone ?? ''} className="input" placeholder="03001234567" />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue={initial?.email ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="joining_date">Joining date *</label>
            <input id="joining_date" name="joining_date" type="date" required defaultValue={initial?.joining_date ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="age">Age</label>
            <input id="age" name="age" type="number" min={0} max={120} value={age}
              onChange={(e) => setAge(e.target.value)}
              className="input" placeholder="e.g. 30" />
            {pricing.isSenior && <p className="mt-1 text-xs font-medium text-emerald-600">Senior Citizen Offer applies (67+)</p>}
          </div>
        </div>
      </Section>

      {/* Package & Offer */}
      <Section title="Package & Offer">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="plan_id">Membership duration / package</label>
            <select id="plan_id" name="plan_id" value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="input">
              <option value="">— None —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.total_price ? ` — ${formatMoney(p.total_price)}` : ''}{p.saving_amount ? ` (Save ${formatMoney(p.saving_amount)})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="offer_code">Offer</label>
            <select id="offer_code" name="offer_code" value={offer}
              onChange={(e) => setOffer(e.target.value as OfferCode)}
              className="input">
              {OFFER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="due_day">Payment due day (1–28) *</label>
            <input id="due_day" name="due_day" type="number" min={1} max={28} required defaultValue={initial?.due_day ?? 5} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="status">Status *</label>
            <select id="status" name="status" defaultValue={initial?.status ?? 'active'} className="input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="frozen">Frozen</option>
            </select>
          </div>
        </div>
      </Section>

      {/* Services */}
      {services.length > 0 && (
        <Section title="Services">
          <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{CATEGORY_LABELS[cat] ?? cat}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {list.map((s) => {
                    const pay = servicePayable(s, offer, ageNum);
                    const free = pay === 0;
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="service_ids" value={s.id} checked={selected.has(s.id)} onChange={() => toggleService(s.id)} className="h-4 w-4" />
                        <span>{s.name}</span>
                        {pay !== s.price ? (
                          <span className={free ? 'font-semibold text-emerald-600' : 'text-neutral-500'}>
                            {free ? 'FREE' : formatMoney(pay)}{' '}
                            <span className="text-neutral-300 line-through">{formatMoney(s.price)}</span>
                          </span>
                        ) : (
                          <span className="text-neutral-400">{formatMoney(s.price)}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Fee Summary */}
      <div className="rounded-lg bg-neutral-50 p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">Fee Summary</span>
          {pricing.offerLabel && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{pricing.offerLabel}</span>}
        </div>
        <dl className="space-y-1">
          <Row label="Registration Fee" value={eff === 'senior' ? 'FREE' : formatMoney(pricing.registrationFee)} />
          <Row label="Package Fee" value={eff === 'senior' ? 'FREE' : formatMoney(pricing.packageFee)} />
          <Row label="Services Total" value={formatMoney(pricing.servicesTotal)} />
          <Row label="Gross Payable" value={formatMoney(pricing.gross)} bold />
          <Row label="Net Payable" value={formatMoney(pricing.gross)} brand />
        </dl>
        {pricing.offerSaving > 0 && (
          <p className="mt-1 text-xs text-emerald-600">Offer saving: {formatMoney(pricing.offerSaving)}</p>
        )}
        <p className="mt-2 text-xs text-neutral-400">Collect payment from the Payments section after saving.</p>
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes ?? ''} className="input" />
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{state.error}</p>}

      <div className="flex gap-3">
        <Submit label={submitLabel} />
        <Link href="/members" className="btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, bold, brand }: { label: string; value: string; bold?: boolean; brand?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={brand ? 'text-base font-bold text-brand' : bold ? 'font-semibold' : 'font-medium'}>{value}</dd>
    </div>
  );
}
