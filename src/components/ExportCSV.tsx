'use client';

import { toCSV } from '@/lib/utils';

// Client-side CSV download of the rows currently shown in a report.
export default function ExportCSV({
  rows,
  filename,
}: {
  rows: Array<Record<string, unknown>>;
  filename: string;
}) {
  function download() {
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={download} disabled={!rows.length} className="btn-ghost btn-sm">
      Export CSV
    </button>
  );
}
