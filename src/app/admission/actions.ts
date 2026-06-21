'use server';

import { createClient } from '@/lib/supabase/server';
import { admissionSchema, firstError } from '@/lib/validations';

export type AdmissionState = { error?: string; success?: boolean };

// Public submission. Single/Senior requests do NOT reference the couple columns,
// so they work even before the Phase 7 migration; couple requests use
// member_type + spouse. Couple is an ADMISSION TYPE, never an offer_code.
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
  const memberType = String(formData.get('member_type') ?? 'single') === 'couple' ? 'couple' : 'single';
  // Couple husband is always full price → offer_code 'none'.
  const offer = memberType === 'couple' ? 'none' : input.offer_code;
  const isSenior =
    memberType === 'single' && (offer === 'senior' || (input.age != null && input.age >= 67));

  let planId: string | null = input.plan_id || null;
  let serviceIds = (formData.getAll('service_ids') as string[]).filter(Boolean);

  const supabase = createClient();
  let spouse: Record<string, unknown> | null = null;

  if (memberType === 'couple') {
    const wName = String(formData.get('w_full_name') ?? '').trim();
    const wAge = String(formData.get('w_age') ?? '').trim();
    const wPlan = String(formData.get('w_plan_id') ?? '').trim();
    if (wName.length < 2) return { error: 'Wife full name is required.' };
    if (!wAge) return { error: 'Wife age is required.' };
    if (!planId) return { error: "Select the husband's membership duration." };
    if (!wPlan) return { error: "Select the wife's membership duration." };
    spouse = {
      full_name: wName,
      phone: String(formData.get('w_phone') ?? '').trim() || null,
      email: String(formData.get('w_email') ?? '').trim() || null,
      age: Number(wAge) || null,
      plan_id: wPlan,
      service_ids: (formData.getAll('w_service_ids') as string[]).filter(Boolean),
      offer_code: 'wife',
    };
  } else if (isSenior) {
    // Senior: registration + package free, ONLY Cardio may be submitted.
    planId = null;
    if (serviceIds.length) {
      const { data: cats } = await supabase.from('services').select('id, category').in('id', serviceIds);
      serviceIds = (cats ?? []).filter((c: any) => c.category === 'cardio').map((c: any) => c.id);
    }
  } else {
    if (!planId) return { error: 'Select a membership duration.' };
  }

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
  if (memberType === 'couple') {
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
