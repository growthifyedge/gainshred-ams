-- ===========================================================================
-- GainShred AMS — Phase 8 (Member Renewal Cycle) — STEP A: schema foundation
-- ===========================================================================
-- Adds ONE nullable column to track each member's next renewal/due date.
-- This becomes the staff-facing "Next Due Date". Later phases will:
--   * Phase B — set it on enrollment   (joining_date + plan.duration_months)
--   * Phase C — advance it on payment   (forward by the package duration)
--   * Phase D — display it + derived status (Active / Due / Expired)
--
-- SAFE & IDEMPOTENT — this file only ADDS a column:
--   * No existing column, constraint, view, trigger, or data is changed.
--   * NO BACKFILL on purpose: existing members stay NULL, so lapsed/unpaid
--     members are NOT made to look active. Their next_due_date will be filled
--     the next time they are saved or renewed (Phase B/C).
--   * Does NOT touch the monthly dues ledger.
--   * Does NOT change the members.status CHECK constraint.
-- Re-running this file is harmless (IF NOT EXISTS).
-- ===========================================================================

alter table public.members
  add column if not exists next_due_date date;
