'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { convertAdmission, type AdmissionState } from '@/app/(app)/admissions/actions';

function Btn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary btn-sm">
      {pending ? 'Converting…' : label}
    </button>
  );
}

export default function ConvertButton({ id, isCouple }: { id: string; isCouple?: boolean }) {
  const action = convertAdmission.bind(null, id);
  const [state, formAction] = useFormState<AdmissionState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Btn label={isCouple ? 'Convert Couple to Members' : 'Convert to member'} />
      {state.error && <span className="text-right text-xs text-brand">{state.error}</span>}
    </form>
  );
}
