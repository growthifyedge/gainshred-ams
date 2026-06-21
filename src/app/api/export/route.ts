import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { toCSV, getKarachiDate, formatKarachiDateTime, methodLabel } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Rows = Array<Record<string, unknown>>;

function csvFile(filename: string, csv: string) {
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function membersRows(supabase: any): Promise<Rows> {
  // Rich select; fall back if newer columns aren't migrated yet.
  const rich =
    'registration_number, full_name, phone, email, joining_date, status, monthly_fee, due_day, advance_balance, age, offer_code, plan:membership_plans(name)';
  let res = await supabase.from('members').select(rich).order('full_name');
  if (res.error) {
    res = await supabase
      .from('members')
      .select('full_name, phone, email, joining_date, status, monthly_fee, due_day, advance_balance, plan:membership_plans(name)')
      .order('full_name');
  }
  return (res.data ?? []).map((m: any) => ({
    registration_number: m.registration_number ?? '',
    full_name: m.full_name,
    phone: m.phone ?? '',
    email: m.email ?? '',
    plan: m.plan?.name ?? '',
    monthly_fee: m.monthly_fee,
    due_day: m.due_day,
    age: m.age ?? '',
    offer: m.offer_code ?? '',
    advance_balance: m.advance_balance ?? 0,
    status: m.status,
    joining_date: m.joining_date,
  }));
}

async function plansRows(supabase: any): Promise<Rows> {
  const rich = 'name, monthly_fee, duration_months, advance_amount, total_price, saving_amount, description, is_active';
  let res = await supabase.from('membership_plans').select(rich).order('monthly_fee');
  if (res.error) {
    res = await supabase
      .from('membership_plans')
      .select('name, monthly_fee, description, is_active')
      .order('monthly_fee');
  }
  return res.data ?? [];
}

async function paymentsRows(supabase: any, from?: string, to?: string): Promise<Rows> {
  let q = supabase
    .from('payments')
    .select(
      'receipt_number, payment_date, payment_month, member:members(full_name, registration_number), amount, penalty_amount, discount, advance_added, advance_applied, cash_received, payment_method, status'
    )
    .order('payment_date', { ascending: false });
  if (from) q = q.gte('payment_date', from);
  if (to) q = q.lte('payment_date', to);
  const { data } = await q;
  return (data ?? []).map((p: any) => ({
    registration_number: p.member?.registration_number ?? '',
    member: p.member?.full_name ?? '',
    receipt_number: p.receipt_number,
    payment_date: p.payment_date,
    payment_month: p.payment_month,
    fee: p.amount,
    penalty: p.penalty_amount,
    discount: p.discount ?? 0,
    advance_added: p.advance_added ?? 0,
    advance_applied: p.advance_applied ?? 0,
    cash_received: p.cash_received ?? p.amount + p.penalty_amount,
    method: methodLabel(p.payment_method),
    status: p.status,
  }));
}

async function duesRows(supabase: any): Promise<Rows> {
  const { data } = await supabase
    .from('due_details')
    .select(
      'registration_number, member_name, billing_month, gross_payable, discount, net_payable, amount_paid, balance, penalty_due, due_date, status, last_payment_date'
    )
    .order('due_date', { ascending: true });
  return (data ?? []).map((d: any) => ({
    registration_number: d.registration_number ?? '',
    member: d.member_name,
    month: d.billing_month,
    gross_payable: d.gross_payable,
    discount: d.discount,
    net_payable: d.net_payable,
    paid: d.amount_paid,
    receivable: d.balance,
    penalty_due: d.penalty_due,
    due_date: d.due_date,
    status: d.status,
    last_payment_date: d.last_payment_date ?? '',
  }));
}

async function admissionRows(supabase: any): Promise<Rows> {
  const [{ data }, { data: svcCatalog }] = await Promise.all([
    supabase
      .from('admission_requests')
      .select(
        'status, full_name, phone, email, age, gender, offer_code, preferred_joining_date, notes, created_at, converted_member_id, selected_services, plan:membership_plans(name)'
      )
      .order('created_at', { ascending: false }),
    supabase.from('services').select('id, name'),
  ]);

  const svcName: Record<string, string> = Object.fromEntries(
    (svcCatalog ?? []).map((s: any) => [s.id, s.name])
  );
  const convertedIds = [
    ...new Set((data ?? []).map((r: any) => r.converted_member_id).filter(Boolean)),
  ];
  let regMap: Record<string, string> = {};
  if (convertedIds.length) {
    const { data: ms } = await supabase
      .from('members')
      .select('id, registration_number')
      .in('id', convertedIds);
    regMap = Object.fromEntries((ms ?? []).map((m: any) => [m.id, m.registration_number]));
  }

  return (data ?? []).map((r: any) => ({
    status: r.status,
    full_name: r.full_name,
    phone: r.phone ?? '',
    email: r.email ?? '',
    age: r.age ?? '',
    gender: r.gender ?? '',
    plan: r.plan?.name ?? '',
    services: Array.isArray(r.selected_services)
      ? r.selected_services.map((id: string) => svcName[id] ?? id).join('; ')
      : '',
    offer: r.offer_code ?? '',
    preferred_joining_date: r.preferred_joining_date ?? '',
    converted_reg: r.converted_member_id ? regMap[r.converted_member_id] ?? '' : '',
    created_at: formatKarachiDateTime(r.created_at),
  }));
}

async function attendanceRows(supabase: any, from?: string, to?: string): Promise<Rows> {
  let q = supabase
    .from('attendance')
    .select('date, member:members(full_name, phone), check_in_at, check_out_at, status')
    .order('check_in_at', { ascending: false });
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  const { data } = await q;
  return (data ?? []).map((a: any) => ({
    date: a.date,
    member: a.member?.full_name ?? '',
    phone: a.member?.phone ?? '',
    check_in: formatKarachiDateTime(a.check_in_at),
    check_out: a.check_out_at ? formatKarachiDateTime(a.check_out_at) : '',
    status: a.status,
  }));
}

async function getRows(supabase: any, type: string, from?: string, to?: string): Promise<Rows> {
  switch (type) {
    case 'members':
      return membersRows(supabase);
    case 'membership_plans':
    case 'plans':
      return plansRows(supabase);
    case 'payments':
      return paymentsRows(supabase, from, to);
    case 'dues':
      return duesRows(supabase);
    case 'attendance':
      return attendanceRows(supabase, from, to);
    case 'admission_requests':
    case 'admissions':
      return admissionRows(supabase);
    default:
      return [];
  }
}

export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (profile?.role !== 'admin') {
    return new Response('Forbidden — admin access only.', { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const type = sp.get('type') ?? 'members';
  const from = sp.get('from') || undefined;
  const to = sp.get('to') || undefined;

  const supabase = createClient();
  const date = getKarachiDate();

  // Full backup: one CSV file with every dataset, section by section.
  if (type === 'backup') {
    const sections: string[] = [];
    for (const t of ['members', 'membership_plans', 'payments', 'dues', 'attendance', 'admission_requests']) {
      const rows = await getRows(supabase, t, from, to);
      sections.push(`### ${t} (${rows.length} rows) ###`);
      sections.push(toCSV(rows));
      sections.push('');
    }
    await logAudit('export', 'backup', null, { date });
    return csvFile(`gainshred-backup-${date}.csv`, sections.join('\n'));
  }

  const rows = await getRows(supabase, type, from, to);
  await logAudit('export', type, null, { date, count: rows.length, from, to });
  return csvFile(`${type}-${date}.csv`, toCSV(rows));
}
