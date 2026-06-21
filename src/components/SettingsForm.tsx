'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateSettings, type SettingsState } from '@/app/(app)/settings/actions';

type Settings = {
  gym_name: string;
  gym_phone: string | null;
  gym_address: string | null;
  currency: string;
  penalty_type: 'none' | 'fixed' | 'daily';
  penalty_fixed: number;
  penalty_daily: number;
  penalty_grace_days: number;
  penalty_max: number;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : 'Save Settings'}
    </button>
  );
}

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useFormState<SettingsState, FormData>(updateSettings, {});
  const [penaltyType, setPenaltyType] = useState(settings.penalty_type);

  return (
    <form action={formAction} className="card space-y-6 p-6">
      <div>
        <h2 className="mb-3 font-semibold">Gym Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="gym_name">
              Gym name *
            </label>
            <input id="gym_name" name="gym_name" required defaultValue={settings.gym_name} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="currency">
              Currency *
            </label>
            <input id="currency" name="currency" required defaultValue={settings.currency} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="gym_phone">
              Phone
            </label>
            <input id="gym_phone" name="gym_phone" defaultValue={settings.gym_phone ?? ''} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="gym_address">
              Address
            </label>
            <input
              id="gym_address"
              name="gym_address"
              defaultValue={settings.gym_address ?? ''}
              className="input"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-200 pt-5">
        <h2 className="mb-1 font-semibold">Late Payment Penalty Rule</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Penalties are calculated automatically once a due is past its due date.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="penalty_type">
              Penalty type
            </label>
            <select
              id="penalty_type"
              name="penalty_type"
              value={penaltyType}
              onChange={(e) => setPenaltyType(e.target.value as Settings['penalty_type'])}
              className="input"
            >
              <option value="none">No penalty</option>
              <option value="fixed">Fixed amount after due date</option>
              <option value="daily">Daily amount after due date</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="penalty_grace_days">
              Grace days (free days after due date)
            </label>
            <input
              id="penalty_grace_days"
              name="penalty_grace_days"
              type="number"
              min={0}
              defaultValue={settings.penalty_grace_days}
              className="input"
            />
          </div>

          <div className={penaltyType === 'fixed' ? '' : 'opacity-50'}>
            <label className="label" htmlFor="penalty_fixed">
              Fixed penalty (Rs.)
            </label>
            <input
              id="penalty_fixed"
              name="penalty_fixed"
              type="number"
              min={0}
              defaultValue={settings.penalty_fixed}
              className="input"
            />
          </div>

          <div className={penaltyType === 'daily' ? '' : 'opacity-50'}>
            <label className="label" htmlFor="penalty_daily">
              Daily penalty (Rs. per day)
            </label>
            <input
              id="penalty_daily"
              name="penalty_daily"
              type="number"
              min={0}
              defaultValue={settings.penalty_daily}
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="penalty_max">
              Maximum penalty cap (Rs., 0 = no cap)
            </label>
            <input
              id="penalty_max"
              name="penalty_max"
              type="number"
              min={0}
              defaultValue={settings.penalty_max}
              className="input"
            />
          </div>
        </div>
      </div>

      {state.message && <p className="text-sm text-emerald-600">{state.message}</p>}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand-dark">{state.error}</p>
      )}

      <Submit />
    </form>
  );
}
