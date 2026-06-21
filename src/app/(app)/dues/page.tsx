import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatusBadge, EmptyRow } from '@/components/ui';
import { formatMoney, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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

  return (
    <div>
      <PageHeader
        title="Dues / Receivables"
        subtitle="Gross payable − discount = net payable; net − received = receivable."
      />

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
