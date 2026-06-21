-- ============================================================================
-- GainShred AMS — PHASE 5: correct lump-sum package billing + single source
-- ----------------------------------------------------------------------------
-- Run AFTER upgrade_phase4c.sql. Idempotent & additive. No data deleted.
--
--   Gross Payable = Registration Fee + Package Fee (lump sum) + Optional Services
--   Net Payable   = Gross - Discounts
--   Receivable    = Net  - Paid
--
-- The pricing is computed by ONE TypeScript engine (computePackage) and the
-- result is SNAPSHOTTED onto the member, then read everywhere via member_billing.
-- ============================================================================

-- A) MEMBERSHIP PLANS: registration fee per package + exact values -----------
alter table public.membership_plans add column if not exists registration_fee numeric(12,2) not null default 0;

update public.membership_plans set duration_months=1,  total_price=3500,  registration_fee=3000, saving_amount=0,    monthly_fee=3500  where name='Monthly';
update public.membership_plans set duration_months=3,  total_price=9000,  registration_fee=2000, saving_amount=1500, monthly_fee=9000  where name='3 Months';
update public.membership_plans set duration_months=6,  total_price=18000, registration_fee=1500, saving_amount=3000, monthly_fee=18000 where name='6 Months';
update public.membership_plans set duration_months=12, total_price=36000, registration_fee=0,    saving_amount=6000, monthly_fee=36000 where name='Yearly';

-- B) SERVICES: hide package components from the optional-services checklist ---
--    (Registration + Monthly Fee are part of the package, not optional add-ons)
update public.services set is_active = false where category in ('registration', 'membership');

-- C) MEMBERS: billing snapshot columns ---------------------------------------
alter table public.members add column if not exists registration_fee numeric(12,2) not null default 0;
alter table public.members add column if not exists package_fee      numeric(12,2) not null default 0;
alter table public.members add column if not exists services_total    numeric(12,2) not null default 0;
alter table public.members add column if not exists gross_payable     numeric(12,2) not null default 0;

-- Backfill existing members (full price; auto-corrected to offer pricing on next save).
update public.members m
set
  registration_fee = coalesce(p.registration_fee, 0),
  package_fee      = coalesce(p.total_price, 0),
  services_total   = coalesce(ms.svc_total, 0),
  gross_payable    = coalesce(p.registration_fee, 0) + coalesce(p.total_price, 0) + coalesce(ms.svc_total, 0)
from public.members mx
left join public.membership_plans p on p.id = mx.plan_id
left join (
  select member_id, sum(price) as svc_total from public.member_services group by member_id
) ms on ms.member_id = mx.id
where m.id = mx.id;

-- D) MEMBER_BILLING — the single receivable per member -----------------------
create or replace view public.member_billing as
select
  m.id as member_id,
  m.registration_number,
  m.full_name,
  m.phone,
  m.status as member_status,
  m.offer_code,
  m.plan_id,
  p.name as package_name,
  p.duration_months,
  coalesce(m.registration_fee, 0) as registration_fee,
  coalesce(m.package_fee, 0)      as package_fee,
  coalesce(m.services_total, 0)   as services_total,
  coalesce(m.gross_payable, 0)    as gross_payable,
  coalesce(pay.total_discount, 0) as discount,
  greatest(coalesce(m.gross_payable, 0) - coalesce(pay.total_discount, 0), 0) as net_payable,
  coalesce(pay.total_paid, 0)     as paid,
  greatest(coalesce(m.gross_payable, 0) - coalesce(pay.total_discount, 0) - coalesce(pay.total_paid, 0), 0) as receivable,
  pay.last_payment_date,
  case
    when coalesce(m.gross_payable, 0) <= 0 then 'none'
    when greatest(coalesce(m.gross_payable,0) - coalesce(pay.total_discount,0) - coalesce(pay.total_paid,0), 0) <= 0 then 'paid'
    when coalesce(pay.total_paid, 0) > 0 then 'partial'
    else 'due'
  end as status
from public.members m
left join public.membership_plans p on p.id = m.plan_id
left join (
  select member_id,
         sum(amount)       as total_paid,
         sum(discount)     as total_discount,
         max(payment_date) as last_payment_date
  from public.payments
  where status = 'completed'
  group by member_id
) pay on pay.member_id = m.id;

-- E) RECEIPT_DETAILS — member-level billing breakdown ------------------------
drop view if exists public.receipt_details;
create view public.receipt_details as
select
  p.id, p.receipt_number, p.payment_date, p.payment_month,
  p.amount, p.penalty_amount, coalesce(p.discount, 0) as discount,
  coalesce(p.advance_added, 0) as advance_added, coalesce(p.advance_applied, 0) as advance_applied,
  coalesce(p.cash_received, p.amount + p.penalty_amount) as cash_received,
  (p.amount + p.penalty_amount) as total_paid,
  p.payment_method, p.notes, p.receipt_image_url, p.status, p.created_at,
  m.id as member_id, m.registration_number, m.full_name as member_name,
  m.phone as member_phone, m.email as member_email,
  coalesce(m.advance_balance, 0) as advance_balance,
  coalesce(m.registration_fee, 0) as registration_fee,
  coalesce(m.package_fee, 0)      as package_fee,
  coalesce(m.services_total, 0)   as services_total,
  coalesce(m.gross_payable, 0)    as gross_payable,
  pl.name as package_name,
  coalesce(pl.saving_amount, 0)   as package_saving,
  coalesce((select sum(x.discount) from public.payments x where x.member_id = m.id and x.status='completed'), 0) as total_discount,
  greatest(coalesce(m.gross_payable,0) - coalesce((select sum(x.discount) from public.payments x where x.member_id=m.id and x.status='completed'),0), 0) as net_payable,
  coalesce((select sum(x.amount) from public.payments x where x.member_id = m.id and x.status='completed'), 0) as member_paid,
  greatest(
    coalesce(m.gross_payable,0)
    - coalesce((select sum(x.discount) from public.payments x where x.member_id=m.id and x.status='completed'),0)
    - coalesce((select sum(x.amount)   from public.payments x where x.member_id=m.id and x.status='completed'),0), 0
  ) as balance_due
from public.payments p
join public.members m on m.id = p.member_id
left join public.membership_plans pl on pl.id = m.plan_id;

-- F) DASHBOARD: pending dues from the new member-level receivable ------------
create or replace function public.dashboard_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total_members', (select count(*) from public.members where status = 'active'),
    'paid_this_month', (
      select coalesce(sum(cash_received), 0) from public.payments
      where status = 'completed'
        and date_trunc('month', payment_date) = date_trunc('month', current_date)
    ),
    'pending_dues', (select coalesce(sum(receivable), 0) from public.member_billing where receivable > 0),
    'overdue_amount', (select coalesce(sum(receivable), 0) from public.member_billing where receivable > 0 and status = 'partial'),
    'penalties_collected', (select coalesce(sum(penalty_amount), 0) from public.payments where status = 'completed'),
    'overdue_count', (select count(*) from public.member_billing where receivable > 0)
  );
$$;

-- ============================================================================
-- DONE. Existing members/payments preserved; receivables now use lump-sum
-- package + registration + optional services.
-- ============================================================================
