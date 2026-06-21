-- ============================================================================
-- GainShred AMS — PHASE 4a: Registration numbers, accounting (discount/net/
-- receivable), and online admission requests.
-- ----------------------------------------------------------------------------
-- Run AFTER upgrade_phase3.sql. Idempotent & additive. No table/row is dropped;
-- views are safely recreated (views hold no data).
--
--   ACCOUNTING RULE:  Gross Payable - Discount = Net Payable
--                     Net Payable - Paid = Due / Receivable
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) MEMBERS — unique auto registration number (GS-0001 ...) + backfill
-- ---------------------------------------------------------------------------
create sequence if not exists public.member_reg_seq;

create or replace function public.gen_member_reg()
returns text language sql volatile as $$
  select 'GS-' || lpad(nextval('public.member_reg_seq')::text, 4, '0');
$$;

alter table public.members add column if not exists registration_number text;

-- Backfill existing members (oldest first) that don't have a number yet.
do $$
declare r record;
begin
  for r in select id from public.members where registration_number is null order by created_at, id loop
    update public.members set registration_number = public.gen_member_reg() where id = r.id;
  end loop;
end $$;

-- New members auto-generate; enforce uniqueness.
alter table public.members alter column registration_number set default public.gen_member_reg();
create unique index if not exists members_registration_number_key on public.members(registration_number);

-- ---------------------------------------------------------------------------
-- B) DISCOUNT columns (accounting)
-- ---------------------------------------------------------------------------
alter table public.dues     add column if not exists discount numeric(12,2) not null default 0 check (discount >= 0);
alter table public.payments add column if not exists discount numeric(12,2) not null default 0 check (discount >= 0);

-- ---------------------------------------------------------------------------
-- C) DUE_DETAILS view — gross / discount / net / paid / receivable
-- ---------------------------------------------------------------------------
drop view if exists public.due_details;
create view public.due_details as
select
  d.id,
  d.member_id,
  m.registration_number,
  m.full_name              as member_name,
  m.phone                  as member_phone,
  m.status                 as member_status,
  d.billing_month,
  d.amount_due,                                            -- kept for compatibility
  d.amount_due             as gross_payable,
  coalesce(d.discount, 0)  as discount,
  greatest(d.amount_due - coalesce(d.discount, 0), 0)      as net_payable,
  coalesce(pp.paid_fee, 0)     as amount_paid,
  coalesce(pp.paid_penalty, 0) as penalty_paid,
  greatest(greatest(d.amount_due - coalesce(d.discount, 0), 0) - coalesce(pp.paid_fee, 0), 0) as balance, -- receivable
  public.calc_penalty(
    d.due_date,
    greatest(greatest(d.amount_due - coalesce(d.discount, 0), 0) - coalesce(pp.paid_fee, 0), 0),
    d.penalty_waived
  )                        as penalty_due,
  d.due_date,
  d.penalty_waived,
  pp.last_payment_date,
  case
    when greatest(greatest(d.amount_due - coalesce(d.discount, 0), 0) - coalesce(pp.paid_fee, 0), 0) <= 0 then 'paid'
    when coalesce(pp.paid_fee, 0) > 0
      then (case when d.due_date < (now() at time zone 'Asia/Karachi')::date then 'overdue' else 'partial' end)
    when d.due_date < (now() at time zone 'Asia/Karachi')::date then 'overdue'
    else 'pending'
  end                      as status
from public.dues d
join public.members m on m.id = d.member_id
left join (
  select due_id,
         sum(amount)         as paid_fee,
         sum(penalty_amount) as paid_penalty,
         max(payment_date)   as last_payment_date
  from public.payments
  where status = 'completed' and due_id is not null
  group by due_id
) pp on pp.due_id = d.id;

-- ---------------------------------------------------------------------------
-- D) RECEIPT_DETAILS view — adds reg number + discount + net payable
-- ---------------------------------------------------------------------------
drop view if exists public.receipt_details;
create view public.receipt_details as
select
  p.id,
  p.receipt_number,
  p.payment_date,
  p.payment_month,
  p.amount,
  p.penalty_amount,
  coalesce(p.discount, 0)        as discount,
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
  m.registration_number,
  m.full_name as member_name,
  m.phone     as member_phone,
  m.email     as member_email,
  coalesce(m.advance_balance, 0) as advance_balance,
  d.id          as due_id,
  d.amount_due  as month_fee,
  d.amount_due  as gross_payable,
  coalesce(d.discount, 0)                            as due_discount,
  greatest(d.amount_due - coalesce(d.discount, 0), 0) as net_payable,
  greatest(
    greatest(d.amount_due - coalesce(d.discount, 0), 0) -
    coalesce((select sum(x.amount) from public.payments x
              where x.due_id = d.id and x.status = 'completed'), 0), 0
  ) as balance_due
