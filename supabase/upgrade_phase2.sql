-- ============================================================================
-- GainShred AMS — PHASE 2 upgrade
-- Adds: Attendance module + Advance payments (member advance balance).
-- ----------------------------------------------------------------------------
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Safe & idempotent: run it once on your EXISTING database. It only ADDs
-- columns/tables ("if not exists") and safely recreates two views + a function.
-- No table or row data is ever dropped.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) MEMBERS — advance balance
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists advance_balance numeric(12,2) not null default 0;

-- ---------------------------------------------------------------------------
-- B) PAYMENTS — advance support
--    amount          = applied to the month's fee (source can be cash or advance)
--    advance_added   = NEW money received and stored as advance
--    advance_applied = portion of `amount` paid FROM existing advance balance
--    cash_received   = real cash in this txn (generated, never inserted directly)
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists advance_added numeric(12,2) not null default 0 check (advance_added >= 0);
alter table public.payments
  add column if not exists advance_applied numeric(12,2) not null default 0 check (advance_applied >= 0);
alter table public.payments
  add column if not exists cash_received numeric(12,2)
  generated always as ((amount - advance_applied) + penalty_amount + advance_added) stored;

-- Keep members.advance_balance in sync with completed payments.
-- SECURITY DEFINER so staff (who cannot write members directly) can still trigger it.
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
      -- payment voided: reverse its advance effect
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

-- ---------------------------------------------------------------------------
-- C) ATTENDANCE
-- ---------------------------------------------------------------------------
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

-- A member can have at most ONE open (not-yet-checked-out) session.
-- This prevents duplicate check-ins at the database level.
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

-- Each member with their live presence (inside/outside).
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

-- ---------------------------------------------------------------------------
-- D) VIEWS / FUNCTIONS that now expose advance info
-- ---------------------------------------------------------------------------

-- Receipt now includes advance added/applied, real cash, and live balance.
-- DROP first: the column ORDER changes, and CREATE OR REPLACE VIEW cannot
-- reorder existing columns. Dropping a view loses no data (views store none).
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

-- Dashboard "paid this month" now reflects real cash received (advance-aware).
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

-- ============================================================================
-- DONE. No existing data is modified except new columns default to 0.
-- ============================================================================
