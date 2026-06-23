'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { OFFER_OPTIONS, computePackage, servicePayable, type OfferCode, type Plan, type Service } from '@/lib/packages';
import { formatMoney } from '@/lib/utils';
import { submitAdmission, type AdmissionState } from '@/app/admission/actions';

type AdmissionType = 'single' | 'couple';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? 'Submitting…' : 'Submit Admission Request'}
    </button>
  );
}

export default function AdmissionForm({ plans, services }: { plans: Plan[]; services: Service[] }) {
  const [state, formAction] = useFormState<AdmissionState, FormData>(submitAdmission, {});

  const [type, setType] = useState<AdmissionType>('single'); // default Single
  const [offer, setOffer] = useState<OfferCode>('none'); // single only
  const [age, setAge] = useState('');
  const [planId, setPlanId] = useState('');
  const [svc, setSvc] = useState<Set<string>>(new Set());
  // wife (couple)
  const [wAge, setWAge] = useState('');
  const [wPlanId, setWPlanId] = useState('');
  const [wSvc, setWSvc] = useState<Set<string>>(new Set());

  const isCouple = type === 'couple';
  const ageNum = age === '' ? null : Number(age);
  // Senior applies only to SINGLE admissions (couple husband is always full price).
  const isSenior = !isCouple && (offer === 'senior' || (ageNum != null && ageNum >= 67));
  const cardioServices = useMemo(() => services.filter((s) => s.category === 'cardio'), [services]);

  // Pricing — reuses the software's computePackage. Husband/single uses null age
  // in couple mode so 67+ husbands stay full price; single uses real age.
  const primary = useMemo(
    () =>
      computePackage({
        plan: plans.find((p) => p.id === planId) ?? null,
        services: services.filter((s) => svc.has(s.id)),
        offer: isCouple ? 'none' : offer,
        age: isCouple ? null : ageNum,
      }),
    [plans, services, planId, svc, isCouple, offer, ageNum]
  );
  const wife = useMemo(
    () =>
      computePackage({
        plan: plans.find((p) => p.id === wPlanId) ?? null,
        services: services.filter((s) => wSvc.has(s.id)),
        offer: 'wife',
        age: null,
      }),
    [plans, services, wPlanId, wSvc]
  );
  const coupleTotal = primary.gross + wife.gross;

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setSet(next);
  }

  if (state.success) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl">✓</div>
        <h2 className="text-xl font-bold">Admission request submitted successfully.</h2>
        <p className="mt-2 text-sm text-neutral-500">Our team will review and contact you.</p>
        <a href="/admission" className="btn-ghost mt-5 inline-block">Submit another request</a>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <input type="hidden" name="member_type" value={type} />
      {isCouple && <input type="hidden" name="offer_code" value="none" />}

      {/* Admission Type selector (always visible) */}
      <div>
        <p className="label">Admission Type</p>
        <div className="grid grid-cols-2 gap-3">
          {(['single', 'couple'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg border p-3 text-center text-sm font-semibold transition ${
                type === t ? 'border-brand bg-brand/5 text-brand' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {t === 'single' ? 'Single Admission' : 'Couple Admission (Husband + Wife)'}
            </button>
          ))}
        </div>
      </div>

      {/* Primary / Husband details */}
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {isCouple ? 'Husband Details' : 'Member Details'}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="full_name">{isCouple ? 'Husband full name *' : 'Full name *'}</label>
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
            <input id="age" name="age" type="number" min={1} max={120} required value={age} onChange={(e) => setAge(e.target.value)} className="input" />
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
          {/* Offer only applies to Single admissions */}
          {!isCouple && (
            <div>
              <label className="label" htmlFor="offer_code">Offer</label>
              <select id="offer_code" name="offer_code" value={offer} onChange={(e) => setOffer(e.target.value as OfferCode)} className="input">
                {OFFER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* SINGLE + SENIOR: only Cardio */}
      {!isCouple && isSenior && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="mb-1 text-sm font-semibold text-emerald-700">Senior Citizen 67+ Offer applied</p>
          <p className="mb-3 text-xs text-neutral-500">Registration FREE · Package FREE. Only Cardio is available (Rs. 2000 if selected).</p>
          {cardioServices.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="service_ids" value={s.id} checked={svc.has(s.id)} onChange={() => toggle(svc, setSvc, s.id)} className="h-4 w-4" />
              <span>{s.name}</span>
              <span className="font-semibold text-neutral-700">{formatMoney(2000)}</span>
            </label>
          ))}
          <Summary rows={[['Registration Fee', 'FREE'], ['Package Fee', 'FREE'], ['Cardio', formatMoney(primary.servicesTotal)]]} total={primary.gross} />
        </div>
      )}

      {/* SINGLE, not senior: plan + services (wife offer halves eligible services) */}
      {!isCouple && !isSenior && (
        <PackageBlock plans={plans} services={services} planId={planId} setPlanId={setPlanId} svc={svc} onToggle={(id) => toggle(svc, setSvc, id)} offer={offer} age={ageNum} planName="plan_id" svcName="service_ids" pricing={primary} />
      )}

      {/* COUPLE: husband + wife */}
      {isCouple && (
        <div className="space-y-5">
          <PackageBlock title="Husband Package & Services (full price)" plans={plans} services={services} planId={planId} setPlanId={setPlanId} svc={svc} onToggle={(id) => toggle(svc, setSvc, id)} offer="none" age={null} planName="plan_id" svcName="service_ids" pricing={primary} />

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Wife Details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="w_full_name">Wife full name *</label>
                <input id="w_full_name" name="w_full_name" required={isCouple} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="w_phone">Wife contact number</label>
                <input id="w_phone" name="w_phone" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="w_email">Wife email</label>
                <input id="w_email" name="w_email" type="email" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="w_age">Wife age *</label>
                <input id="w_age" name="w_age" type="number" min={1} max={120} required={isCouple} value={wAge} onChange={(e) => setWAge(e.target.value)} className="input" />
              </div>
            </div>
          </div>

          <PackageBlock title="Wife Package & Services" badge="Wife 50% Offer" plans={plans} services={services} planId={wPlanId} setPlanId={setWPlanId} svc={wSvc} onToggle={(id) => toggle(wSvc, setWSvc, id)} offer="wife" age={null} planName="w_plan_id" svcName="w_service_ids" pricing={wife} />

          <div className="rounded-lg bg-brand-black p-4 text-sm text-white">
            <div className="flex justify-between"><span>Husband total</span><span>{formatMoney(primary.gross)}</span></div>
            <div className="flex justify-between"><span>Wife total (after 50%)</span><span>{formatMoney(wife.gross)}</span></div>
            <div className="mt-2 flex justify-between border-t border-neutral-700 pt-2 text-base font-bold">
              <span>Total receivable</span><span className="text-brand">{formatMoney(coupleTotal)}</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={2} className="input" />
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{state.error}</p>}

      <Submit />
      <p className="text-center text-xs text-neutral-400">No photo upload required. Our team may add details manually after review.</p>
    </form>
  );
}

