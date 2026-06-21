-- ============================================================================
-- OPTIONAL sample data for GainShred AMS.
-- Run AFTER schema.sql. Safe to skip if you want to start empty.
-- ============================================================================

-- Membership plans -----------------------------------------------------------
insert into public.membership_plans (name, monthly_fee, description)
select * from (values
  ('Basic',    3000, 'Gym floor access'),
  ('Standard', 5000, 'Gym + group classes'),
  ('Premium',  8000, 'Gym + classes + personal trainer')
) as v(name, monthly_fee, description)
where not exists (select 1 from public.membership_plans);

-- Sample members (linked to the Standard plan) -------------------------------
insert into public.members (full_name, phone, email, joining_date, plan_id, monthly_fee, due_day, status)
select 'Ali Khan',    '03001234567', 'ali@example.com',   current_date - 90, p.id, 5000, 5,  'active'
from public.membership_plans p where p.name = 'Standard'
and not exists (select 1 from public.members where full_name = 'Ali Khan');

insert into public.members (full_name, phone, email, joining_date, plan_id, monthly_fee, due_day, status)
select 'Sara Ahmed',  '03007654321', 'sara@example.com',  current_date - 45, p.id, 8000, 10, 'active'
from public.membership_plans p where p.name = 'Premium'
and not exists (select 1 from public.members where full_name = 'Sara Ahmed');

insert into public.members (full_name, phone, email, joining_date, plan_id, monthly_fee, due_day, status)
select 'Bilal Raza',  '03009998877', 'bilal@example.com', current_date - 20, p.id, 3000, 1,  'active'
from public.membership_plans p where p.name = 'Basic'
and not exists (select 1 from public.members where full_name = 'Bilal Raza');

-- Generate dues for the current month so the dashboard has data ---------------
select public.generate_dues_for_month(current_date);

-- Example penalty rule: Rs. 500 fixed after a 3-day grace period.
update public.settings
set penalty_type = 'fixed', penalty_fixed = 500, penalty_grace_days = 3
where id = 1;
