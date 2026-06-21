'use server';

import { createClient } from '@/lib/supabase/server';
import { admissionSchema, firstError } from '@/lib/validations';

export type AdmissionState = { error?: string; success?: boolean };

// Public submission — runs as anon; the DB function is SECURITY DEFINER so the
// row is inserted without the public user being able to READ the table.
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
  if (!parsed.success) return { error: firstError(parsed.error) };

  const input = parsed.data;
  const serviceIds = (formData.getAll('service_ids') as string[]).filter(Boolean);

  const supabase = createClient();
  const { error } = await supabase.rpc('submit_admission_request', {
    p_full_name: input.full_name,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_age: input.age ?? null,
    p_gender: input.gender || null,
    p_address: input.address || null,
    p_emergency: input.emergency_contact || null,
    p_plan: input.plan_id || null,
    p_services: serviceIds,
    p_offer: input.offer_code,
    p_joining: input.preferred_joining_date || null,
    p_notes: input.notes || null,
    p_photo_reference: input.photo_reference || null,
  });

  if (error) return { error: error.message };
  return { success: true };
}
