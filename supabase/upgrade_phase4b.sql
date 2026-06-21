-- ============================================================================
-- GainShred AMS — PHASE 4b: offer cleanup + couple admission linking
-- ----------------------------------------------------------------------------
-- Run AFTER upgrade_phase4.sql. Idempotent & additive. No data deleted.
--   - Deactivates the "Couple" offer (it's an admission type, not a discount).
--   - Adds offer metadata columns.
--   - Adds members.couple_group_id to link husband + wife.
-- ============================================================================

-- Link two members admitted together (husband + wife).
alter table public.members add column if not exists couple_group_id uuid;
create index if not exists members_couple_group_idx on public.members(couple_group_id);

-- Offer metadata.
alter table public.offers add column if not exists applies_to     text;
alter table public.offers add column if not exists offer_category text;

-- Keep wife/senior active with metadata; deactivate couple (don't delete it).
update public.offers set is_active = false where code = 'couple';
update public.offers set is_active = true, applies_to = 'wife_services',     offer_category = 'discount' where code = 'wife';
update public.offers set is_active = true, applies_to = 'all_except_cardio', offer_category = 'free'     where code = 'senior';

-- ============================================================================
-- DONE.
-- ============================================================================
