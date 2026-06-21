-- ============================================================================
-- GainShred Account Management System — Supabase schema (Version 1)
-- ----------------------------------------------------------------------------
-- HOW TO RUN:
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   It is idempotent (safe to re-run).
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. PROFILES  (app users; one row per auth.users row, holds the role)
-- ============================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  email      text,
  role       text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. MEMBERSHIP PLANS
-- ============================================================================
create table if not exists public.membership_plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  monthly_fee numeric(12,2) not null default 0 check (monthly_fee >= 0),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 3. MEMBERS
-- ============================================================================
create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text,
  email        text,
  joining_date date not null default current_date,
  plan_id      uuid references public.membership_plans(id) on delete set null,
  monthly_fee  numeric(12,2) not null default 0 check (monthly_fee >= 0),
  due_day      int not null default 5 check (due_day between 1 and 28), -- day of month the fee is due
  status       text not null default 'active' check (status in ('active', 'inactive', 'frozen')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================================
-- 4. SETTINGS  (single row, id = 1; gym info + penalty rule)
-- ============================================================================
create table if not exists public.settings (
  id                int primary key default 1 check (id = 1),
  gym_name          text not null default 'GainShred',
  gym_phone         text,
  gym_address       text,
  currency          text not null default 'PKR',
  penalty_type      text not null default 'none' check (penalty_type in ('none', 'fixed', 'daily')),
  penalty_fixed     numeric(12,2) not null default 0 check (penalty_fixed >= 0), -- one-off Rs. after due date
  penalty_daily     numeric(12,2) not null default 0 check (penalty_daily >= 0), -- Rs. per day after due date
  penalty_grace_days int not null default 0 check (penalty_grace_days >= 0),     -- free days after due date
  penalty_max       numeric(12,2) not null default 0 check (penalty_max >= 0),   -- 0 = no cap
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id)
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ============================================================================
-- 5. DUES  (monthly ledger: what each member owes for a given month)
-- ============================================================================
create table if not exists public.dues (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members(id) on delete cascade,
  billing_month  date not null,                       -- always stored as the 1st of the month
  amount_due     numeric(12,2) not null default 0 check (amount_due >= 0),
  due_date       date not null,
  penalty_waived boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (member_id, billing_month)
);
create index if not exists dues_member_idx on public.dues(member_id);

-- ============================================================================
-- 6. PAYMENTS  (money received; each row IS a receipt; never hard-deleted)
-- ============================================================================
create sequence if not exists public.receipt_seq;

create or replace function public.gen_receipt_number()
returns text language sql volatile as $$
  select 'GS-' || to_char(current_date, 'YYYY') || '-' ||
         lpad(nextval('public.receipt_seq')::text, 5, '0');
$$;

create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  receipt_number    text unique not null default public.gen_receipt_number(),
  member_id         uuid not null references public.members(id) on delete restrict,
  due_id            uuid references public.dues(id) on delete set null,
  payment_month     date not null,                     -- which month this payment is for (1st of month)
  amount            numeric(12,2) not null default 0 check (amount >= 0),         -- applied to fee
  penalty_amount    numeric(12,2) not null default 0 check (penalty_amount >= 0), -- penalty collected
  payment_method    text not null check (payment_method in ('cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'card', 'adjustment')),
  payment_date      date not null default current_date,
  notes             text,
  receipt_image_url text,
  status            text not null default 'completed' check (status in ('completed', 'void')),
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
create index if not exists payments_member_idx on public.payments(member_id);
create index if not exists payments_due_idx    on public.payments(due_id);
create index if not exists payments_date_idx   on public.payments(payment_date);

-- ============================================================================
-- 7. PENALTIES  (audit log of manual waivers / adjustments)
--    Note: collected penalties live on payments.penalty_amount.
--    Outstanding penalties are CALCULATED live (see calc_penalty / due_details).
--    This table records admin overrides so they are auditable.
-- ============================================================================
create table if not exists public.penalties (
  id         uuid primary key default gen_random_uuid(),
  due_id     uuid references public.dues(id) on delete cascade,
  member_id  uuid references public.members(id) on delete cascade,
  amount     numeric(12,2) not null default 0,
  type       text not null default 'waiver' check (type in ('waiver', 'charge', 'adjustment')),
  reason     text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 8. AUDIT LOGS
-- ============================================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id),
  actor_email text,
  action      text not null,
  entity      text,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Live penalty for one due, based on current settings + days past due.
create or replace function public.calc_penalty(p_due_date date, p_balance numeric, p_waived boolean)
returns numeric language plpgsql stable as $$
declare s public.settings; days int; pen numeric := 0;
begin
  if p_balance <= 0 or p_waived then return 0; end if;
  select * into s from public.settings where id = 1;
  if not found then return 0; end if;

  days := (current_date - p_due_date) - coalesce(s.penalty_grace_days, 0);
  if days <= 0 then return 0; end if;

  if s.penalty_type = 'fixed' then
    pen := s.penalty_fixed;
  elsif s.penalty_type = 'daily' then
    pen := s.penalty_daily * days;
  else
    pen := 0;
  end if;

  if s.penalty_max > 0 and pen > s.penalty_max then
    pen := s.penalty_max;
  end if;

  return round(pen, 2);
end; $$;

-- Returns the due row id for (member, month), creating it if missing.
-- SECURITY DEFINER so that staff recording a payment can implicitly open a due.
create or replace function public.get_or_create_due(p_member uuid, p_month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare bmonth date := date_trunc('month', p_month)::date; d_id uuid; mrec public.members;
begin
  select id into d_id from public.dues where member_id = p_member and billing_month = bmonth;
  if d_id is not null then return d_id; end if;

  select * into mrec from public.members where id = p_member;
  if not found then raise exception 'Member not found'; end if;

  insert into public.dues (member_id, billing_month, amount_due, due_date)
  values (p_member, bmonth, mrec.monthly_fee, bmonth + (mrec.due_day - 1))
  returning id into d_id;
  return d_id;
end; $$;

-- Bulk-generate dues for every active member for a given month.
create or replace function public.generate_dues_for_month(p_month date)
returns int language plpgsql security definer set search_path = public as $$
declare cnt int := 0; mrec record; bmonth date := date_trunc('month', p_month)::date;
begin
  for mrec in select * from public.members where status = 'active' loop
    begin
      insert into public.dues (member_id, billing_month, amount_due, due_date)
      values (mrec.id, bmonth, mrec.monthly_fee, bmonth + (mrec.due_day - 1));
      cnt := cnt + 1;
    exception when unique_violation then
      null; -- already exists for this member/month
    end;
  end loop;
  return cnt;
end; $$;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Every due, enriched with what has been paid + live penalty + status.
create or replace view public.due_details as
select
  d.id,
  d.member_id,
  m.full_name              as member_name,
  m.phone                  as member_phone,
  m.status                 as member_status,
  d.billing_month,
  d.amount_due,
  d.due_date,
  d.penalty_waived,
  coalesce(pp.paid_fee, 0)                                          as amount_paid,
  coalesce(pp.paid_penalty, 0)                                      as penalty_paid,
  greatest(d.amount_due - coalesce(pp.paid_fee, 0), 0)              as balance,
  public.calc_penalty(d.due_date,
        greatest(d.amount_due - coalesce(pp.paid_fee, 0), 0),
        d.penalty_waived)                                           as penalty_due,
  case
    when greatest(d.amount_due - coalesce(pp.paid_fee, 0), 0) <= 0 then 'paid'
    when coalesce(pp.paid_fee, 0) > 0
      then (case when d.due_date < current_date then 'overdue' else 'partial' end)
    when d.due_date < current_date then 'overdue'
    else 'pending'
  end                                                               as status
from public.dues d
join public.members m on m.id = d.member_id
left join (
  select due_id,
         sum(amount)         as paid_fee,
         sum(penalty_amount) as paid_penalty
  from public.payments
  where status = 'completed' and due_id is not null
  group by due_id
) pp on pp.due_id = d.id;

-- Printable receipt: payment + member + balance on the related due.
create or replace view public.receipt_details as
select
  p.id,
  p.receipt_number,
  p.payment_date,
  p.payment_month,
  p.amount,
  p.penalty_amount,
  (p.amount + p.penalty_amount) as total_paid,
  p.payment_method,
  p.notes,
  p.receipt_image_url,
  p.status,
  p.created_at,
  m.id        as member_id,
  m.full_name as member_name,
  m.phone     as member_phone,
  m.email     as member_email,
  d.id          as due_id,
  d.amount_due  as month_fee,
  greatest(
    coalesce(d.amount_due, 0) -
    coalesce((select sum(x.amount) from public.payments x
              where x.due_id = d.id and x.status = 'completed'), 0), 0
  ) as balance_due
from public.payments p
join public.members m on m.id = p.member_id
left join public.dues d on d.id = p.due_id;

-- Dashboard aggregates in one JSON payload.
create or replace function public.dashboard_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total_members', (select count(*) from public.members where status = 'active'),
    'paid_this_month', (
      select coalesce(sum(amount + penalty_amount), 0) from public.payments
      where status = 'completed'
        and date_trunc('month', payment_date) = date_trunc('month', current_date)
    ),
    'pending_dues', (select coalesce(sum(balance), 0) from public.due_details where balance > 0),
    'overdue_amount', (
      select coalesce(sum(balance + penalty_due), 0) from public.due_details
      where balance > 0 and due_date < current_date
    ),
    'penalties_collected', (
      select coalesce(sum(penalty_amount), 0) from public.payments where status = 'completed'
    ),
    'overdue_count', (
      select count(*) from public.due_details where balance > 0 and due_date < current_date
    )
  );
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Create a profile automatically when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep members.updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists members_touch on public.members;
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles        enable row level security;
alter table public.membership_plans enable row level security;
alter table public.members         enable row level security;
alter table public.settings        enable row level security;
alter table public.dues            enable row level security;
alter table public.payments        enable row level security;
alter table public.penalties       enable row level security;
alter table public.audit_logs      enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- membership_plans ----------------------------------------------------------
drop policy if exists plans_select on public.membership_plans;
create policy plans_select on public.membership_plans for select to authenticated using (true);
drop policy if exists plans_admin_write on public.membership_plans;
create policy plans_admin_write on public.membership_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- members: everyone reads; only admin creates/edits/deletes -----------------
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (true);
drop policy if exists members_admin_write on public.members;
create policy members_admin_write on public.members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- settings: everyone reads; only admin writes ------------------------------
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated using (true);
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- dues: everyone reads; only admin writes (staff opens dues via SECURITY DEFINER fn)
drop policy if exists dues_select on public.dues;
create policy dues_select on public.dues for select to authenticated using (true);
drop policy if exists dues_admin_write on public.dues;
create policy dues_admin_write on public.dues for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- payments: everyone reads + inserts; only admin edits (void) / deletes -----
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (true);
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated with check (true);
drop policy if exists payments_admin_update on public.payments;
create policy payments_admin_update on public.payments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists payments_admin_delete on public.payments;
create policy payments_admin_delete on public.payments for delete to authenticated
  using (public.is_admin());

-- penalties: everyone reads; only admin writes -----------------------------
drop policy if exists penalties_select on public.penalties;
create policy penalties_select on public.penalties for select to authenticated using (true);
drop policy if exists penalties_admin_write on public.penalties;
create policy penalties_admin_write on public.penalties for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit_logs: admin reads; any authenticated user can append ---------------
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated with check (true);

-- ============================================================================
-- STORAGE  (bucket for optional receipt images)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

drop policy if exists "receipts public read" on storage.objects;
create policy "receipts public read" on storage.objects for select to public
  using (bucket_id = 'receipts');

drop policy if exists "receipts auth upload" on storage.objects;
create policy "receipts auth upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts');

-- ============================================================================
-- DONE. Next: run supabase/seed.sql (optional sample data) and create your
-- admin user (see README "Authentication setup").
-- ============================================================================


-- ############################################################################
-- PHASE 2 — Attendance + Advance payments
-- (Idempotent; also shipped standalone as supabase/upgrade_phase2.sql)
-- ############################################################################

-- A) MEMBERS — advance balance ----------------------------------------------
alter table public.members
  add column if not exists advance_balance numeric(12,2) not null default 0;

-- B) PAYMENTS — advance support ---------------------------------------------
alter table public.payments
  add column if not exists advance_added numeric(12,2) not null default 0 check (advance_added >= 0);
alter table public.payments
  add column if not exists advance_applied numeric(12,2) not null default 0 check (advance_applied >= 0);
alter table public.payments
  add column if not exists cash_received numeric(12,2)
  generated always as ((amount - advance_applied) + penalty_amount + advance_added) stored;

create or replace function public.apply_advance_effect()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed'
       and (coalesce(new.advance_added,0) <> 0 or coalesce(new.advance_applied,0) <> 0) then
      update public.members
        set advance_balance = advance_balance + coalesce(new.advance_added,0) - coalesce(new.advance_applied,0)
        where id = new.member_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'completed' and new.status <> 'completed' then
      update public.members
        set advance_balance = advance_balance - coalesce(old.advance_added,0) + coalesce(old.advance_applied,0)
        where id = old.member_id;
    elsif old.status <> 'completed' and new.status = 'completed' then
      update public.members
        set advance_balance = advance_balance + coalesce(new.advance_added,0) - coalesce(new.advance_applied,0)
        where id = new.member_id;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists payments_advance_effect on public.payments;
create trigger payments_advance_effect
  after insert or update on public.payments
  for each row execute function public.apply_advance_effect();

-- C) ATTENDANCE -------------------------------------------------------------
create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  check_in_at  timestamptz not null default now(),
  check_out_at timestamptz,
  date         date not null default current_date,
  status       text not null default 'inside' check (status in ('inside', 'outside')),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists attendance_member_idx on public.attendance(member_id);
