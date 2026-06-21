import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader, StatusBadge, EmptyRow } from '@/components/ui';
import ConfirmSubmit from '@/components/ConfirmSubmit';
import { formatMoney, formatDate, monthLabel, methodLabel } from '@/lib/utils';
import { voidPayment } from './actions';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { q?: string; method?: string; status?: string };
}) {
  const profile = await getProfile();
  const isAdmin = profile?.role === 'admin';
  const supabase = createClient();

  let query = supabase
    .from('payments')
    .select(
      'id, receipt_number, payment_month, payment_date, amount, penalty_amount, payment_method, status, member:members(full_name)'
    )
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const method = searchParams.method?.trim();
  const status = searchParams.status?.trim();
  if (method && method !== 'all') query = query.eq('payment_method', method);
  if (status && status !== 'all') query = query.eq('status', status);

  const { data: payments } = await query;

  // Free-text filter on member name (client-side, since it's an embedded relation).
  const q = searchParams.q?.trim()?.toLowerCase();
  const rows = (payments ?? []).filter((p: any) =>
    q ? (p.member?.full_name ?? '').toLowerCase().includes(q) : true
  );

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="All recorded payments and receipts."
        action={
          <Link href="/payments/new" className="btn-primary">
            + Add Payment
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap gap-3" method="get">
        <input
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="Search member…"
          className="input max-w-xs"
        />
        <select name="method" defaultValue={method ?? 'all'} className="input max-w-[170px]">
          <option value="all">All methods</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="easypaisa">Easypaisa</option>
          <option value="jazzcash">JazzCash</option>
          <option value="card">Card</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <select name="status" defaultValue={status ?? 'all'} className="input max-w-[150px]">
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="void">Void</option>
        </select>
        <button className="btn-ghost">Filter</button>
      </form>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="th">Receipt</th>
                <th className="th">Member</th>
                <th className="th">Month</th>
                <th className="th">Fee</th>
                <th className="th">Penalty</th>
                <th className="th">Method</th>
                <th className="th">Date</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length > 0 ? (
                rows.map((p: any) => (
                  <tr key={p.id} className={p.status === 'void' ? 'opacity-60' : ''}>
                    <td className="td font-medium">{p.receipt_number}</td>
                    <td className="td">{p.member?.full_name ?? '—'}</td>
                    <td className="td">{monthLabel(p.payment_month)}</td>
                    <td className="td">{formatMoney(p.amount)}</td>
                    <td className="td">{formatMoney(p.penalty_amount)}</td>
                    <td className="td">{methodLabel(p.payment_method)}</td>
                    <td className="td">{formatDate(p.payment_date)}</td>
                    <td className="td">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/receipt/${p.id}`} className="btn-ghost btn-sm">
                          Receipt
                        </Link>
                        {isAdmin && p.status === 'completed' && (
                          <form action={voidPayment.bind(null, p.id)}>
                            <ConfirmSubmit
                              message="Void this payment? It will be kept in history but marked cancelled."
                              className="btn-sm rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-red-50"
                            >
                              Void
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={9} text="No payments found." />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
