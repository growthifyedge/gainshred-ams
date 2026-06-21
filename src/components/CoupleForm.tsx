'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { formatMoney } from '@/lib/utils';
import {
  computePackage,
  servicePayable,
  type OfferCode,
  type Plan,
  type Service,
  type PricingResult,
} from '@/lib/packages';
import type { FormState } from '@/app/(app)/members/actions';

type PersonState = { planId: string; age: string; services: Set<string> };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : 'Create Couple (2 members)'}
    </button>
  );
}

export default function CoupleForm({
  action,
  plans,
  services,
  defaultJoining,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  plans: Plan[];
  services: Service[];
  defaultJoining: string;
}) {
  const [state, formAction] = useFormState<FormState, FormData>(action, {});
  const [husband, setHusband] = useState<PersonState>({ planId: '', age: '', services: new Set() });
  const [wife, setWife] = useState<PersonState>({ planId: '', age: '', services: new Set() });

  const hPricing = useMemo(
    () =>
      computePackage({
        plan: plans.find((p) => p.id === husband.planId) ?? null,
        services: services.filter((s) => husband.services.has(s.id)),
        offer: 'none',
        age: husband.age === '' ? null : Number(husband.age),
      }),
    [plans, services, husband]
  );
  const wPricing = useMemo(
    () =>
      computePackage({
        plan: plans.find((p) => p.id === wife.planId) ?? null,
        services: services.filter((s) => wife.services.has(s.id)),
        offer: 'wife',
        age: wife.age === '' ? null : Number(wife.age),
      }),
    [plans, services, wife]
  );

  const totalGross = hPricing.gross + wPricing.gross;
  const totalDiscount = hPricing.discount + wPricing.discount;
  const totalNet = hPricing.net + wPricing.net;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="joining_date" value={defaultJoining} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PersonCard
          title="Husband Details"
          prefix="h"
          offer="none"
          person={husband}
          setPerson={setHusband}
          plans={plans}
          services={services}
          pricing={hPricing}
        />
        <PersonCard
          title="Wife Details"
          prefix="w"
          offer="wife"
          badge="Wife 50% Offer"
          person={wife}
          setPerson={setWife}
          plans={plans}
          services={services}
          pricing={wPricing}
        />
      </div>

      {/* Combined summary */}
      <div className="card p-5">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Combined Summary
        </h3>
        <dl className="space-y-1 text-sm">
          <Row label="Total Gross" value={formatMoney(totalGross)} />
          <Row label="Total Discount" value={`− ${formatMoney(totalDiscount)}`} />
          <Row label="Total Net Payable" value={formatMoney(totalNet)} brand />
        </dl>
        <p className="mt-2 text-xs text-neutral-400">
          Two members with two registration numbers will be created and linked. Collect payment from
          the Payments section afterwards.
        </p>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{state.error}</p>
      )}

      <div className="flex gap-3">
        <Submit />
        <Link href="/members" className="btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}

function PersonCard({
  title,
  prefix,
  offer,
  badge,
  person,
  setPerson,
  plans,
  services,
  pricing,
}: {
  title: string;
  prefix: 'h' | 'w';
  offer: OfferCode;
  badge?: string;
  person: PersonState;
  setPerson: (p: PersonState) => void;
  plans: Plan[];
  services: Service[];
  pricing: PricingResult;
}) {
  const ageNum = person.age === '' ? null : Number(person.age);

  function toggle(id: string) {
    const next = new Set(person.services);
    next.has(id) ? next.delete(id) : next.add(id);
    setPerson({ ...person, services: next });
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        {badge && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {badge}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="label">Full name *</label>
          <input name={`${prefix}_full_name`} required className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Phone</label>
            <input name={`${prefix}_phone`} className="input" />
          </div>
          <div>
            <label className="label">Age</label>
            <input
              name={`${prefix}_age`}
              type="number"
              min={0}
              max={120}
              value={person.age}
              onChange={(e) => setPerson({ ...person, age: e.target.value })}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label">Email</label>
          <input name={`${prefix}_email`} type="email" className="input" />
        </div>
        <div>
          <label className="label">Package</label>
          <select
            name={`${prefix}_plan_id`}
            value={person.planId}
            onChange={(e) => setPerson({ ...person, planId: e.target.value })}
            className="input"
          >
            <option value="">— None —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.total_price ? ` — ${formatMoney(p.total_price)}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Services</label>
          <div className="grid grid-cols-1 gap-1 rounded-lg border border-neutral-200 p-3 text-sm">
            {services.map((s) => {
              const pay = servicePayable(s, offer, ageNum);
              return (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name={`${prefix}_service_ids`}
                    value={s.id}
                    checked={person.services.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="h-4 w-4"
                  />
                  <span>{s.name}</span>
                  {pay !== s.price ? (
                    <span className={pay === 0 ? 'font-semibold text-emerald-600' : 'text-neutral-500'}>
                      {pay === 0 ? 'FREE' : formatMoney(pay)}
                    </span>
                  ) : (
                    <span className="text-neutral-400">{formatMoney(s.price)}</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-person summary */}
      <dl className="mt-4 space-y-1 border-t border-neutral-200 pt-3 text-sm">
        <Row label="Package Fee" value={pricing.effectiveOffer === 'senior' ? 'FREE' : formatMoney(pricing.packageGross)} />
        <Row label="Services" value={formatMoney(pricing.servicesGross + pricing.registrationGross)} />
        <Row label="Discount" value={`− ${formatMoney(pricing.discount)}`} />
        <Row label="Net Payable" value={formatMoney(pricing.net)} brand />
      </dl>
    </div>
  );
}

function Row({ label, value, brand }: { label: string; value: string; brand?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={brand ? 'text-base font-bold text-brand' : 'font-medium'}>{value}</dd>
    </div>
  );
}