create index if not exists attendance_date_idx   on public.attendance(date);
create unique index if not exists attendance_one_open_per_member
  on public.attendance(member_id) where check_out_at is null;

alter table public.attendance enable row level security;

drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated using (true);
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated with check (true);
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated using (true) with check (true);
drop policy if exists attendance_admin_delete on public.attendance;
create policy attendance_admin_delete on public.attendance for delete to authenticated using (public.is_admin());

create or replace view public.member_attendance_status as
select
  m.id     as member_id,
  m.full_name,
  m.phone,
  m.status as member_status,
  a.id     as open_attendance_id,
  a.check_in_at,
  case when a.id is not null then 'inside' else 'outside' end as presence
from public.members m
left join public.attendance a
  on a.member_id = m.id and a.check_out_at is null;

-- D) Advance-aware receipt view + dashboard ---------------------------------
drop view if exists public.receipt_details;
create view public.receipt_details as
select
  p.id,
  p.receipt_number,
  p.payment_date,
  p.payment_month,
  p.amount,
  p.penalty_amount,
  coalesce(p.advance_added, 0)   as advance_added,
  coalesce(p.advance_applied, 0) as advance_applied,
  coalesce(p.cash_received, p.amount + p.penalty_amount) as cash_received,
  (p.amount + p.penalty_amount)  as total_paid,
  p.payment_method,
  p.notes,
  p.receipt_image_url,
  p.status,
  p.created_at,
  m.id        as member_id,
  m.full_name as member_name,
  m.phone     as member_phone,
  m.email     as member_email,
  coalesce(m.advance_balance, 0) as advance_balance,
  d.id          as due_id,
  d.amount_due  as month_fee,
  greatest(
    coalesce(d.amount_due, 0) -
    coalesce((select sum(x.amount) from public.payments x
              where x.due_id = d.id and x.status = 'completed'), 0), 0
  ) as balance_due
