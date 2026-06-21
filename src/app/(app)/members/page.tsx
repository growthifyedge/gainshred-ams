import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader, StatusBadge, EmptyRow } from '@/components/ui';
import ConfirmSubmit from '@/components/ConfirmSubmit';
import { formatMoney, formatDate } from '@/lib/utils';
import { setMemberStatus, deleteMember } from './actions';

export const dynamic = 'force-dynamic';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const profile = await getProfile();
  const isAdmin = profile?.role === 'admin';
  const supabase = createClient();

  let query = supabase
    .from('members')
    .select('id, full_name, phone, email, monthly_fee, due_day, status, plan:membership_plans(name)')
    .order('full_name', { ascending: true });

  const q = searchParams.q?.trim();
  const status = searchParams.status?.trim();
  if (q) {
    // Strip characters that have special meaning in a PostgREST `or` filter.
    const safe = q.replace(/[,()*%:]/g, ' ').trim();
    if (safe) {
      query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
    }
  }
  if (status && status !== 'all') query = query.eq('status', status);

  const { data: members } = await query;

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle="Manage gym members and their plans."
        action={
          isAdmin ? (
            <Link href="/members/new" className="btn-primary">
              + Add Member
            </Link>
          ) : null
        }
      />

      {/* Filters */}
      <form className="mb-4 flex flex-wrap gap-3" method="get">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name, phone or email…"
          className="input max-w-xs"
        />
        <select name="status" defaultValue={status ?? 'all'} className="input max-w-[160px]">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="frozen">Frozen</option>
        </select>
        <button className="btn-ghost">Filter</button>
      </form>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="th">Name</th>
                <th className="th">Contact</th>
                <th className="th">Plan</th>
                <th className="th">Fee</th>
                <th className="th">Due day</th>
                <th className="th">Status</th>
                {isAdmin && <th className="th text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {members && members.length > 0 ? (
                members.map((m: any) => (
                  <tr key={m.id}>
                    <td className="td font-medium">{m.full_name}</td>
                    <td className="td">
                      <div>{m.phone || '—'}</div>
                      <div className="text-xs text-neutral-400">{m.email || ''}</div>
                    </td>
                    <td className="td">{m.plan?.name ?? '—'}</td>
                    <td className="td">{formatMoney(m.monthly_fee)}</td>
                    <td className="td">{m.due_day}</td>
                    <td className="td">
                      <StatusBadge status={m.status} />
                    </td>
                    {isAdmin && (
                      <td className="td">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/members/${m.id}/edit`} className="btn-ghost btn-sm">
                            Edit
                          </Link>
                          {m.status === 'active' ? (
                            <form action={setMemberStatus.bind(null, m.id, 'inactive')}>
                              <button className="btn-ghost btn-sm">Deactivate</button>
                            </form>
                          ) : (
                            <form action={setMemberStatus.bind(null, m.id, 'active')}>
                              <button className="btn-ghost btn-sm">Activate</button>
                            </form>
                          )}
                          <form action={deleteMember.bind(null, m.id)}>
                            <ConfirmSubmit
                              message="Delete this member? If they have payment history they will be deactivated instead."
                              className="btn-sm rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-red-50"
                            >
                              Delete
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={isAdmin ? 7 : 6} text="No members found." />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
