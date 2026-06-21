import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { getKarachiDate, firstOfMonth } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ExportPage() {
  const profile = await getProfile();
  if (profile?.role !== 'admin') redirect('/dashboard');

  const today = getKarachiDate();
  const monthStart = firstOfMonth();

  return (
    <div>
      <PageHeader
        title="Export Data"
        subtitle="Download your data as CSV — no need to open Supabase. Files are named with today's Karachi date."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Simple, no-filter exports */}
        <ExportCard
          title="Members"
          desc="All members with plan, fee, status and advance balance."
          type="members"
          filename={`members-${today}.csv`}
        />
        <ExportCard
          title="Membership Plans / Packages"
          desc="All packages with duration, advance, total price and saving."
          type="membership_plans"
          filename={`membership_plans-${today}.csv`}
        />
        <ExportCard
          title="Dues"
          desc="Every member's monthly dues, balances and penalties."
          type="dues"
          filename={`dues-${today}.csv`}
        />

        {/* Date-range exports */}
        <RangeExportCard
          title="Payments"
          desc="Receipts and collections. Filter by payment date if needed."
          type="payments"
          defaultFrom={monthStart}
          defaultTo={today}
        />
        <RangeExportCard
          title="Attendance"
          desc="Check-in / check-out records (Karachi time). Filter by date if needed."
          type="attendance"
          defaultFrom={monthStart}
          defaultTo={today}
        />

        {/* Full backup */}
        <div className="card flex flex-col justify-between p-5">
          <div>
            <h2 className="font-semibold">Full Backup</h2>
            <p className="mt-1 text-sm text-neutral-500">
              One CSV file containing every dataset (members, plans, payments, dues, attendance).
            </p>
          </div>
          <form action="/api/export" method="get" className="mt-4">
            <input type="hidden" name="type" value="backup" />
            <button className="btn-dark w-full">Download Full Backup CSV</button>
          </form>
        </div>
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        Exports run on the server with your admin permissions — no API keys are exposed.
      </p>
    </div>
  );
}

function ExportCard({
  title,
  desc,
  type,
  filename,
}: {
  title: string;
  desc: string;
  type: string;
  filename: string;
}) {
  return (
    <div className="card flex flex-col justify-between p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-neutral-500">{desc}</p>
        <p className="mt-1 text-xs text-neutral-400">→ {filename}</p>
      </div>
      <form action="/api/export" method="get" className="mt-4">
        <input type="hidden" name="type" value={type} />
        <button className="btn-primary w-full">Download CSV</button>
      </form>
    </div>
  );
}

function RangeExportCard({
  title,
  desc,
  type,
  defaultFrom,
  defaultTo,
}: {
  title: string;
  desc: string;
  type: string;
  defaultFrom: string;
  defaultTo: string;
}) {
  return (
    <div className="card flex flex-col justify-between p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-neutral-500">{desc}</p>
      </div>
      <form action="/api/export" method="get" className="mt-4 space-y-3">
        <input type="hidden" name="type" value={type} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" name="from" defaultValue={defaultFrom} className="input" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" name="to" defaultValue={defaultTo} className="input" />
          </div>
        </div>
        <button className="btn-primary w-full">Download CSV</button>
      </form>
    </div>
  );
}
