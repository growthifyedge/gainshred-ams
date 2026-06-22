import { computePackage, type OfferCode } from '@/lib/packages';

// Compute the member's billing snapshot using the SAME engine the forms use,
// so the stored value always matches what the admin saw on screen.
// Returns the columns to write onto the member row.
export async function memberBillSnapshot(
  supabase: any,
  opts: {
    planId?: string | null;
    serviceIds: string[];
    offer?: string | null;
    age?: number | null;
    includeRegistration?: boolean; // couple wife = false (no registration)
  }
) {
  let plan: any = null;
  if (opts.planId) {
    const { data } = await supabase
      .from('membership_plans')
      .select('id, name, monthly_fee, total_price, registration_fee, saving_amount')
      .eq('id', opts.planId)
      .single();
    plan = data;
  }

  let services: any[] = [];
  if (opts.serviceIds.length) {
    const { data } = await supabase
      .from('services')
      .select('id, name, price, category')
      .in('id', opts.serviceIds);
    services = data ?? [];
  }

  const r = computePackage({
    plan,
    services,
    offer: (opts.offer as OfferCode) ?? 'none',
    age: opts.age ?? null,
    includeRegistration: opts.includeRegistration,
  });

  return {
    registration_fee: r.registrationFee,
    package_fee: r.packageFee,
    services_total: r.servicesTotal,
    gross_payable: r.gross,
    monthly_fee: r.packageFee, // keep legacy monthly_fee aligned with the package lump sum
  };
}
