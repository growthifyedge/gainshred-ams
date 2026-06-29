'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { dangerDeleteMember, type FormState } from '@/app/(app)/members/actions';

function DeleteButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!enabled || pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Permanently Delete Member'}
    </button>
  );
}

export default function MemberDangerZone({
  memberId,
  memberName,
  isCouple,
}: {
  memberId: string;
  memberName: string;
  isCouple: boolean;
}) {
  const action = dangerDeleteMember.bind(null, memberId);
  const [state, formAction] = useFormState<FormState, FormData>(action, {});
  const [typed, setTyped] = useState('');

  return (
    <div className="mt-8 rounded-xl border border-red-200 bg-red-50/40 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-brand">Danger Zone</h3>
      <p className="mt-1 text-sm text-neutral-600">
        Permanently delete <span className="font-semibold">{memberName}</span> and all of their payments,
        dues, attendance, and related records. This action cannot be undone.
      </p>

      {isCouple && (
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800">
          This is a couple member. Only <span className="font-semibold">{memberName}</span> will be deleted —
          the spouse/partner record will remain.
        </p>
      )}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="confirm">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
          </label>
          <input
            id="confirm"
            name="confirm"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="input max-w-[200px]"
            placeholder="DELETE"
          />
        </div>
        <DeleteButton enabled={typed === 'DELETE'} />
      </form>

      {state.error && <p className="mt-2 text-sm font-medium text-brand">{state.error}</p>}
    </div>
  );
}
