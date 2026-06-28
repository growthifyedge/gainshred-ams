// Small shared helpers (no dependencies).

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const CURRENCY_PREFIX = 'Rs.';

export function formatMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `${CURRENCY_PREFIX} ${n.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

// ===========================================================================
// Karachi time (Asia/Karachi). We store UTC instants in the DB, but ALL display
// and "business date" logic is computed in Karachi time so it is correct no
// matter where the server runs (Vercel runs in UTC).
// ===========================================================================
export const KARACHI_TZ = 'Asia/Karachi';

// "Now" as a real instant. Stored via .toISOString() (UTC) — display in Karachi.
export function getKarachiNow(): Date {
  return new Date();
}

// Break an instant into Karachi-local parts.
function karachiParts(d: Date) {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone: KARACHI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)) {
    parts[p.type] = p.value;
  }
  return parts; // { year, month, day, hour, minute }
}

// Business date in Karachi as YYYY-MM-DD.
export function getKarachiDate(d: Date = new Date()): string {
  const p = karachiParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatDate(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: KARACHI_TZ,
  });
}

export function formatTime(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: KARACHI_TZ,
  });
}

export function formatDateTime(d?: string | null) {
  if (!d) return '—';
  return `${formatDate(d)} ${formatTime(d)}`;
}

// Explicit alias requested by spec.
export const formatKarachiDateTime = formatDateTime;

// Human-friendly duration between two timestamps (e.g. "1h 23m"). Timezone-agnostic.
export function durationLabel(start?: string | null, end?: string | null) {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function monthLabel(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: KARACHI_TZ,
  });
}

// First day of a month as YYYY-MM-DD (Karachi; defaults to current month).
export function firstOfMonth(d: Date = new Date()) {
  const p = karachiParts(d);
  return `${p.year}-${p.month}-01`;
}

// YYYY-MM string for <input type="month"> (Karachi).
export function monthInputValue(d: Date = new Date()) {
  const p = karachiParts(d);
  return `${p.year}-${p.month}`;
}

// YYYY-MM-DD for <input type="date"> and "today" filters (Karachi business date).
export function todayInput(d: Date = new Date()) {
  return getKarachiDate(d);
}

// ===========================================================================
// Renewal-cycle date math (Phase 8). Pure calendar arithmetic on YYYY-MM-DD
// strings — no timezone involved, so it stays correct on any server.
// ===========================================================================

// Parse a YYYY-MM-DD string (or a Date, read in Karachi) into [year, month, day].
function dateParts(date: string | Date): [number, number, number] {
  if (date instanceof Date) {
    const p = karachiParts(date);
    return [Number(p.year), Number(p.month), Number(p.day)];
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
}

// Last day (28–31) of a given month. `month` is 1–12. Timezone-independent.
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Add a whole number of calendar months to a date, clamping the day to the
// target month's length (e.g. 31 Jan + 1 month -> 28/29 Feb). Returns YYYY-MM-DD.
export function addMonths(date: string | Date, months: number): string {
  const [y, m, d] = dateParts(date);
  if (!y || !m || !d) return typeof date === 'string' ? date : getKarachiDate(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1; // always 1–12
  const nd = Math.min(d, daysInMonth(ny, nm));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}

// Next due date = base date advanced by the package duration in months
// (Monthly = 1, 3 Months = 3, 6 Months = 6, Yearly = 12). Same day-of-month as
// the base (e.g. 16 Jun -> 16 Jul). Returns YYYY-MM-DD, or null if inputs are
// missing/invalid (e.g. no plan / unknown duration).
export function computeNextDueDate(
  baseDate?: string | Date | null,
  durationMonths?: number | null
): string | null {
  if (!baseDate || !durationMonths || durationMonths <= 0) return null;
  return addMonths(baseDate, durationMonths);
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  easypaisa: 'Easypaisa',
  jazzcash: 'JazzCash',
  card: 'Card',
  adjustment: 'Adjustment',
};

export function methodLabel(m?: string | null) {
  if (!m) return '—';
  return METHOD_LABELS[m] ?? m;
}

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'easypaisa', label: 'Easypaisa' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'card', label: 'Card' },
  { value: 'adjustment', label: 'Adjustment' },
] as const;

// Convert an array of flat objects to a CSV string.
export function toCSV(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
}
