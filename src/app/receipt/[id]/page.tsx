import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import PrintButtons from '@/components/PrintButtons';
import { formatMoney, formatDate, monthLabel, methodLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) redirect('/login');

  const supabase = createClient();
  const [{ data: r }, { data: settings }] = await Promise.all([
    supabase.from('receipt_details').select('*').eq('id', params.id).single(),
    supabase.from('settings').select('*').eq('id', 1).single(),
  ]);

  if (!r) notFound();

  const gymName = settings?.gym_name ?? 'GainShred';

  return (
    <div className="min-h-screen bg-neutral-100 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <PrintButtons />

        <div className="print-area card overflow-hidden p-8">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-neutral-200 pb-5">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {gymName.toUpperCase().includes('GAIN') ? (
                  <>
                    GAIN<span className="text-brand">SHRED</span>
                  </>
                ) : (
                  gymName
                )}
              </h1>
              {settings?.gym_address && (
                <p className="text-sm text-neutral-500">{settings.gym_address}</p>
              )}
              {settings?.gym_phone && (
                <p className="text-sm text-neutral-500">{settings.gym_phone}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Receipt
              </p>
              <p className="font-mono text-sm font-bold">{r.receipt_number}</p>
              {r.status === 'void' && (
                <p className="mt-1 text-sm font-bold uppercase text-brand">VOID</p>
              )}
            </div>
          </div>

          {/* Member + meta */}
          <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-neutral-400">Member</p>
              <p className="font-semibold">{r.member_name}</p>
              {r.member_phone && <p className="text-neutral-500">{r.member_phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-neutral-400">Date</p>
              <p className="font-semibold">{formatDate(r.payment_date)}</p>
              <p className="mt-1 text-neutral-400">Payment month</p>
              <p className="font-semibold">{monthLabel(r.payment_month)}</p>
            </div>
          </div>

          {/* Breakdown */}
          <table className="mt-6 w-full text-sm">
            <tbody className="divide-y divide-neutral-200">
              <tr>
                <td className="py-2 text-neutral-600">Membership fee</td>
                <td className="py-2 text-right font-medium">{formatMoney(r.amount)}</td>
              </tr>
              {Number(r.penalty_amount) > 0 && (
                <tr>
                  <td className="py-2 text-neutral-600">Late payment penalty</td>
                  <td className="py-2 text-right font-medium">
                    {formatMoney(r.penalty_amount)}
                  </td>
                </tr>
              )}
              {Number(r.advance_applied) > 0 && (
                <tr>
                  <td className="py-2 text-neutral-600">Advance applied</td>
                  <td className="py-2 text-right font-medium text-neutral-500">
                    − {formatMoney(r.advance_applied)}
                  </td>
                </tr>
              )}
              {Number(r.advance_added) > 0 && (
                <tr>
                  <td className="py-2 text-neutral-600">Added to advance</td>
                  <td className="py-2 text-right font-medium">{formatMoney(r.advance_added)}</td>
                </tr>
              )}
              <tr>
                <td className="py-3 text-base font-bold">Total received (cash)</td>
                <td className="py-3 text-right text-base font-bold text-brand">
                  {formatMoney(r.cash_received)}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-neutral-600">Balance due (this month)</td>
                <td className="py-2 text-right font-medium">{formatMoney(r.balance_due)}</td>
              </tr>
              <tr>
                <td className="py-2 text-neutral-600">Advance balance</td>
                <td className="py-2 text-right font-medium">{formatMoney(r.advance_balance)}</td>
              </tr>
              <tr>
                <td className="py-2 text-neutral-600">Payment method</td>
                <td className="py-2 text-right font-medium">{methodLabel(r.payment_method)}</td>
              </tr>
            </tbody>
          </table>

          {r.notes && (
            <p className="mt-5 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
              <span className="font-medium">Notes: </span>
              {r.notes}
            </p>
          )}

          <p className="mt-8 text-center text-xs text-neutral-400">
            Thank you for training with {gymName}. Stay strong! 💪
          </p>
        </div>
      </div>
    </div>
  );
}
