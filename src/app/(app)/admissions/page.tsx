import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader, StatusBadge, EmptyRow } from '@/components/ui';
import ConvertButton from '@/components/ConvertButton';
import { formatDate, formatDateTime } from '@/lib/utils';
import { setAdmissionStatus } from './actions';

export const dynamic = 'force-dynamic';

const TABS = ['pending', 'approved', 'converted', 'rejected', 'all'];

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const profile = await getProfile();
  if (profile?.role !== 'admin') redirect('/dashboard');

  const supabase = createClient();
  const status = searchParams.status ?? 'pending';

  let q = supabase
    .from('admission_requests')
    .select('*, plan:membership_plans(name)')
    .order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);

  const [{ data: reqs }, { data: services }] = await Promise.all([
    q,
    supabase.from('services').select('id, name'),
  ]);
  const svcName: Record<string, string> = Object.fromEntries(
    (services ?? []).map((s: any) => [s.id, s.name])
  );

  return (
    <div>
      <PageHeader title="Admissions" subtitle="Online admission requests from the public form." />

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admissions?status=${t}`}
            className={status === t ? 'btn-primary btn-sm capitalize' : 'btn-ghost btn-sm capitalize'}
          >
            {t}
          </Link>
        ))}
      </div>

      {reqs && reqs.length > 0 ? (
        <div className="space-y-4">
          {reqs.map((r: any) => {
            const svc = Array.isArray(r.selected_services)
              ? r.selected_services.map((id: string) => svcName[id] ?? id)
              : [];
            return (
              <div key={r.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{r.full_name}</h2>
                      <StatusBadge status={r.status} />
                      {r.member_type === 'couple' && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                          Couple
                        </span>
                      )}
                    </div>
                    {r.member_type === 'couple' && r.spouse && (
                      <p className="mt-0.5 text-sm text-sky-700">
                        Wife: {r.spouse.full_name}
                        {r.spouse.phone ? ` · ${r.spouse.phone}` : ''}
                        {r.spouse.age ? ` · Age ${r.spouse.age}` : ''} (50% offer)
                      </p>
                    )}
                    <p className="text-sm text-neutral-500">
                      {r.phone || '—'} · {r.email || '—'}
                      {r.age ? ` · Age ${r.age}` : ''}
                      {r.gender ? ` · ${r.gender}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      Submitted {formatDateTime(r.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {(r.status === 'pending' || r.status === 'approved') && (
                      <>
                        <ConvertButton id={r.id} />
                        <div className="flex gap-2">
                          {r.status === 'pending' && (
                            <form action={setAdmissionStatus.bind(null, r.id, 'approved')}>
                              <button className="btn-ghost btn-sm">Approve</button>
                            </form>
                          )}
                          <form action={setAdmissionStatus.bind(null, r.id, 'rejected')}>
                            <button className="btn-sm rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-red-50">
                              Reject
                            </button>
                          </form>
                        </div>
                      </>
                    )}
                    {r.status === 'converted' && r.converted_member_id && (
                      <Link href={`/members/${r.converted_member_id}/edit`} className="btn-ghost btn-sm">
                        Open member
                      </Link>
                    )}
                    {r.status === 'rejected' && (
                      <form action={setAdmissionStatus.bind(null, r.id, 'pending')}>
                        <button className="btn-ghost btn-sm">Reopen</button>
                      </form>
                    )}
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <Field label="Membership" value={r.plan?.name ?? '—'} />
                  <Field label="Offer" value={r.offer_code && r.offer_code !== 'none' ? r.offer_code : '—'} />
                  <Field label="Joining date" value={r.preferred_joining_date ? formatDate(r.preferred_joining_date) : '—'} />
                  <Field label="Services" value={svc.length ? svc.join(', ') : '—'} />
                  <Field label="Emergency" value={r.emergency_contact || '—'} />
                  <Field label="Address" value={r.address || '—'} />
                  {r.notes && <Field label="Notes" value={r.notes} />}
                  {r.photo_reference && <Field label="Photo reference" value={r.photo_reference} />}
                </dl>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <table className="min-w-full">
            <tbody>
              <EmptyRow colSpan={1} text={`No ${status === 'all' ? '' : status} admission requests.`} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="font-medium text-neutral-800">{value}</dd>
    </div>
  );
}
