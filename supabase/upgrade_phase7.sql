-- ============================================================================
-- GainShred AMS — PHASE 7: couple payload for the public admission form
-- ----------------------------------------------------------------------------
-- Run AFTER upgrade_phase5.sql. Idempotent & additive. Affects ONLY the
-- admission_requests table — no members, payments, dues, or dashboard logic.
--
-- Adds two optional columns so the public admission form can submit a
-- "Wife 50% / Couple" request (husband as the primary row, wife in `spouse`).
-- Existing single requests are unaffected (member_type defaults to 'single').
-- ============================================================================

alter table public.admission_requests
  add column if not exists member_type text not null default 'single'
  check (member_type in ('single', 'couple'));

alter table public.admission_requests
  add column if not exists spouse jsonb; -- wife details for couple requests

-- ============================================================================
-- DONE.
-- ============================================================================
