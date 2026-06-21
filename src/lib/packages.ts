// ===========================================================================
// Membership pricing helpers (pure functions, shared by member forms, payment
// section and receipts). All amounts in Rs.
//
// Offer rules:
//  - Senior (or age >= 67): registration, package and all services FREE,
//    EXCEPT Cardio which is Rs. 2000 (only if selected).
//  - Wife 50%: 50% off eligible training services (training / cardio / class).
//    Package and registration are charged normally.
//  - Couple is NOT an offer here — it is a separate two-person admission flow
//    (husband = normal, wife = wife 50%). Kept in the type for back-compat only.
// ===========================================================================

export type OfferCode = 'none' | 'wife' | 'senior' | 'couple';

export type Plan = {
  id: string;
  name: string;
  monthly_fee: number;
  duration_months?: number | null;
  advance_amount?: number | null;
  total_price?: number | null;
  saving_amount?: number | null;
};

export type Service = {
  id: string;
  name: string;
  price: number;
  category: string; // registration | membership | training | cardio | class | other
};

const WIFE_ELIGIBLE = ['training', 'cardio', 'class'];
const REGISTRATION_CATEGORY = 'registration';
const CARDIO_CATEGORY = 'cardio';
const CARDIO_SENIOR_PRICE = 2000;

export function isSenior(age?: number | null): boolean {
  return typeof age === 'number' && !isNaN(age) && age >= 67;
}

// 67+ always becomes senior; legacy "couple" offer collapses to "none".
export function effectiveOffer(offer: OfferCode, age?: number | null): OfferCode {
  if (isSenior(age)) return 'senior';
  return offer === 'couple' ? 'none' : offer;
}

// Payable price for ONE service under the chosen offer.
export function servicePayable(service: Service, offer: OfferCode, age?: number | null): number {
  const eff = effectiveOffer(offer, age);
  if (eff === 'senior') {
    return service.category === CARDIO_CATEGORY ? CARDIO_SENIOR_PRICE : 0;
  }
  if (eff === 'wife') {
    return WIFE_ELIGIBLE.includes(service.category) ? service.price * 0.5 : service.price;
  }
  return service.price;
}

export type PricingResult = {
  effectiveOffer: OfferCode;
  isSenior: boolean;
  packageGross: number;
  packagePayable: number;
  registrationGross: number;
  registrationPayable: number;
  servicesGross: number;
  servicesPayable: number;
  gross: number;
  discount: number;
  net: number;
  monthlyFee: number; // recurring monthly fee to store on the member
  offerLabel: string;
};

const OFFER_LABELS: Record<OfferCode, string> = {
  none: '',
  wife: 'Wife 50% Offer applied',
  senior: 'Senior Citizen Offer applied (free except Cardio)',
  couple: '',
};

export function computePackage(opts: {
  plan?: Plan | null;
  services: Service[];
  offer: OfferCode;
  age?: number | null;
}): PricingResult {
  const { plan, services, offer, age } = opts;
  const eff = effectiveOffer(offer, age);

  const packageGross = plan?.monthly_fee ?? 0;
  const packagePayable = eff === 'senior' ? 0 : packageGross;

  const reg = services.filter((s) => s.category === REGISTRATION_CATEGORY);
  const other = services.filter((s) => s.category !== REGISTRATION_CATEGORY);

  const registrationGross = reg.reduce((s, sv) => s + Number(sv.price || 0), 0);
  const registrationPayable = reg.reduce((s, sv) => s + servicePayable(sv, offer, age), 0);
  const servicesGross = other.reduce((s, sv) => s + Number(sv.price || 0), 0);
  const servicesPayable = other.reduce((s, sv) => s + servicePayable(sv, offer, age), 0);

  const gross = packageGross + registrationGross + servicesGross;
  const net = packagePayable + registrationPayable + servicesPayable;
  const discount = Math.max(gross - net, 0);

  return {
    effectiveOffer: eff,
    isSenior: isSenior(age),
    packageGross,
    packagePayable,
    registrationGross,
    registrationPayable,
    servicesGross,
    servicesPayable,
    gross,
    discount,
    net,
    monthlyFee: packagePayable,
    offerLabel: OFFER_LABELS[eff] ?? '',
  };
}

// Offer dropdown — Couple intentionally excluded (it is an admission type).
export const OFFER_OPTIONS: { value: OfferCode; label: string }[] = [
  { value: 'none', label: 'No Offer' },
  { value: 'wife', label: 'Wife 50% Offer' },
  { value: 'senior', label: 'Senior Citizen 67+ Offer' },
];
