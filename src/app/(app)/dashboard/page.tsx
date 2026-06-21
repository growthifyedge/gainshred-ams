import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatCard, StatusBadge, EmptyRow } from '@/components/ui';
import { formatMoney, formatDate, formatTime, monthLabel, methodLabel, todayInput } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Stats = {
  total_members: number;
  paid_this_month: number;
  pending_dues: number;
  overdue_amount: number;
  penalties_collected: number;
  overdue_count: number;
};

export default async function DashboardPage() {
  const supabase = createClient();

  const [
    { data: statsRaw },
    { data: recent },
    { data: overdue },
    { count: insideCount },
    { count: checkinsToday },
    { data: insideList },
  ] = await Promise.all([
    supabase.rpc('dashboard_stats'),
    supabase
      .from('payments')
      .select(
        'id, receipt_number, payment_date, amount, penalty_amount, payment_method, status, member:members(full_name)'
      )
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('due_details')
      .select('id, member_name, billing_month, balance, penalty_due, due_date')
      .gt('balance', 0)
      .lt('due_date', todayInput())
      .order('due_date', { ascending: true })
      .limit(10),
    supabase.from('attendance').select('*', { count: 'exact', head: true }).is('check_out_at', null),
    supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', todayInput()),
    supabase
      .from('member_attendance_status')
      .select('full_name, check_in_at')
      .eq('presence', 'inside')
      .order('check_in_at', { ascending: true })
      .limit(8),
  ]);

  const stats: Stats = (statsRaw as Stats) ?? {
    total_members: 0,
    paid_this_month: 0,
    pending_dues: 0,
    overdue_amount: 0,
    penalties_collected: 0,
    overdue_count: 0,
  };

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of members, collections and dues." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Active Members" value={String(stats.total_members)} />
        <StatCard
          label="Paid This Month"
          value={formatMoney(stats.paid_this_month)}
          accent="green"
        />
        <StatCard label="Pending Dues" value={formatMoney(stats.pending_dues)} accent="amber" />
        <StatCard
          label="Overdue Amount"
          value={formatMoney(stats.overdue_amount)}
          accent="red"
        />
        <StatCard
          label="Penalties Collected"
          value={formatMoney(stats.penalties_collected)}
        />
        <StatCard label="Overdue Members" value={String(stats.overdue_count)} accent="red" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Recent payments */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <h2 className="font-semibold">Recent Payments</h2>
            <Link href="/payments" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="th">Receipt</th>
                  <th className="th">Member</th>
                  <th className="th">Amount</th>
                  <th className="th">Method</th>
                  <th className="th">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {recent && recent.length > 0 ? (
                  recent.map((p: any) => (
                    <tr key={p.id}>
                      <td className="td">
                        <Link
                          href={`/receipt/${p.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {p.receipt_number}
                        </Link>
                      </td>
                      <td className="td">{p.member?.full_name ?? '—'}</td>
                      <td className="td">{formatMoney(p.amount + p.penalty_amount)}</td>
                      <td className="td">{methodLabel(p.payment_method)}</td>
                      <td className="td">{formatDate(p.payment_date)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={5} text="No payments recorded yet." />
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Overdue members */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <h2 className="font-semibold">Members With Overdue Payments</h2>
            <Link href="/dues?status=overdue" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="th">Member</th>
                  <th className="th">Month</th>
                  <th className="th">Balance</th>
                  <th className="th">Penalty</th>
                  <th className="th">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {overdue && overdue.length > 0 ? (
                  overdue.map((d: any) => (
                    <tr key={d.id}>
                      <td className="td font-medium">{d.member_name}</td>
                      <td className="td">{monthLabel(d.billing_month)}</td>
                      <td className="td">{formatMoney(d.balance)}</td>
                      <td className="td text-brand">{formatMoney(d.penalty_due)}</td>
                      <td className="td">{formatDate(d.due_date)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={5} text="No overdue payments. 🎉" />
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Attendance widgets */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Attendance</h2>
          <Link href="/attendance" className="text-sm font-medium text-brand hover:underline">
            Open attendance
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Currently Inside" value={String(insideCount ?? 0)} accent="green" />
          <StatCard label="Check-ins Today" value={String(checkinsToday ?? 0)} />
          <div className="card overflow-hidden">
            <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
              Inside now
            </div>
            <ul className="divide-y divide-neutral-100">
              {insideList && insideList.length > 0 ? (
                insideList.map((m: any, i: number) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="font-medium">{m.full_name}</span>
                    <span className="text-neutral-400">{formatTime(m.check_in_at)}</span>
                  </li>
                ))
              ) : (
                <li className="px-4 py-6 text-center text-sm text-neutral-400">Nobody inside.</li>
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
