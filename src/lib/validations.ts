import { z } from 'zod';

// Null-safe optional string. IMPORTANT: a form field that is absent comes through
// as `null` (FormData.get returns null). The previous `.optional().or(z.literal(''))`
// was a UNION that rejected `null` and produced Zod's generic "Invalid input" error.
// This version coerces null/undefined/anything → trimmed string, so it never fails.
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : ''),
  z.string()
);

// Optional but, if provided, must be a valid email.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const optionalEmail = z
  .preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string())
  .refine((v) => v === '' || EMAIL_RE.test(v), 'Enter a valid email');

export const memberSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required'),
  phone: optionalString,
  email: optionalEmail,
  joining_date: z.string().min(1, 'Joining date is required'),
  plan_id: z.string().uuid().optional().or(z.literal('')),
  monthly_fee: z.coerce.number().min(0, 'Fee cannot be negative'),
  due_day: z.coerce
    .number()
    .int()
    .min(1, 'Due day must be 1–28')
    .max(28, 'Due day must be 1–28'),
  status: z.enum(['active', 'inactive', 'frozen']),
  age: z
    .preprocess(
      (v) => (v === '' || v == null ? null : v),
      z.coerce.number().int().min(0).max(120).nullable()
    )
    .optional(),
  offer_code: z.enum(['none', 'couple', 'wife', 'senior']).default('none'),
  notes: optionalString,
});
export type MemberInput = z.infer<typeof memberSchema>;

export const paymentSchema = z.object({
  member_id: z.string().uuid('Select a member'),
  payment_month: z.string().min(1, 'Select the payment month'),
  amount: z.coerce.number().min(0, 'Amount cannot be negative').default(0),
  penalty_amount: z.coerce.number().min(0, 'Penalty cannot be negative').default(0),
  advance_added: z.coerce.number().min(0, 'Advance cannot be negative').default(0),
  advance_applied: z.coerce.number().min(0, 'Advance cannot be negative').default(0),
  payment_method: z.enum(['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'card', 'adjustment']),
  payment_date: z.string().min(1, 'Select the payment date'),
  discount_type: z.enum(['none', 'percent', 'fixed']).default('none'),
  discount_value: z.coerce.number().min(0, 'Discount cannot be negative').default(0),
  notes: optionalString,
  receipt_image_url: z.string().url().optional().or(z.literal('')),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const admissionSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required'),
  phone: z.string().trim().min(7, 'Contact number is required'),
  email: optionalEmail, // optional
  age: z.preprocess(
    (v) => (v === '' || v == null ? NaN : v),
    z.coerce
      .number()
      .int('Enter a valid age')
      .min(1, 'Age is required')
      .max(120, 'Enter a valid age')
  ),
  gender: z.string().trim().min(1, 'Select a gender'),
  address: optionalString, // optional
  emergency_contact: optionalString, // optional
  plan_id: z.string().uuid('Select a membership duration'),
  offer_code: z.enum(['none', 'couple', 'wife', 'senior']).default('none'),
  preferred_joining_date: z.string().trim().min(1, 'Select a joining date'),
  notes: optionalString, // optional
  photo_reference: optionalString, // optional, not on the public form
});
export type AdmissionInput = z.infer<typeof admissionSchema>;

export const settingsSchema = z.object({
  gym_name: z.string().trim().min(1, 'Gym name is required'),
  gym_phone: optionalString,
  gym_address: optionalString,
  currency: z.string().trim().min(1, 'Currency is required'),
  penalty_type: z.enum(['none', 'fixed', 'daily']),
  penalty_fixed: z.coerce.number().min(0),
  penalty_daily: z.coerce.number().min(0),
  penalty_grace_days: z.coerce.number().int().min(0),
  penalty_max: z.coerce.number().min(0),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const planSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required'),
  monthly_fee: z.coerce.number().min(0),
  description: optionalString,
});
export type PlanInput = z.infer<typeof planSchema>;

// Turn a ZodError into a single readable message for the form banner.
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Please check the form and try again.';
}
