'use client';

import Link from 'next/link';

export default function PrintButtons() {
  return (
    <div className="no-print mb-6 flex items-center justify-between">
      <Link href="/payments" className="btn-ghost btn-sm">
        ← Back to payments
      </Link>
      <button onClick={() => window.print()} className="btn-primary">
        Print / Download PDF
      </button>
    </div>
  );
}
