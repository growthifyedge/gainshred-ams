import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatCard, StatusBadge, EmptyRow } from '@/components/ui';
import ExportCSV from '@/components/ExportCSV';
import {
  formatMoney,
  formatDate,
  formatTime,
  durationLabel,
  monthLabel,
  methodLabel,
  monthInputValue,
  todayInput,
} from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'collection', label: 'Monthly Collection' },
  { key: 'daily', label: 'Daily Collection' },
  { key: 'dues', label: 'Pending Dues' },
  { key: 'penalty', label: 'Penalties' },
  { key: 'advance', label: 'Advance Balance' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'history', label: 'Member History' },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { report?: string; month?: string; member?: string; date?: string };
}) {
  const report = searchParams.report ?? 'collection';
  const supabase = createClient();

  return (
    <div>
      <PageHeader title="Reports" subtitle="Collections, dues, penalties and member history." />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/reports?report=${t.key}`}
            className={
              report === t.key
                ? 'btn-primary btn-sm'
                : 'btn-ghost btn-sm'
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {report === 'collection' && <CollectionReport month={searchParams.month} supabase={supabase} />}
      {report === 'daily' && <DailyCollectionReport date={searchParams.date} supabase={supabase} />}
      {report === 'dues' && <DuesReport supabase={supabase} />}
      {report === 'penalty' && <PenaltyReport supabase={supabase} />}
      {report === 'advance' && <AdvanceReport supabase={supabase} />}
      {report === 'attendance' && <AttendanceReport date={searchParams.date} supabase={supabase} />}
      {report === 'history' && (
        <HistoryReport memberId={searchParams.member} supabase={supabase} />
      )}
    </div>
  );
}

/* --------------------------- Daily collection ------------------------------ */
async function DailyCollectionReport({ date, supabase }: { date?: string; supabase: any }) {
  const d = date || todayInput();

  const { data } = await supabase
    .from('payments')
    .select(
      'receipt_number, payment_date, amount, penalty_amount, advance_added, advance_applied, cash_received, payment_method, member:members(full_name)'
    )
    .eq('payment_date', d)
    .eq('status', 'completed')
    .order('receipt_number');

  const rows = (data ?? []).map((p: any) => ({
    receipt: p.receipt_number,
    member: p.member?.full_name ?? '',
    fee: p.amount,
    penalty: p.penalty_amount,
    advance_added: p.advance_added,
    advance_applied: p.advance_applied,
    cash: p.cash_received,
    method: methodLabel(p.payment_method),
  }));
  const totalCash = rows.reduce((s: number, r: any) => s + Number(r.cash), 0);

  return (
    <div>
      <form className="mb-4 flex items-end gap-3" method="get">
        <input type="hidden" name="report" value="daily" />
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" defaultValue={d} className="input max-w-[180px]" />
        </div>
        <button className="btn-ghost">View</button>
        <div className="ml-auto">
          <ExportCSV rows={rows} filename={`daily-collection-${d}.csv`} />
        </div>
      </form>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={`Cash collected on ${formatDate(d)}`} value={formatMoney(totalCash)} accent="green" />
        <StatCard label="Payments" value={String(rows.length)} />
      </div>

      <ReportTable
        headers={['Receipt', 'Member', 'Fee', 'Penalty', 'Adv. added', 'Adv. applied', 'Cash', 'Method']}
        empty="No payments on this date."
        rows={rows.map((r: any) => [
          r.receipt,
          r.member,
          formatMoney(r.fee),
          formatMoney(r.penalty),
          formatMoney(r.advance_added),
          formatMoney(r.advance_applied),
          formatMoney(r.cash),
          r.method,
        ])}
      />
    </div>
  );
}

/* ----------------------------- Advance balance ----------------------------- */
async function AdvanceReport({ supabase }: { supabase: any }) {
  const { data } = await supabase
    .from('members')
    .select('full_name, phone, status, advance_balance')
    .gt('advance_balance', 0)
    .order('advance_balance', { ascending: false });

  const rows = (data ?? []).map((m: any) => ({
    member: m.full_name,
    phone: m.phone ?? '',
    status: m.status,
    advance_balance: m.advance_balance,
  }));
  const total = rows.reduce((s: number, r: any) => s + Number(r.advance_balance), 0);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Total advance held" value={formatMoney(total)} accent="green" />
          <StatCard label="Members with advance" value={String(rows.length)} />
        </div>
        <ExportCSV rows={rows} filename="advance-balances.csv" />
      </div>

      <ReportTable
        headers={['Member', 'Phone', 'Status', 'Advance balance']}
        empty="No members hold an advance balance."
        rows={rows.map((r: any) => [
          r.member,
          r.phone,
          <StatusBadge key="s" status={r.status} />,
          formatMoney(r.advance_balance),
        ])}
      />
    </div>
  );
}

/* ------------------------------- Attendance -------------------------------- */
async function AttendanceReport({ date, supabase }: { date?: string; supabase: any }) {
  const d = date || todayInput();

  const { data } = await supabase
    .from('attendance')
    .select('check_in_at, check_out_at, status, member:members(full_name, phone)')
    .eq('date', d)
    .order('check_in_at', { ascending: true });

  const rows = (data ?? []).map((a: any) => ({
    member: a.member?.full_name ?? '',
    phone: a.member?.phone ?? '',
    check_in: a.check_in_at,
    check_out: a.check_out_at,
    duration: durationLabel(a.check_in_at, a.check_out_at),
    status: a.status,
  }));

  return (
    <div>
      <form className="mb-4 flex items-end gap-3" method="get">
        <input type="hidden" name="report" value="attendance" />
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" defaultValue={d} className="input max-w-[180px]" />
        </div>
        <button className="btn-ghost">View</button>
        <div className="ml-auto">
          <ExportCSV
            rows={rows.map((r: any) => ({
              member: r.member,
              phone: r.phone,
              check_in: r.check_in,
              check_out: r.check_out,
              duration: r.duration,
              status: r.status,
            }))}
            filename={`attendance-${d}.csv`}
          />
        </div>
      </form>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={`Visits on ${formatDate(d)}`} value={String(rows.length)} />
        <StatCard
          label="Still inside"
          value={String(rows.filter((r: any) => r.status === 'inside').length)}
          accent="green"
        />
      </div>

      <ReportTable
        headers={['Member', 'Phone', 'Check in', 'Check out', 'Duration', 'Status']}
        empty="No attendance on this date."
        rows={rows.map((r: any) => [
          r.member,
          r.phone,
          formatTime(r.check_in),
          r.check_out ? formatTime(r.check_out) : '—',
          r.duration,
          <StatusBadge key="s" status={r.status} />,
        ])}
      />
    </div>
  );
}

/* ---------------------------- Monthly collection ---------------------------- */
async function CollectionReport({ month, supabase }: { month?: string; supabase: any }) {
  const m = month || monthInputValue();
  const start = `${m}-01`;
  const end = nextMonth(m);

  const { data } = await supabase
    .from('payments')
    .select(
      'receipt_number, payment_date, amount, penalty_amount, payment_method, status, member:members(full_name)'
    )
    .gte('payment_date', start)
    .lt('payment_date', end)
    .eq('status', 'completed')
    .order('payment_date');

  const rows = (data ?? []).map((p: any) => ({
    receipt: p.receipt_number,
    member: p.member?.full_name ?? '',
    date: p.payment_date,
    fee: p.amount,
    penalty: p.penalty_amount,
    method: methodLabel(p.payment_method),
    total: Number(p.amount) + Number(p.penalty_amount),
  }));
  const total = rows.reduce((s: number, r: any) => s + r.total, 0);

  return (
    <div>
      <form className="mb-4 flex items-end gap-3" method="get">
        <input type="hidden" name="report" value="collection" />
        <div>
          <label className="label">Month</label>
          <input name="month" type="month" defaultValue={m} className="input max-w-[180px]" />
        </div>
        <button className="btn-ghost">View</button>
        <div className="ml-auto">
          <ExportCSV rows={rows} filename={`collection-${m}.csv`} />
        </div>
      </form>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={`Collected in ${monthLabel(start)}`} value={formatMoney(total)} accent="green" />
        <StatCard label="Payments" value={String(rows.length)} />
      </div>

      <ReportTable
        headers={['Receipt', 'Member', 'Date', 'Fee', 'Penalty', 'Method', 'Total']}
        empty="No payments in this month."
        rows={rows.map((r: any) => [
          r.receipt,
          r.member,
          formatDate(r.date),
          formatMoney(r.fee),
          formatMoney(r.penalty),
          r.method,
          formatMoney(r.total),
        ])}
      />
    </div>
  );
}

/* --------------------------- Pending dues / receivables --------------------- */
async function DuesReport({ supabase }: { supabase: any }) {
  const { data } = await supabase
    .from('member_billing')
    .select('registration_number, full_name, package_name, gross_payable, discount, net_payable, paid, receivable, status')
    .gt('gross_payable', 0)
    .order('receivable', { ascending: false });

  const rows = (data ?? []).map((d: any) => ({
    reg: d.registration_number ?? '',
    member: d.full_name,
    package: d.package_name ?? '',
    gross: d.gross_payable,
    discount: d.discount,
    net: d.net_payable,
    paid: d.paid,
    receivable: d.receivable,
    status: d.status,
  }));
  const totalReceivable = rows.reduce((s: number, r: any) => s + Number(r.receivable), 0);
  const totalNet = rows.reduce((s: number, r: any) => s + Number(r.net), 0);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Total net payable" value={formatMoney(totalNet)} accent="amber" />
          <StatCard label="Total receivable / due" value={formatMoney(totalReceivable)} accent="red" />
        </div>
        <ExportCSV rows={rows} filename="pending-dues.csv" />
      </div>

      <ReportTable
        headers={['Reg #', 'Member', 'Package', 'Gross', 'Discount', 'Net', 'Paid', 'Receivable', 'Status']}
        empty="No outstanding receivables. 🎉"
        rows={rows.map((r: any) => [
          r.reg,
          r.member,
          r.package,
          formatMoney(r.gross),
          formatMoney(r.discount),
          formatMoney(r.net),
          formatMoney(r.paid),
          formatMoney(r.receivable),
          <StatusBadge key="s" status={r.status === 'due' ? 'pending' : r.status} />,
        ])}
      />
    </div>
  );
}

/* -------------------------------- Penalties -------------------------------- */
async function PenaltyReport({ supabase }: { supabase: any }) {
  const [{ data: collected }, { data: waived }, { data: outstanding }] = await Promise.all([
    supabase.from('payments').select('penalty_amount').eq('status', 'completed'),
    supabase.from('penalties').select('amount').eq('type', 'waiver'),
    supabase.from('due_details').select('*').gt('penalty_due', 0),
  ]);

  const totalCollected = (collected ?? []).reduce(
    (s: number, r: any) => s + Number(r.penalty_amount),
    0
  );
  const totalWaived = (waived ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const totalOutstanding = (outstanding ?? []).reduce(
    (s: number, r: any) => s + Number(r.penalty_due),
    0
  );

  const rows = (outstanding ?? []).map((d: any) => ({
    member: d.member_name,
    month: monthLabel(d.billing_month),
    due_date: d.due_date,
    penalty_due: d.penalty_due,
  }));

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Penalties collected" value={formatMoney(totalCollected)} accent="green" />
          <StatCard label="Penalties waived" value={formatMoney(totalWaived)} />
          <StatCard label="Penalties outstanding" value={formatMoney(totalOutstanding)} accent="red" />
        </div>
        <ExportCSV rows={rows} filename="penalties-outstanding.csv" />
      </div>

      <h3 className="mb-2 text-sm font-semibold text-neutral-600">Outstanding penalties</h3>
      <ReportTable
        headers={['Member', 'Month', 'Due date', 'Penalty due']}
        empty="No outstanding penalties."
        rows={rows.map((r: any) => [
          r.member,
          r.month,
          formatDate(r.due_date),
          formatMoney(r.penalty_due),
        ])}
      />
    </div>
  );
}

/* ----------------------------- Member history ------------------------------ */
async function HistoryReport({ memberId, supabase }: { memberId?: string; supabase: any }) {
  const { data: members } = await supabase
    .from('members')
    .select('id, full_name')
    .order('full_name');

  let rows: any[] = [];
  if (memberId) {
    const { data } = await supabase
      .from('payments')
      .select('receipt_number, payment_month, payment_date, amount, penalty_amount, payment_method, status')
      .eq('member_id', memberId)
      .order('payment_date', { ascending: false });
    rows = (data ?? []).map((p: any) => ({
      receipt: p.receipt_number,
      month: monthLabel(p.payment_month),
      date: p.payment_date,
      fee: p.amount,
      penalty: p.penalty_amount,
      method: methodLabel(p.payment_method),
      status: p.status,
    }));
  }

  return (
    <div>
      <form className="mb-4 flex items-end gap-3" method="get">
        <input type="hidden" name="report" value="history" />
        <div>
          <label className="label">Member</label>
          <select name="member" defaultValue={memberId ?? ''} className="input max-w-xs">
            <option value="">— Select member —</option>
            {(members ?? []).map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-ghost">View</button>
        <div className="ml-auto">
          <ExportCSV rows={rows} filename="member-history.csv" />
        </div>
      </form>

      <ReportTable
        headers={['Receipt', 'Month', 'Date', 'Fee', 'Penalty', 'Method', 'Status']}
        empty={memberId ? 'No payments for this member.' : 'Select a member to view history.'}
        rows={rows.map((r: any) => [
          r.receipt,
          r.month,
          formatDate(r.date),
          formatMoney(r.fee),
          formatMoney(r.penalty),
          r.method,
          <StatusBadge key="s" status={r.status} />,
        ])}
      />
    </div>
  );
}

/* ------------------------------- Shared table ------------------------------- */
function ReportTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length > 0 ? (
              rows.map((cells, i) => (
                <tr key={i}>
                  {cells.map((c, j) => (
                    <td key={j} className="td">
                      {c}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <EmptyRow colSpan={headers.length} text={empty} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function nextMonth(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(y, mm, 1); // mm is 1-based -> this is the 1st of next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
