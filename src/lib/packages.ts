// ===========================================================================
// Membership pricing helpers (pure functions, shared by the member form,
// server actions and receipts). All amounts in Rs.
// ===========================================================================

export type OfferCode = 'none' | 'couple' | 'wife' | 'senior';

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

export type Offer = { code: string; name: string; note?: string | null };

// Categories treated as "training services" for the Wife 50% offer.
const TRAINING_CATEGORIES = ['training', 'cardio', 'class'];

// Senior (free) services apply to everything EXCEPT cardio.
const SENIOR_PAID_CATEGORY = 'cardio';
const CARDIO_FLAT_PRICE = 2000;

export function isSenior(age?: number | null): boolean {
  return typeof age === 'number' && !isNaN(age) && age >= 67;
}

// Effective offer: a 67+ member always gets the senior offer.
export function effectiveOffer(offerCode: OfferCode, age?: number | null): OfferCode {
  return isSenior(age) ? 'senior' : offerCode;
}

// Price payable for ONE service under the chosen offer.
export function servicePayable(service: Service, offer: OfferCode, age?: number | null): number {
  const eff = effectiveOffer(offer, age);
  if (eff === 'senior') {
    return service.category === SENIOR_PAID_CATEGORY ? CARDIO_FLAT_PRICE : 0;
  }
  if (eff === 'couple') {
    return service.category === SENIOR_PAID_CATEGORY ? CARDIO_FLAT_PRICE : service.price;
  }
  if (eff === 'wife') {
    return TRAINING_CATEGORIES.includes(service.category) ? service.price * 0.5 : service.price;
  }
  return service.price;
}

export type PricingResult = {
  effectiveOffer: OfferCode;
  isSenior: boolean;
  monthlyFee: number;
  advance: number;
  servicesSubtotal: number;
  servicesPayable: number;
  servicesDiscount: number;
  packageSaving: number;
  totalPayable: number;
  offerLabel: string;
};

const OFFER_LABELS: Record<OfferCode, string> = {
  none: '',
  couple: 'Couple Offer applied',
  wife: 'Wife Offer applied (50% off training)',
  senior: 'Senior Citizen Offer applied (free except cardio)',
};

export function computePackage(opts: {
  plan?: Plan | null;
  services: Service[];
  offer: OfferCode;
  age?: number | null;
}): PricingResult {
  const { plan, services, offer, age } = opts;
  const eff = effectiveOffer(offer, age);

  const baseMonthly = plan?.monthly_fee ?? 0;
  const baseAdvance = plan?.advance_amount ?? 0;

  const monthlyFee = eff === 'couple' ? 2500 : eff === 'senior' ? 0 : baseMonthly;
  const advance = eff === 'couple' ? 1000 : eff === 'senior' ? 0 : baseAdvance;

  const servicesSubtotal = services.reduce((s, sv) => s + Number(sv.price || 0), 0);
  const servicesPayable = services.reduce((s, sv) => s + servicePayable(sv, offer, age), 0);
  const servicesDiscount = servicesSubtotal - servicesPayable;
  const packageSaving = plan?.saving_amount ?? 0;

  const totalPayable = monthlyFee + servicesPayable;

  return {
    effectiveOffer: eff,
    isSenior: isSenior(age),
    monthlyFee,
    advance,
    servicesSubtotal,
    servicesPayable,
    servicesDiscount,
    packageSaving,
    totalPayable,
    offerLabel: OFFER_LABELS[eff] ?? '',
  };
}

export const OFFER_OPTIONS: { value: OfferCode; label: string }[] = [
  { value: 'none', label: 'No offer' },
  { value: 'couple', label: 'Couple Offer' },
  { value: 'wife', label: 'Wife Offer (50% off training)' },
  { value: 'senior', label: 'Senior Citizen 67+ (free except cardio)' },
];