from public.payments p
join public.members m on m.id = p.member_id
left join public.dues d on d.id = p.due_id;

create or replace function public.dashboard_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total_members', (select count(*) from public.members where status = 'active'),
    'paid_this_month', (
      select coalesce(sum(cash_received), 0) from public.payments
      where status = 'completed'
        and date_trunc('month', payment_date) = date_trunc('month', current_date)
    ),
    'pending_dues', (select coalesce(sum(balance), 0) from public.due_details where balance > 0),
    'overdue_amount', (
      select coalesce(sum(balance + penalty_due), 0) from public.due_details
      where balance > 0 and due_date < current_date
    ),
    'penalties_collected', (
      select coalesce(sum(penalty_amount), 0) from public.payments where status = 'completed'
    ),
    'overdue_count', (
      select count(*) from public.due_details where balance > 0 and due_date < current_date
    )
  );
$$;
-- ############################################################################
-- END PHASE 2
-- ############################################################################


-- ############################################################################
-- PHASE 3 — Membership durations, services, offers
-- (Idempotent; also shipped standalone as supabase/upgrade_phase3.sql)
-- ############################################################################

alter table public.membership_plans add column if not exists duration_months int;
alter table public.membership_plans add column if not exists advance_amount  numeric(12,2) not null default 0;
alter table public.membership_plans add column if not exists total_price     numeric(12,2);
alter table public.membership_plans add column if not exists saving_amount   numeric(12,2) not null default 0;

