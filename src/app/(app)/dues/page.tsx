import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatusBadge, EmptyRow } from '@/components/ui';
import { formatMoney, formatDate, getKarachiDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Whole days from next_due_date up to today (both YYYY-MM-DD). Display-only.
function daysOverdue(nextDue: string, today: string): number {
  const a = Date.parse(`${nextDue}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const supabase = createClient();

  let query = supabase
    .from('member_billing')
    .select('*')
    .gt('gross_payable', 0)
    .order('receivable', { ascending: false });

  const status = searchParams.status?.trim();
  if (status && status !== 'all') query = query.eq('status', status);

  const { data } = await query;

  const q = searchParams.q?.trim()?.toLowerCase();
  const rows = (data ?? []).filter((d: any) =>
    q
      ? (d.full_name ?? '').toLowerCase().includes(q) ||
        (d.registration_number ?? '').toLowerCase().includes(q)
      : true
  );

  // Phase E (read-only): active members due for renewal by members.next_due_date.
  // status inactive excluded; null next_due_date excluded; next_due_date <= today.
  const today = getKarachiDate();
  const { data: renewalData } = await supabase
    .from('members')
    .select('id, registration_number, full_name, monthly_fee, next_due_date, plan:membership_plans(name)')
    .eq('status', 'active')
    .not('next_due_date', 'is', null)
    .lte('next_due_date', today)
    .order('next_due_date', { ascending: true });
  const renewalRows = renewalData ?? [];

  return (
    <div>
      <PageHeader
        title="Dues / Receivables"
        subtitle="Gross payable − discount = net payable; net − received = receivable."
      />

      {/* Phase E: renewal-due members (read-only, from members.next_due_date) */}
      <div className="mb-6 card overflow-hidden">
        <div className="border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-700">Renewal Due</h2>
          <p className="text-xs text-neutral-400">
            Active members whose next due date is today or earlier.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="th">Reg # / Member</th>
                <th className="th">Plan</th>
                <th className="th">Fee</th>
                <th className="th">Next Due Date</th>
                <th className="th">Days overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {renewalRows.length > 0 ? (
                renewalRows.map((r: any) => {
                  const overdue = daysOverdue(r.next_due_date, today);
                  return (
                    <tr key={r.id}>
                      <td className="td">
                        <div className="font-medium">{r.full_name}</div>
                        <div className="font-mono text-xs text-neutral-400">
                          {r.registration_number ?? '—'}
                        </div>
                      </td>
                      <td className="td">{r.plan?.name ?? '—'}</td>
                      <td className="td">{formatMoney(r.monthly_fee)}</td>
                      <td className="td">{formatDate(r.next_due_date)}</td>
                      <td className="td">
                        <span className="badge bg-red-100 text-brand">
                          {overdue === 0 ? 'Due today' : `${overdue} day${overdue === 1 ? '' : 's'}`}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <EmptyRow colSpan={5} text="No members are due for renewal right now." />
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form className="mb-4 flex flex-wrap gap-3" method="get">
        <input name="q" defaultValue={searchParams.q ?? ''} placeholder="Search name or GS-0001…" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? 'all'} className="input max-w-[160px]">
          <option value="all">All statuses</option>
          <option value="due">Due</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <button className="btn-ghost">Filter</button>
      </form>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="th">Reg # / Member</th>
                <th className="th">Package</th>
                <th className="th">Gross</th>
                <th className="th">Discount</th>
                <th className="th">Net payable</th>
                <th className="th">Received</th>
                <th className="th">Receivable / Due</th>
                <th className="th">Status</th>
                <th className="th">Last payment</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length > 0 ? (
                rows.map((d: any) => (
                  <tr key={d.member_id}>
                    <td className="td">
                      <div className="font-medium">{d.full_name}</div>
                      <div className="font-mono text-xs text-neutral-400">{d.registration_number ?? '—'}</div>
                    </td>
                    <td className="td">{d.package_name ?? '—'}</td>
                    <td className="td">{formatMoney(d.gross_payable)}</td>
                    <td className="td">{formatMoney(d.discount)}</td>
                    <td className="td">{formatMoney(d.net_payable)}</td>
                    <td className="td">{formatMoney(d.paid)}</td>
                    <td className="td font-semibold text-brand">{formatMoney(d.receivable)}</td>
                    <td className="td">
                      <StatusBadge status={d.status === 'due' ? 'pending' : d.status} />
                    </td>
                    <td className="td">{d.last_payment_date ? formatDate(d.last_payment_date) : '—'}</td>
                    <td className="td text-right">
                      {d.receivable > 0 && (
                        <Link href={`/payments/new?member=${d.member_id}`} className="btn-ghost btn-sm">
                          Collect
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={10} text="No receivables. Add a member with a package to begin." />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
