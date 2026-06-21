import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader, StatusBadge, EmptyRow } from '@/components/ui';
import GenerateDuesForm from '@/components/GenerateDuesForm';
import { formatMoney, formatDate, monthLabel, monthInputValue } from '@/lib/utils';
import { waivePenalty } from './actions';

export const dynamic = 'force-dynamic';

export default async function DuesPage({
  searchParams,
}: {
  searchParams: { month?: string; status?: string; q?: string };
}) {
  const profile = await getProfile();
  const isAdmin = profile?.role === 'admin';
  const supabase = createClient();

  let query = supabase
    .from('due_details')
    .select('*')
    .order('due_date', { ascending: true });

  const month = searchParams.month?.trim();
  const status = searchParams.status?.trim();
  if (month) query = query.eq('billing_month', `${month}-01`);
  if (status && status !== 'all') query = query.eq('status', status);

  const { data } = await query;

  const q = searchParams.q?.trim()?.toLowerCase();
  const rows = (data ?? []).filter((d: any) =>
    q ? (d.member_name ?? '').toLowerCase().includes(q) : true
  );

  return (
    <div>
      <PageHeader title="Dues" subtitle="Member-wise monthly dues, balances and penalties." />

      {isAdmin && (
        <div className="mb-5">
          <GenerateDuesForm defaultMonth={monthInputValue()} />
        </div>
      )}

      <form className="mb-4 flex flex-wrap gap-3" method="get">
        <input
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="Search member…"
          className="input max-w-xs"
        />
        <input name="month" type="month" defaultValue={month ?? ''} className="input max-w-[180px]" />
        <select name="status" defaultValue={status ?? 'all'} className="input max-w-[160px]">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>
        <button className="btn-ghost">Filter</button>
      </form>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="th">Member</th>
                <th className="th">Month</th>
                <th className="th">Fee</th>
                <th className="th">Paid</th>
                <th className="th">Balance</th>
                <th className="th">Penalty due</th>
                <th className="th">Due date</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length > 0 ? (
                rows.map((d: any) => (
                  <tr key={d.id}>
                    <td className="td font-medium">{d.member_name}</td>
                    <td className="td">{monthLabel(d.billing_month)}</td>
                    <td className="td">{formatMoney(d.amount_due)}</td>
                    <td className="td">{formatMoney(d.amount_paid)}</td>
                    <td className="td">{formatMoney(d.balance)}</td>
                    <td className="td text-brand">
                      {d.penalty_waived ? (
                        <span className="text-xs text-neutral-400">waived</span>
                      ) : (
                        formatMoney(d.penalty_due)
                      )}
                    </td>
                    <td className="td">{formatDate(d.due_date)}</td>
                    <td className="td">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        {d.balance > 0 && (
                          <Link
                            href={`/payments/new?member=${d.member_id}`}
                            className="btn-ghost btn-sm"
                          >
                            Collect
                          </Link>
                        )}
                        {isAdmin && Number(d.penalty_due) > 0 && !d.penalty_waived && (
                          <form
                            action={waivePenalty.bind(
                              null,
                              d.id,
                              d.member_id,
                              Number(d.penalty_due)
                            )}
                          >
                            <button className="btn-sm rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                              Waive penalty
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={9} text="No dues found. Generate dues for a month to begin." />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
