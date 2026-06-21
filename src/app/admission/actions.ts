'use server';

import { createClient } from '@/lib/supabase/server';
import { admissionSchema, firstError } from '@/lib/validations';

export type AdmissionState = { error?: string; success?: boolean };

// Public submission. The anon RLS policy allows INSERT into admission_requests,
// so we insert directly (no RPC needed). Public users still cannot READ the table.
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
  const { error } = await supabase.from('admission_requests').insert({
    full_name: input.full_name,
    phone: input.phone || null,
    email: input.email || null,
    age: input.age ?? null,
    gender: input.gender || null,
    address: input.address || null,
    emergency_contact: input.emergency_contact || null,
    selected_membership_plan_id: input.plan_id || null,
    selected_services: serviceIds,
    offer_code: input.offer_code,
    preferred_joining_date: input.preferred_joining_date || null,
    notes: input.notes || null,
    photo_reference: input.photo_reference || null,
  });

  if (error) return { error: error.message };
  return { success: true };
}