function PackageBlock({
  title, badge, plans, services, planId, setPlanId, svc, onToggle, offer, age, planName, svcName, pricing,
}: {
  title?: string; badge?: string; plans: Plan[]; services: Service[]; planId: string;
  setPlanId: (v: string) => void; svc: Set<string>; onToggle: (id: string) => void;
  offer: OfferCode; age: number | null; planName: string; svcName: string;
  pricing: ReturnType<typeof computePackage>;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      {title && (
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
          {badge && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{badge}</span>}
        </div>
      )}
      <div className="mb-3">
        <label className="label">Membership duration *</label>
        <select name={planName} required value={planId} onChange={(e) => setPlanId(e.target.value)} className="input">
          <option value="">— Select —</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.total_price ? ` — ${formatMoney(p.total_price)}` : ''}
            </option>
          ))}
        </select>
      </div>
      <p className="label">Services</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {services.map((s) => {
          const pay = servicePayable(s, offer, age);
          return (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={svcName} value={s.id} checked={svc.has(s.id)} onChange={() => onToggle(s.id)} className="h-4 w-4" />
              <span>{s.name}</span>
              {pay !== s.price ? (
                <span className="text-neutral-500">{formatMoney(pay)} <span className="text-neutral-300 line-through">{formatMoney(s.price)}</span></span>
              ) : (
                <span className="text-neutral-400">{formatMoney(s.price)}</span>
              )}
            </label>
          );
        })}
      </div>
      <Summary
        rows={[
          [
            (plans.find((p) => p.id === planId)?.duration_months ?? null) === 1 ? 'Monthly Fee' : 'Package Fee',
            formatMoney(pricing.packageFee),
          ],
          ['Registration Fee', formatMoney(pricing.registrationFee)],
          ['Services Total', formatMoney(pricing.servicesTotal)],
        ]}
        total={pricing.gross}
      />
    </div>
  );
}

function Summary({ rows, total }: { rows: [string, string][]; total: number }) {
  return (
    <div className="mt-3 border-t border-neutral-200 pt-2 text-sm">
      <dl className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-semibold">
        <span>Net Payable</span>
        <span className="text-brand">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