alter table public.members add column if not exists age int
  check (age is null or (age >= 0 and age <= 120));
alter table public.members add column if not exists offer_code text not null default 'none';

create table if not exists public.services (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      numeric(12,2) not null default 0 check (price >= 0),
  category   text not null default 'other'
             check (category in ('registration','membership','training','cardio','class','other')),
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.offers (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  note       text,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.member_services (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price      numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (member_id, service_id)
);
create index if not exists member_services_member_idx on public.member_services(member_id);

alter table public.services        enable row level security;
alter table public.offers          enable row level security;
alter table public.member_services enable row level security;

drop policy if exists services_select on public.services;
create policy services_select on public.services for select to authenticated using (true);
drop policy if exists services_admin_write on public.services;
create policy services_admin_write on public.services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select to authenticated using (true);
drop policy if exists offers_admin_write on public.offers;
create policy offers_admin_write on public.offers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists member_services_select on public.member_services;
create policy member_services_select on public.member_services for select to authenticated using (true);
drop policy if exists member_services_admin_write on public.member_services;
create policy member_services_admin_write on public.member_services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.membership_plans (name, monthly_fee, description, is_active)
select 'Monthly', 3500, 'Monthly membership', true
where not exists (select 1 from public.membership_plans where name = 'Monthly');
insert into public.membership_plans (name, monthly_fee, description, is_active)
select '3 Months', 3000, '3-month package', true
where not exists (select 1 from public.membership_plans where name = '3 Months');
insert into public.membership_plans (name, monthly_fee, description, is_active)
select '6 Months', 3000, '6-month package', true
where not exists (select 1 from public.membership_plans where name = '6 Months');
insert into public.membership_plans (name, monthly_fee, description, is_active)
select 'Yearly', 3000, '12-month package', true
where not exists (select 1 from public.membership_plans where name = 'Yearly');

update public.membership_plans set monthly_fee=3500, duration_months=1,  advance_amount=0,    total_price=3500,  saving_amount=0    where name='Monthly';
update public.membership_plans set monthly_fee=3000, duration_months=3,  advance_amount=2000, total_price=9000,  saving_amount=1500 where name='3 Months';
update public.membership_plans set monthly_fee=3000, duration_months=6,  advance_amount=1000, total_price=18000, saving_amount=3000 where name='6 Months';
update public.membership_plans set monthly_fee=3000, duration_months=12, advance_amount=2000, total_price=36000, saving_amount=6000 where name='Yearly';

insert into public.services (name, price, category, sort_order)
select v.name, v.price, v.category, v.sort_order from (values
  ('Registration',              3000, 'registration', 1),
  ('Monthly Fee',               3500, 'membership',   2),
  ('Cardio',                    2000, 'cardio',       3),
  ('Strength + Cardio',         5500, 'training',     4),
  ('Basic Training',            6000, 'training',     5),
  ('Advanced Training',         9000, 'training',     6),
  ('Target Training',          25000, 'training',     7),
  ('Aerobic, Yoga and Zumba',   6000, 'class',        8)
) as v(name, price, category, sort_order)
where not exists (select 1 from public.services s where s.name = v.name);

insert into public.offers (code, name, note, sort_order)
select v.code, v.name, v.note, v.sort_order from (values
  ('couple', 'Couple Offer',              'Per person: advance Rs.1000, monthly Rs.2500, cardio Rs.2000', 1),
  ('wife',   'Wife Offer',                '50% off all training services',                                2),
  ('senior', 'Senior Citizen 67+ Offer',  'Free gym for 67+, all services free except cardio (Rs.2000)',  3)
) as v(code, name, note, sort_order)
where not exists (select 1 from public.offers o where o.code = v.code);
-- ############################################################################
-- END PHASE 3
-- ############################################################################


-- ############################################################################
-- PHASE 4 — Registration numbers, accounting (discount/net/receivable),
--           online admission requests.
-- (Idempotent; also shipped standalone as supabase/upgrade_phase4.sql)
-- ############################################################################

create sequence if not exists public.member_reg_seq;
create or replace function public.gen_member_reg()
returns text language sql volatile as $$
  select 'GS-' || lpad(nextval('public.member_reg_seq')::text, 4, '0');
$$;
alter table public.members add column if not exists registration_number text;
do $$
declare r record;
begin
  for r in select id from public.members where registration_number is null order by created_at, id loop
    update public.members set registration_number = public.gen_member_reg() where id = r.id;
  end loop;
end $$;
alter table public.members alter column registration_number set default public.gen_member_reg();
create unique index if not exists members_registration_number_key on public.members(registration_number);

alter table public.dues     add column if not exists discount numeric(12,2) not null default 0 check (discount >= 0);
alter table public.payments add column if not exists discount numeric(12,2) not null default 0 check (discount >= 0);

drop view if exists public.due_details;
create view public.due_details as
select
  d.id, d.member_id, m.registration_number,
  m.full_name as member_name, m.phone as member_phone, m.status as member_status,
  d.billing_month, d.amount_due, d.amount_due as gross_payable,
  coalesce(d.discount, 0) as discount,
  greatest(d.amount_due - coalesce(d.discount, 0), 0) as net_payable,
  coalesce(pp.paid_fee, 0) as amount_paid, coalesce(pp.paid_penalty, 0) as penalty_paid,
  greatest(greatest(d.amount_due - coalesce(d.discount, 0), 0) - coalesce(pp.paid_fee, 0), 0) as balance,
  public.calc_penalty(d.due_date, greatest(greatest(d.amount_due - coalesce(d.discount,0),0) - coalesce(pp.paid_fee,0),0), d.penalty_waived) as penalty_due,
  d.due_date, d.penalty_waived, pp.last_payment_date,
  case
    when greatest(greatest(d.amount_due - coalesce(d.discount,0),0) - coalesce(pp.paid_fee,0),0) <= 0 then 'paid'
    when coalesce(pp.paid_fee,0) > 0 then (case when d.due_date < (now() at time zone 'Asia/Karachi')::date then 'overdue' else 'partial' end)
    when d.due_date < (now() at time zone 'Asia/Karachi')::date then 'overdue'
    else 'pending'
  end as status
from public.dues d
join public.members m on m.id = d.member_id
left join (
  select due_id, sum(amount) as paid_fee, sum(penalty_amount) as paid_penalty, max(payment_date) as last_payment_date
  from public.payments where status = 'completed' and due_id is not null group by due_id
) pp on pp.due_id = d.id;

drop view if exists public.receipt_details;
create view public.receipt_details as
select
  p.id, p.receipt_number, p.payment_date, p.payment_month, p.amount, p.penalty_amount,
  coalesce(p.discount,0) as discount, coalesce(p.advance_added,0) as advance_added,
  coalesce(p.advance_applied,0) as advance_applied,
  coalesce(p.cash_received, p.amount + p.penalty_amount) as cash_received,
  (p.amount + p.penalty_amount) as total_paid,
  p.payment_method, p.notes, p.receipt_image_url, p.status, p.created_at,
  m.id as member_id, m.registration_number, m.full_name as member_name, m.phone as member_phone, m.email as member_email,
  coalesce(m.advance_balance,0) as advance_balance,
  d.id as due_id, d.amount_due as month_fee, d.amount_due as gross_payable,
  coalesce(d.discount,0) as due_discount,
  greatest(d.amount_due - coalesce(d.discount,0),0) as net_payable,
  greatest(greatest(d.amount_due - coalesce(d.discount,0),0) - coalesce((select sum(x.amount) from public.payments x where x.due_id=d.id and x.status='completed'),0),0) as balance_due
from public.payments p
join public.members m on m.id = p.member_id
left join public.dues d on d.id = p.due_id;

drop view if exists public.member_attendance_status;
create view public.member_attendance_status as
select m.id as member_id, m.registration_number, m.full_name, m.phone, m.status as member_status,
  a.id as open_attendance_id, a.check_in_at,
  case when a.id is not null then 'inside' else 'outside' end as presence
from public.members m
left join public.attendance a on a.member_id = m.id and a.check_out_at is null;

drop policy if exists plans_select on public.membership_plans;
create policy plans_select on public.membership_plans for select to anon, authenticated using (true);
drop policy if exists services_select on public.services;
create policy services_select on public.services for select to anon, authenticated using (true);
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select to anon, authenticated using (true);

create table if not exists public.admission_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, phone text, email text, age int check (age is null or (age >= 0 and age <= 120)),
  gender text, address text, emergency_contact text,
  selected_membership_plan_id uuid references public.membership_plans(id) on delete set null,
  selected_services jsonb, offer_code text default 'none',
  preferred_joining_date date, notes text, photo_reference text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','converted')),
  converted_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists admission_requests_status_idx on public.admission_requests(status);
alter table public.admission_requests enable row level security;
drop policy if exists admission_public_insert on public.admission_requests;
create policy admission_public_insert on public.admission_requests for insert to anon with check (true);
drop policy if exists admission_auth_insert on public.admission_requests;
create policy admission_auth_insert on public.admission_requests for insert to authenticated with check (true);
drop policy if exists admission_admin_all on public.admission_requests;
create policy admission_admin_all on public.admission_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop trigger if exists admission_requests_touch on public.admission_requests;
create trigger admission_requests_touch before update on public.admission_requests
  for each row execute function public.touch_updated_at();

create or replace function public.submit_admission_request(
  p_full_name text, p_phone text, p_email text, p_age int, p_gender text,
  p_address text, p_emergency text, p_plan uuid, p_services jsonb,
  p_offer text, p_joining date, p_notes text, p_photo_reference text
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_full_name is null or length(trim(p_full_name)) < 2 then raise exception 'Full name is required'; end if;
  if (p_phone is null or trim(p_phone) = '') and (p_email is null or trim(p_email) = '') then
    raise exception 'Provide a phone number or email';
  end if;
  if exists (select 1 from public.admission_requests where status='pending'
      and ((nullif(trim(p_phone),'') is not null and phone = trim(p_phone))
        or (nullif(trim(p_email),'') is not null and email = trim(p_email)))) then
    raise exception 'A request with this phone or email is already pending';
  end if;
  insert into public.admission_requests (full_name, phone, email, age, gender, address, emergency_contact,
    selected_membership_plan_id, selected_services, offer_code, preferred_joining_date, notes, photo_reference)
  values (trim(p_full_name), nullif(trim(p_phone),''), nullif(trim(p_email),''), p_age, nullif(trim(p_gender),''),
    nullif(trim(p_address),''), nullif(trim(p_emergency),''), p_plan, p_services, coalesce(nullif(trim(p_offer),''),'none'),
    p_joining, nullif(trim(p_notes),''), nullif(trim(p_photo_reference),''))
  returning id into new_id;
  return new_id;
end $$;
-- ############################################################################
-- END PHASE 4
-- ############################################################################


-- ############################################################################
-- PHASE 4b — offer cleanup + couple admission linking
-- (Idempotent; also shipped standalone as supabase/upgrade_phase4b.sql)
-- ############################################################################
alter table public.members add column if not exists couple_group_id uuid;
create index if not exists members_couple_group_idx on public.members(couple_group_id);
alter table public.offers add column if not exists applies_to     text;
alter table public.offers add column if not exists offer_category text;
update public.offers set is_active = false where code = 'couple';
update public.offers set is_active = true, applies_to = 'wife_services',     offer_category = 'discount' where code = 'wife';
update public.offers set is_active = true, applies_to = 'all_except_cardio', offer_category = 'free'     where code = 'senior';
-- ############################################################################
-- END PHASE 4b
-- ############################################################################


-- ############################################################################
-- PHASE 5 — lump-sum package billing + single source of truth (member_billing)
-- (Idempotent; also shipped standalone as supabase/upgrade_phase5.sql)
-- ############################################################################
alter table public.membership_plans add column if not exists registration_fee numeric(12,2) not null default 0;
update public.membership_plans set duration_months=1,  total_price=3500,  registration_fee=3000, saving_amount=0,    monthly_fee=3500  where name='Monthly';
update public.membership_plans set duration_months=3,  total_price=9000,  registration_fee=2000, saving_amount=1500, monthly_fee=9000  where name='3 Months';
update public.membership_plans set duration_months=6,  total_price=18000, registration_fee=1500, saving_amount=3000, monthly_fee=18000 where name='6 Months';
update public.membership_plans set duration_months=12, total_price=36000, registration_fee=0,    saving_amount=6000, monthly_fee=36000 where name='Yearly';

update public.services set is_active = false where category in ('registration', 'membership');

alter table public.members add column if not exists registration_fee numeric(12,2) not null default 0;
alter table public.members add column if not exists package_fee      numeric(12,2) not null default 0;
alter table public.members add column if not exists services_total    numeric(12,2) not null default 0;
alter table public.members add column if not exists gross_payable     numeric(12,2) not null default 0;

update public.members m
set registration_fee = coalesce(p.registration_fee, 0),
    package_fee      = coalesce(p.total_price, 0),
    services_total   = coalesce(ms.svc_total, 0),
    gross_payable    = coalesce(p.registration_fee,0) + coalesce(p.total_price,0) + coalesce(ms.svc_total,0)
from public.members mx
left join public.membership_plans p on p.id = mx.plan_id
left join (select member_id, sum(price) as svc_total from public.member_services group by member_id) ms on ms.member_id = mx.id
where m.id = mx.id;

create or replace view public.member_billing as
select
  m.id as member_id, m.registration_number, m.full_name, m.phone, m.status as member_status,
  m.offer_code, m.plan_id, p.name as package_name, p.duration_months,
  coalesce(m.registration_fee,0) as registration_fee,
  coalesce(m.package_fee,0)      as package_fee,
  coalesce(m.services_total,0)   as services_total,
  coalesce(m.gross_payable,0)    as gross_payable,
  coalesce(pay.total_discount,0) as discount,
  greatest(coalesce(m.gross_payable,0) - coalesce(pay.total_discount,0), 0) as net_payable,
  coalesce(pay.total_paid,0)     as paid,
  greatest(coalesce(m.gross_payable,0) - coalesce(pay.total_discount,0) - coalesce(pay.total_paid,0), 0) as receivable,
  pay.last_payment_date,
  case
    when coalesce(m.gross_payable,0) <= 0 then 'none'
    when greatest(coalesce(m.gross_payable,0) - coalesce(pay.total_discount,0) - coalesce(pay.total_paid,0),0) <= 0 then 'paid'
    when coalesce(pay.total_paid,0) > 0 then 'partial'
    else 'due'
  end as status
from public.members m
left join public.membership_plans p on p.id = m.plan_id
left join (
  select member_id, sum(amount) as total_paid, sum(discount) as total_discount, max(payment_date) as last_payment_date
  from public.payments where status='completed' group by member_id
) pay on pay.member_id = m.id;

drop view if exists public.receipt_details;
create view public.receipt_details as
select
  p.id, p.receipt_number, p.payment_date, p.payment_month, p.amount, p.penalty_amount,
  coalesce(p.discount,0) as discount, coalesce(p.advance_added,0) as advance_added, coalesce(p.advance_applied,0) as advance_applied,
  coalesce(p.cash_received, p.amount + p.penalty_amount) as cash_received, (p.amount + p.penalty_amount) as total_paid,
  p.payment_method, p.notes, p.receipt_image_url, p.status, p.created_at,
  m.id as member_id, m.registration_number, m.full_name as member_name, m.phone as member_phone, m.email as member_email,
  coalesce(m.advance_balance,0) as advance_balance,
  coalesce(m.registration_fee,0) as registration_fee, coalesce(m.package_fee,0) as package_fee,
  coalesce(m.services_total,0) as services_total, coalesce(m.gross_payable,0) as gross_payable,
  pl.name as package_name, coalesce(pl.saving_amount,0) as package_saving,
  coalesce((select sum(x.discount) from public.payments x where x.member_id=m.id and x.status='completed'),0) as total_discount,
  greatest(coalesce(m.gross_payable,0) - coalesce((select sum(x.discount) from public.payments x where x.member_id=m.id and x.status='completed'),0),0) as net_payable,
  coalesce((select sum(x.amount) from public.payments x where x.member_id=m.id and x.status='completed'),0) as member_paid,
  greatest(coalesce(m.gross_payable,0) - coalesce((select sum(x.discount) from public.payments x where x.member_id=m.id and x.status='completed'),0) - coalesce((select sum(x.amount) from public.payments x where x.member_id=m.id and x.status='completed'),0),0) as balance_due
from public.payments p
join public.members m on m.id = p.member_id
left join public.membership_plans pl on pl.id = m.plan_id;

create or replace function public.dashboard_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total_members', (select count(*) from public.members where status = 'active'),
    'paid_this_month', (select coalesce(sum(cash_received),0) from public.payments where status='completed' and date_trunc('month',payment_date)=date_trunc('month',current_date)),
    'pending_dues', (select coalesce(sum(receivable),0) from public.member_billing where receivable > 0),
    'overdue_amount', (select coalesce(sum(receivable),0) from public.member_billing where receivable > 0 and status='partial'),
    'penalties_collected', (select coalesce(sum(penalty_amount),0) from public.payments where status='completed'),
    'overdue_count', (select count(*) from public.member_billing where receivable > 0)
  );
$$;
-- ############################################################################
-- END PHASE 5
-- ############################################################################


-- ############################################################################
-- PHASE 7 — couple payload for the public admission form (admission_requests)
-- (Idempotent; also shipped standalone as supabase/upgrade_phase7.sql)
-- ############################################################################
alter table public.admission_requests
  add column if not exists member_type text not null default 'single'
  check (member_type in ('single', 'couple'));
alter table public.admission_requests
  add column if not exists spouse jsonb;
-- ############################################################################
-- END PHASE 7
-- ############################################################################


-- ############################################################################
-- PHASE 7b — link converted wife member to the admission request
-- (Idempotent; also shipped standalone as supabase/upgrade_phase7b.sql)
-- ############################################################################
alter table public.admission_requests
  add column if not exists converted_spouse_member_id uuid
  references public.members(id) on delete set null;
-- ############################################################################
-- END PHASE 7b
-- ############################################################################
