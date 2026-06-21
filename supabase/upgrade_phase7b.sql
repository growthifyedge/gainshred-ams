-- ============================================================================
-- GainShred AMS — PHASE 7b: link the converted wife member to the request
-- ----------------------------------------------------------------------------
-- Run AFTER upgrade_phase7.sql. Idempotent & additive. Affects ONLY the
-- admission_requests table — no members/payments/dues/dashboard logic.
-- ============================================================================

alter table public.admission_requests
  add column if not exists converted_spouse_member_id uuid
  references public.members(id) on delete set null;

-- ============================================================================
-- DONE.
-- ============================================================================
