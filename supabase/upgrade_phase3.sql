-- ============================================================================
-- GainShred AMS — PHASE 3: Membership durations, services, offers
-- ----------------------------------------------------------------------------
-- Run AFTER upgrade_phase2b.sql. Idempotent and additive — no table or row is
-- dropped; seed data uses "insert where not exists" so re-running won't duplicate.
-- ============================================================================

-- A) MEMBERSHIP PLANS -> duration packages -----------------------------------
alter table public.membership_plans add column if not exists duration_months int;
alter table public.membership_plans add column if not exists advance_amount  numeric(12,2) not null default 0;
alter table public.membership_plans add column if not exists total_price     numeric(12,2);
alter table public.membership_plans add column if not exists saving_amount   numeric(12,2) not null default 0;

-- B) MEMBERS -> age + selected offer -----------------------------------------
alter table public.members add column if not exists age int
  check (age is null or (age >= 0 and age <= 120));
alter table public.members add column if not exists offer_code text not null default 'none';

-- C) SERVICES catalog --------------------------------------------------------
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

-- D) OFFERS catalog ----------------------------------------------------------
create table if not exists public.offers (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  note       text,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- E) MEMBER <-> SERVICES join ------------------------------------------------
create table if not exists public.member_services (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price      numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (member_id, service_id)
);
create index if not exists member_services_member_idx on public.member_services(member_id);

-- F) RLS ---------------------------------------------------------------------
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

-- G) SEED: duration packages (insert-if-missing, then set pricing) -----------
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

-- H) SEED: services ----------------------------------------------------------
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

-- I) SEED: offers ------------------------------------------------------------
insert into public.offers (code, name, note, sort_order)
select v.code, v.name, v.note, v.sort_order from (values
  ('couple', 'Couple Offer',              'Per person: advance Rs.1000, monthly Rs.2500, cardio Rs.2000', 1),
  ('wife',   'Wife Offer',                '50% off all training services',                                2),
  ('senior', 'Senior Citizen 67+ Offer',  'Free gym for 67+, all services free except cardio (Rs.2000)',  3)
) as v(code, name, note, sort_order)
where not exists (select 1 from public.offers o where o.code = v.code);

-- ============================================================================
-- DONE. Existing members/payments/attendance are untouched.
-- ============================================================================
