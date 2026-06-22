import Link from 'next/link';
import { formatMoney } from '@/lib/utils';

const OFFER_LABEL: Record<string, string> = {
  none: 'No offer',
  wife: 'Wife 50% Offer',
  senior: 'Senior Citizen 67+',
  couple: 'Couple',
};

export type CoupleCardData = {
  id: string;
  registration_number: string | null;
  full_name: string;
  phone: string | null;
  offer_code: string;
  package_name: string | null;
  registration_fee: number;
  package_fee: number;
  services_total: number;
  discount: number;
  net_payable: number;
  services: string[];
};

function Card({ title, d, current }: { title: string; d: CoupleCardData; current: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${current ? 'border-brand ring-1 ring-brand/30' : 'border-neutral-200'}`}>
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h4 className="font-semibold">{title}</h4>
          <p className="font-mono text-xs text-neutral-400">{d.registration_number ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/members/${d.id}/card`} className="btn-ghost btn-sm">
            {title} Card
          </Link>
          {current ? (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">Editing</span>
          ) : (
            <Link href={`/members/${d.id}/edit`} className="btn-ghost btn-sm">
              Edit {title}
            </Link>
          )}
        </div>
      </div>
      <p className="text-sm text-neutral-600">
        {d.full_name}
        {d.phone ? ` · ${d.phone}` : ''}
      </p>
      <dl className="mt-3 space-y-1 border-t border-neutral-100 pt-2 text-sm">
        <Row k="Package" v={d.package_name ?? '—'} />
        <Row k="Offer" v={OFFER_LABEL[d.offer_code] ?? d.offer_code} />
        <Row k="Services" v={d.services.length ? d.services.join(', ') : '—'} />
        <Row k="Registration fee" v={formatMoney(d.registration_fee)} />
        <Row k="Package amount" v={formatMoney(d.package_fee)} />
        <Row k="Services amount" v={formatMoney(d.services_total)} />
        {d.discount > 0 && <Row k={d.offer_code === 'wife' ? 'Wife 50% discount' : 'Discount'} v={`− ${formatMoney(d.discount)}`} />}
        <div className="flex justify-between border-t border-neutral-100 pt-1 font-semibold">
          <dt>Net payable</dt>
          <dd className="text-brand">{formatMoney(d.net_payable)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="text-right font-medium text-neutral-800">{v}</dd>
    </div>
  );
}

export default function CoupleCards({
  husband,
  wife,
  currentId,
  groupId,
}: {
  husband: CoupleCardData;
  wife: CoupleCardData;
  currentId: string;
  groupId: string;
}) {
  const combined = husband.net_payable + wife.net_payable;
  return (
    <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-sky-800">Couple Member</span>
        <span className="font-mono text-xs text-neutral-400">Group {groupId.slice(0, 8)}</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg bg-white p-2">
          <p className="text-xs text-neutral-500">Husband total</p>
          <p className="font-bold">{formatMoney(husband.net_payable)}</p>
        </div>
        <div className="rounded-lg bg-white p-2">
          <p className="text-xs text-neutral-500">Wife total</p>
          <p className="font-bold">{formatMoney(wife.net_payable)}</p>
        </div>
        <div className="rounded-lg bg-brand-black p-2 text-white">
          <p className="text-xs text-neutral-300">Combined</p>
          <p className="font-bold text-brand">{formatMoney(combined)}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Husband" d={husband} current={husband.id === currentId} />
        <Card title="Wife" d={wife} current={wife.id === currentId} />
      </div>
    </div>
  );
}
