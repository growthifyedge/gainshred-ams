import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatusBadge } from '@/components/ui';
import { formatTime } from '@/lib/utils';
import { checkIn, checkOut } from '../actions';

export const dynamic = 'force-dynamic';

// Front-desk optimised screen: big search box + one-tap check in / out.
export default async function QuickCheckInPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const supabase = createClient();
  const q = searchParams.q?.trim();

  const { data: inside } = await supabase
    .from('member_attendance_status')
    .select('*')
    .eq('presence', 'inside')
    .order('check_in_at', { ascending: true });

  let results: any[] = [];
  if (q) {
    const safe = q.replace(/[,()*%:]/g, ' ').trim();
    let mq = supabase
      .from('member_attendance_status')
      .select('*')
      .eq('member_status', 'active')
      .order('full_name', { ascending: true })
      .limit(25);
    if (safe) mq = mq.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    const { data } = await mq;
    results = data ?? [];
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Quick Check-In"
        subtitle="Search a member and tap to check them in or out."
        action={
          <Link href="/attendance" className="btn-ghost">
            Full view
          </Link>
        }
      />

      <form method="get" className="flex gap-3">
        <input
          name="q"
          defaultValue={q ?? ''}
          autoFocus
          placeholder="Type member name or phone…"
          className="input py-3 text-lg"
        />
        <button className="btn-primary px-6 text-base">Search</button>
      </form>

      {q ? (
        <div className="space-y-3">
          {results.length > 0 ? (
            results.map((m: any) => <MemberRow key={m.member_id} m={m} />)
          ) : (
            <div className="card p-6 text-center text-sm text-neutral-400">
              No active member matches “{q}”.
            </div>
          )}
        </div>
      ) : (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Currently Inside{' '}
            <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-bold text-emerald-700">
              {inside?.length ?? 0}
            </span>
          </h2>
          <div className="space-y-3">
            {inside && inside.length > 0 ? (
              inside.map((m: any) => <MemberRow key={m.member_id} m={m} />)
            ) : (
              <div className="card p-6 text-center text-sm text-neutral-400">
                Nobody is inside. Search a member to check them in.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({ m }: { m: any }) {
  const isInside = m.presence === 'inside';
  return (
    <div className="card flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold">{m.full_name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-sm text-neutral-500">
          <span>{m.phone || '—'}</span>
          <StatusBadge status={isInside ? 'inside' : 'outside'} />
          {isInside && <span className="text-xs">since {formatTime(m.check_in_at)}</span>}
        </p>
      </div>
      {isInside ? (
        <form action={checkOut.bind(null, m.member_id)}>
          <button className="btn-dark px-6 py-3 text-base">Check Out</button>
        </form>
      ) : (
        <form action={checkIn.bind(null, m.member_id)}>
          <button className="btn-primary px-6 py-3 text-base">Check In</button>
        </form>
      )}
    </div>
  );
}
