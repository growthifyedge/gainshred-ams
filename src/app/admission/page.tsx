import { createClient } from '@/lib/supabase/server';
import AdmissionForm from '@/components/AdmissionForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'GainShred — Online Admission',
};

export default async function AdmissionPage() {
  const supabase = createClient();
  const [{ data: plans }, { data: services }] = await Promise.all([
    supabase
      .from('membership_plans')
      .select('id, name, total_price, monthly_fee')
      .eq('is_active', true)
      .order('monthly_fee'),
    supabase
      .from('services')
      .select('id, name, price, category')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  return (
    <div className="min-h-screen bg-brand-black py-10">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            GAIN<span className="text-brand">SHRED</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-400">Online Admission Request</p>
        </div>
        <AdmissionForm plans={plans ?? []} services={services ?? []} />
      </div>
    </div>
  );
}
