-- ============================================================================
-- GainShred AMS — PHASE 4c: fix admission_requests RLS
-- ----------------------------------------------------------------------------
-- The public /admission form failed with "new row violates row-level security
-- policy" because the anonymous INSERT policy was missing (the Phase 4 policy
-- section did not fully apply). This tiny, idempotent migration restores it.
--
-- Security model (unchanged intent):
--   * Public (anon) + staff may INSERT a request.
--   * Only ADMINS may read / update / approve / reject / convert.
-- ============================================================================

alter table public.admission_requests enable row level security;

-- Anyone (public, not logged in) may submit a request.
drop policy if exists admission_public_insert on public.admission_requests;
create policy admission_public_insert on public.admission_requests
  for insert to anon with check (true);

-- Logged-in staff/admin may also submit.
drop policy if exists admission_auth_insert on public.admission_requests;
create policy admission_auth_insert on public.admission_requests
  for insert to authenticated with check (true);

-- Only admins can read / update / delete (approve, reject, convert).
drop policy if exists admission_admin_all on public.admission_requests;
create policy admission_admin_all on public.admission_requests
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- After running this, the public form will submit successfully.
-- ============================================================================
