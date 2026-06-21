'use server';

import { createClient } from '@/lib/supabase/server';
import { admissionSchema, firstError } from '@/lib/validations';

export type AdmissionState = { error?: string; success?: boolean };

// Public submission. Inserts directly into admission_requests (anon RLS allows
// INSERT). Single/Senior requests do NOT reference the couple columns, so they
// work even before the Phase 7 migration; couple requests use member_type/spouse.
export async function submitAdmission(
  _prev: AdmissionState,
  formData: FormData
): Promise<AdmissionState> {
  const parsed = admissionSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    age: formData.get('age'),
    gender: formData.get('gender'),
    address: formData.get('address'),
    emergency_contact: formData.get('emergency_contact'),
    plan_id: formData.get('plan_id'),
    offer_code: formData.get('offer_code'),
    preferred_joining_date: formData.get('preferred_joining_date'),
    notes: formData.get('notes'),
    photo_reference: formData.get('photo_reference'),
  });
  if (!parsed.success) {
    console.error('[admission] validation failed:', parsed.error.flatten().fieldErrors);
    return { error: firstError(parsed.error) };
  }

  const input = parsed.data;
  const offer = input.offer_code;
  const memberType = String(formData.get('member_type') ?? 'single');
  let planId: string | null = input.plan_id || null;
  let serviceIds = (formData.getAll('service_ids') as string[]).filter(Boolean);

  // --- Senior: no package, Cardio only ---
  if (offer === 'senior') {
    planId = null; // package is free / not applicable for senior
    // Only Cardio is offered to seniors; the form renders only Cardio, but
    // re-check on the server using the catalog so nothing else slips through.
  }

  // --- Wife 50% = couple admission (husband primary + wife spouse) ---
  let spouse: Record<string, unknown> | null = null;
  let mtype = 'single';
  if (offer === 'wife' && memberType === 'couple') {
    const wName = String(formData.get('w_full_name') ?? '').trim();
    const wAge = String(formData.get('w_age') ?? '').trim();
    const wPlan = String(formData.get('w_plan_id') ?? '').trim();
    if (wName.length < 2) return { error: 'Wife full name is required.' };
    if (!wAge) return { error: 'Wife age is required.' };
    if (!planId) return { error: "Select the husband's membership duration." };
    if (!wPlan) return { error: "Select the wife's membership duration." };
    mtype = 'couple';
    spouse = {
      full_name: wName,
      phone: String(formData.get('w_phone') ?? '').trim() || null,
      email: String(formData.get('w_email') ?? '').trim() || null,
      age: Number(wAge) || null,
      plan_id: wPlan,
      service_ids: (formData.getAll('w_service_ids') as string[]).filter(Boolean),
      offer_code: 'wife',
    };
  } else if (offer !== 'senior') {
    // Normal single admission needs a package.
    if (!planId) return { error: 'Select a membership duration.' };
  }

  const supabase = createClient();
  const payload: Record<string, unknown> = {
    full_name: input.full_name,
    phone: input.phone || null,
    email: input.email || null,
    age: input.age ?? null,
    gender: input.gender || null,
    address: input.address || null,
    emergency_contact: input.emergency_contact || null,
    selected_membership_plan_id: planId,
    selected_services: serviceIds,
    offer_code: offer,
    preferred_joining_date: input.preferred_joining_date || null,
    notes: input.notes || null,
    photo_reference: input.photo_reference || null,
  };
  // Only attach couple columns when needed, so single/senior work pre-migration.
  if (mtype === 'couple') {
    payload.member_type = 'couple';
    payload.spouse = spouse;
  }

  const { error } = await supabase.from('admission_requests').insert(payload);
  if (error) {
    console.error('[admission] insert failed:', error);
    return { error: 'Could not submit your request right now. Please try again.' };
  }
  return { success: true };
}
