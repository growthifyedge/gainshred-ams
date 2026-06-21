import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatCard, StatusBadge, EmptyRow } from '@/components/ui';
import { formatTime, formatDateTime, durationLabel, todayInput } from '@/lib/utils';
import { checkIn, checkOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const supabase = createClient();
  const q = searchParams.q?.trim();

  // Active members with their live presence (inside / outside).
  let memberQuery = supabase
    .from('member_attendance_status')
    .select('*')
    .eq('member_status', 'active')
    .order('full_name', { ascending: true });
  if (q) {
    const safe = q.replace(/[,()*%:]/g, ' ').trim();
    if (safe)
      memberQuery = memberQuery.or(
        `full_name.ilike.%${safe}%,phone.ilike.%${safe}%,registration_number.ilike.%${safe}%`
      );
  }

  const [{ data: members }, { data: inside }, { data: today }, { count: activeCount }] =
    await Promise.all([
      memberQuery,
      supabase
        .from('member_attendance_status')
        .select('*')
        .eq('presence', 'inside')
        .order('check_in_at', { ascending: true }),
      supabase
        .from('attendance')
        .select('id, member_id, check_in_at, check_out_at, status, member:members(full_name)')
        .eq('date', todayInput())
        .order('check_in_at', { ascending: false }),
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);

  const insideCount = inside?.length ?? 0;
  const todayVisits = today?.length ?? 0;
  const checkedInToday = new Set((today ?? []).map((a: any) => a.member_id)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Attendance"
        subtitle="Check members in and out of the gym."
        action={
          <Link href="/attendance/quick" className="btn-primary">
            Quick Check-In
          </Link>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active Members" value={String(activeCount ?? 0)} />
        <StatCard label="Currently Inside" value={String(insideCount)} accent="green" />
        <StatCard label="Checked In Today" value={String(checkedInToday)} />
        <StatCard label="Visits Today" value={String(todayVisits)} />
      </div>

      {/* Member list with check in / out */}
      <section>
        <form className="mb-4 flex flex-wrap gap-3" method="get">
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search name, phone or GS-0001…"
            className="input max-w-xs"
          />
          <button className="btn-ghost">Search</button>
        </form>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="th">Member</th>
                  <th className="th">Phone</th>
                  <th className="th">Status</th>
                  <th className="th">Since</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {members && members.length > 0 ? (
                  members.map((m: any) => (
                    <tr key={m.member_id}>
                      <td className="td">
                        <div className="font-medium">{m.full_name}</div>
                        <div className="font-mono text-xs text-neutral-400">
                          {m.registration_number ?? '—'}
                        </div>
                      </td>
                      <td className="td">{m.phone || '—'}</td>
                      <td className="td">
                        <StatusBadge status={m.presence === 'inside' ? 'inside' : 'outside'} />
                      </td>
                      <td className="td">
                        {m.presence === 'inside' ? formatTime(m.check_in_at) : '—'}
                      </td>
                      <td className="td">
                        <div className="flex justify-end">
                          {m.presence === 'inside' ? (
                            <form action={checkOut.bind(null, m.member_id)}>
                              <button className="btn-sm rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
                                Check Out
                              </button>
                            </form>
                          ) : (
                            <form action={checkIn.bind(null, m.member_id)}>
                              <button className="btn-primary btn-sm">Check In</button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={5} text="No active members found." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Currently inside */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Currently Inside Gym{' '}
          <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-bold text-emerald-700">
            {inside?.length ?? 0}
          </span>
        </h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="th">Member</th>
                  <th className="th">Checked in</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {inside && inside.length > 0 ? (
                  inside.map((m: any) => (
                    <tr key={m.member_id}>
                      <td className="td font-medium">{m.full_name}</td>
                      <td className="td">{formatTime(m.check_in_at)}</td>
                      <td className="td">
                        <div className="flex justify-end">
                          <form action={checkOut.bind(null, m.member_id)}>
                            <button className="btn-sm rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
                              Check Out
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={3} text="Nobody is inside right now." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Today's attendance */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Today&apos;s Attendance</h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="th">Member</th>
                  <th className="th">Check in</th>
                  <th className="th">Check out</th>
                  <th className="th">Duration</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {today && today.length > 0 ? (
                  today.map((a: any) => (
                    <tr key={a.id}>
                      <td className="td font-medium">{a.member?.full_name ?? '—'}</td>
                      <td className="td">{formatDateTime(a.check_in_at)}</td>
                      <td className="td">{a.check_out_at ? formatDateTime(a.check_out_at) : '—'}</td>
                      <td className="td">{durationLabel(a.check_in_at, a.check_out_at)}</td>
                      <td className="td">
                        <StatusBadge status={a.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={5} text="No attendance recorded today yet." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
