'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { generateDues, type DuesState } from '@/app/(app)/dues/actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-dark">
      {pending ? 'Generating…' : 'Generate Dues'}
    </button>
  );
}

export default function GenerateDuesForm({ defaultMonth }: { defaultMonth: string }) {
  const [state, formAction] = useFormState<DuesState, FormData>(generateDues, {});

  return (
    <form action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="label" htmlFor="month">
          Generate monthly dues for
        </label>
        <input
          id="month"
          name="month"
          type="month"
          defaultValue={defaultMonth}
          className="input"
        />
      </div>
      <Submit />
      {state.message && <p className="text-sm text-emerald-600">{state.message}</p>}
      {state.error && <p className="text-sm text-brand">{state.error}</p>}
    </form>
  );
}
