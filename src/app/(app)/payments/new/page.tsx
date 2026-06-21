import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import PaymentForm from '@/components/PaymentForm';
import { createPayment } from '../actions';
import { monthInputValue, todayInput } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: { member?: string };
}) {
  const supabase = createClient();
  const { data: members } = await supabase
    .from('members')
    .select('id, full_name, monthly_fee, status, advance_balance')
    .neq('status', 'inactive')
    .order('full_name');

  return (
    <div>
      <PageHeader title="Add Payment" subtitle="Record a payment and generate a receipt." />
      <PaymentForm
        action={createPayment}
        members={members ?? []}
        defaultMonth={monthInputValue()}
        defaultDate={todayInput()}
        presetMemberId={searchParams.member}
      />
    </div>
  );
}
