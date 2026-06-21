import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'red' | 'amber' | 'green' | 'default';
}) {
  const color =
    accent === 'red'
      ? 'text-brand'
      : accent === 'amber'
        ? 'text-amber-600'
        : accent === 'green'
          ? 'text-emerald-600'
          : 'text-neutral-900';
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className={cn('mt-2 text-2xl font-bold', color)}>{value}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-neutral-200 text-neutral-600',
  frozen: 'bg-sky-100 text-sky-700',
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  partial: 'bg-orange-100 text-orange-700',
  overdue: 'bg-red-100 text-brand-dark',
  completed: 'bg-emerald-100 text-emerald-700',
  void: 'bg-neutral-200 text-neutral-500 line-through',
  inside: 'bg-emerald-100 text-emerald-700',
  outside: 'bg-neutral-200 text-neutral-600',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-neutral-100 text-neutral-600';
  return <span className={cn('badge capitalize', cls)}>{status}</span>;
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-neutral-400">
        {text}
      </td>
    </tr>
  );
}
