-- ============================================================================
-- GainShred AMS — PHASE 2b: add "Adjustment" payment type
-- ----------------------------------------------------------------------------
-- Run AFTER upgrade_phase2.sql. Idempotent and additive.
-- Adds 'adjustment' as an allowed payment method/type so staff/admin can
-- record manual corrections. Existing methods are unchanged.
-- ============================================================================

alter table public.payments drop constraint if exists payments_payment_method_check;

alter table public.payments
  add constraint payments_payment_method_check
  check (payment_method in ('cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'card', 'adjustment'));