from public.payments p
join public.members m on m.id = p.member_id
left join public.dues d on d.id = p.due_id;

-- ---------------------------------------------------------------------------
-- E) MEMBER_ATTENDANCE_STATUS view — add reg number (searchable)
-- ---------------------------------------------------------------------------
drop view if exists public.member_attendance_status;
create view public.member_attendance_status as
select
  m.id     as member_id,
  m.registration_number,
  m.full_name,
  m.phone,
  m.status as member_status,
  a.id     as open_attendance_id,
  a.check_in_at,
  case when a.id is not null then 'inside' else 'outside' end as presence
from public.members m
left join public.attendance a
  on a.member_id = m.id and a.check_out_at is null;

-- ---------------------------------------------------------------------------
-- F) Public catalog read (so the PUBLIC /admission form can load dropdowns)
--    Plan/service/offer names + prices are marketing info, safe for anon.
-- ---------------------------------------------------------------------------
drop policy if exists plans_select on public.membership_plans;
create policy plans_select on public.membership_plans for select to anon, authenticated using (true);
drop policy if exists services_select on public.services;
create policy services_select on public.services for select to anon, authenticated using (true);
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- G) ADMISSION REQUESTS (online admission, NO file upload, NO storage)
-- ---------------------------------------------------------------------------
create table if not exists public.admission_requests (
  id                          uuid primary key default gen_random_uuid(),
  full_name                   text not null,
  phone                       text,
  email                       text,
  age                         int check (age is null or (age >= 0 and age <= 120)),
  gender                      text,
  address                     text,
  emergency_contact           text,
  selected_membership_plan_id uuid references public.membership_plans(id) on delete set null,
  selected_services           jsonb,       -- array of service ids (no upload)
  offer_code                  text default 'none',
  preferred_joining_date      date,
  notes                       text,
  photo_reference             text,        -- optional manual text/link ONLY (no upload)
  status                      text not null default 'pending'
                              check (status in ('pending', 'approved', 'rejected', 'converted')),
  converted_member_id         uuid references public.members(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists admission_requests_status_idx on public.admission_requests(status);

alter table public.admission_requests enable row level security;

-- Public + staff may INSERT; only admin may read / update / delete.
drop policy if exists admission_public_insert on public.admission_requests;
create policy admission_public_insert on public.admission_requests for insert to anon with check (true);
drop policy if exists admission_auth_insert on public.admission_requests;
create policy admission_auth_insert on public.admission_requests for insert to authenticated with check (true);
drop policy if exists admission_admin_all on public.admission_requests;
create policy admission_admin_all on public.admission_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists admission_requests_touch on public.admission_requests;
create trigger admission_requests_touch before update on public.admission_requests
  for each row execute function public.touch_updated_at();

-- Secure submit: validates + light duplicate check, runs as definer so the
-- public (anon) user can insert without being able to READ the table.
create or replace function public.submit_admission_request(
  p_full_name text, p_phone text, p_email text, p_age int, p_gender text,
  p_address text, p_emergency text, p_plan uuid, p_services jsonb,
  p_offer text, p_joining date, p_notes text, p_photo_reference text
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'Full name is required';
  end if;
  if (p_phone is null or trim(p_phone) = '') and (p_email is null or trim(p_email) = '') then
    raise exception 'Provide a phone number or email';
  end if;

  -- light spam/duplicate guard: a pending request with the same phone/email
  if exists (
    select 1 from public.admission_requests
    where status = 'pending'
      and ((nullif(trim(p_phone), '') is not null and phone = trim(p_phone))
        or (nullif(trim(p_email), '') is not null and email = trim(p_email)))
  ) then
    raise exception 'A request with this phone or email is already pending';
  end if;

  insert into public.admission_requests (
    full_name, phone, email, age, gender, address, emergency_contact,
    selected_membership_plan_id, selected_services, offer_code,
    preferred_joining_date, notes, photo_reference
  ) values (
    trim(p_full_name), nullif(trim(p_phone), ''), nullif(trim(p_email), ''), p_age,
    nullif(trim(p_gender), ''), nullif(trim(p_address), ''), nullif(trim(p_emergency), ''),
    p_plan, p_services, coalesce(nullif(trim(p_offer), ''), 'none'),
    p_joining, nullif(trim(p_notes), ''), nullif(trim(p_photo_reference), '')
  ) returning id into new_id;
  return new_id;
end $$;

-- ============================================================================
-- DONE. Existing members/payments/dues/attendance are untouched; new columns
-- default to 0/now(); registration numbers are backfilled for old members.
-- ============================================================================
