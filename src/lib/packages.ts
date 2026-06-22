// ===========================================================================
// SINGLE PRICING SOURCE OF TRUTH.
// Used by: /admission, Add Member, Edit Member, Couple, Convert, Payment,
// Dues, Receipt, Reports. The result is snapshotted onto the member at save
// time and read everywhere via the member_billing view.
//
//   Gross Payable = Registration Fee + Package Fee (lump sum) + Optional Services
//   Net Payable   = Gross - Discounts
//   Receivable    = Net  - Paid
//
// Package fee is the WHOLE-DURATION lump sum (3 Months = 9000, not 3500).
// Registration fee comes from the selected package (Monthly 3000, 3M 2000,
// 6M 1500, Yearly 0). "Registration"/"Monthly Fee" are NOT optional services.
//
// Offers:
//  - Senior (or age >= 67): registration = 0, package = 0, all services free
//    EXCEPT Cardio (Rs. 2000 if selected).
//  - Wife 50%: 50% off eligible optional services only (training/cardio/class);
//    registration & package are NOT discounted.
// ===========================================================================

export type OfferCode = 'none' | 'wife' | 'senior' | 'couple';

export type Plan = {
  id: string;
  name: string;
  monthly_fee?: number;
  duration_months?: number | null;
  total_price?: number | null;      // package fee (lump sum)
  registration_fee?: number | null; // registration fee for this package
  saving_amount?: number | null;
};

export type Service = {
  id: string;
  name: string;
  price: number;
  category: string; // registration | membership | training | cardio | class | other
};

// Categories that are part of the PACKAGE, never optional add-ons.
const PACKAGE_CATEGORIES = ['registration', 'membership'];
// Optional services eligible for the Wife 50% discount.
const WIFE_ELIGIBLE = ['training', 'cardio', 'class'];
const CARDIO_CATEGORY = 'cardio';
const CARDIO_SENIOR_PRICE = 2000;

export function isSenior(age?: number | null): boolean {
  return typeof age === 'number' && !isNaN(age) && age >= 67;
}

export function effectiveOffer(offer: OfferCode, age?: number | null): OfferCode {
  if (isSenior(age)) return 'senior';
  return offer === 'couple' ? 'none' : offer;
}

// Payable price for ONE optional service under the chosen offer.
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
  registrationFee: number; // offer-adjusted
  packageFee: number; // offer-adjusted (lump sum)
  servicesTotal: number; // offer-adjusted optional services
  gross: number; // registration + package + services (offer-adjusted)
  fullGross: number; // before offer (for "you save")
  offerSaving: number; // fullGross - gross
  packageSaving: number; // duration saving (informational)
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
  // Couple wife pays no registration (the husband pays it once for the couple).
  includeRegistration?: boolean;
}): PricingResult {
  const { plan, services, offer, age } = opts;
  const eff = effectiveOffer(offer, age);
  const includeRegistration = opts.includeRegistration !== false;

  // Only OPTIONAL services count here; package components are excluded.
  const optional = services.filter((s) => !PACKAGE_CATEGORIES.includes(s.category));

  const fullRegistration = includeRegistration ? Number(plan?.registration_fee ?? 0) : 0;
  const fullPackage = Number(plan?.total_price ?? 0);
  const servicesFull = optional.reduce((s, sv) => s + Number(sv.price || 0), 0);

  const registrationFee = eff === 'senior' ? 0 : fullRegistration;
  const packageFee = eff === 'senior' ? 0 : fullPackage;
  const servicesTotal = optional.reduce((s, sv) => s + servicePayable(sv, offer, age), 0);

  const gross = registrationFee + packageFee + servicesTotal;
  const fullGross = fullRegistration + fullPackage + servicesFull;

  return {
    effectiveOffer: eff,
    isSenior: isSenior(age),
    registrationFee,
    packageFee,
    servicesTotal,
    gross,
    fullGross,
    offerSaving: Math.max(fullGross - gross, 0),
    packageSaving: Number(plan?.saving_amount ?? 0),
    offerLabel: OFFER_LABELS[eff] ?? '',
  };
}

export const OFFER_OPTIONS: { value: OfferCode; label: string }[] = [
  { value: 'none', label: 'No Offer' },
  { value: 'wife', label: 'Wife 50% Offer' },
  { value: 'senior', label: 'Senior Citizen 67+ Offer' },
];
