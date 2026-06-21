import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { PageHeader, EmptyRow } from '@/components/ui';
import SettingsForm from '@/components/SettingsForm';
import PlanForm from '@/components/PlanForm';
import ConfirmSubmit from '@/components/ConfirmSubmit';
import { formatMoney } from '@/lib/utils';
import { deletePlan, togglePlan } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const profile = await getProfile();
  if (profile?.role !== 'admin') redirect('/dashboard');

  const supabase = createClient();
  const [{ data: settings }, { data: plans }] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 1).single(),
    supabase.from('membership_plans').select('*').order('monthly_fee'),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Settings" subtitle="Gym info, penalty rules and membership plans." />
        {settings && <SettingsForm settings={settings} />}
      </div>

      <section className="card p-6">
        <h2 className="mb-4 font-semibold">Membership Plans</h2>

        <div className="mb-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="th">Name</th>
                <th className="th">Monthly fee</th>
                <th className="th">Description</th>
                <th className="th">Active</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {plans && plans.length > 0 ? (
                plans.map((p: any) => (
                  <tr key={p.id}>
                    <td className="td font-medium">{p.name}</td>
                    <td className="td">{formatMoney(p.monthly_fee)}</td>
                    <td className="td">{p.description || '—'}</td>
                    <td className="td">{p.is_active ? 'Yes' : 'No'}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        <form action={togglePlan.bind(null, p.id, !p.is_active)} className="inline">
                          <button className="btn-ghost btn-sm">
                            {p.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </form>
                        <form action={deletePlan.bind(null, p.id)} className="inline">
                          <ConfirmSubmit
                            message="Remove this plan? If it is in use it will be deactivated instead."
                            className="btn-sm rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-red-50"
                          >
                            Remove
                          </ConfirmSubmit>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={5} text="No plans yet." />
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-neutral-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">Add a plan</h3>
          <PlanForm />
        </div>
      </section>
    </div>
  );
}
