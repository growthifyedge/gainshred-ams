'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createPlan, type SettingsState } from '@/app/(app)/settings/actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-dark">
      {pending ? 'Adding…' : 'Add Plan'}
    </button>
  );
}

export default function PlanForm() {
  const [state, formAction] = useFormState<SettingsState, FormData>(createPlan, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="name">
          Plan name
        </label>
        <input id="name" name="name" required className="input max-w-[200px]" />
      </div>
      <div>
        <label className="label" htmlFor="monthly_fee">
          Monthly fee (Rs.)
        </label>
        <input
          id="monthly_fee"
          name="monthly_fee"
          type="number"
          min={0}
          required
          className="input max-w-[150px]"
        />
      </div>
      <div className="flex-1">
        <label className="label" htmlFor="description">
          Description
        </label>
        <input id="description" name="description" className="input" />
      </div>
      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700">
        <input type="checkbox" name="is_active" defaultChecked className="h-4 w-4" />
        Active
      </label>
      <Submit />
      {state.message && <p className="w-full text-sm text-emerald-600">{state.message}</p>}
      {state.error && <p className="w-full text-sm text-brand">{state.error}</p>}
    </form>
  );
}
