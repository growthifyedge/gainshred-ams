'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { convertAdmission, type AdmissionState } from '@/app/(app)/admissions/actions';

function Btn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary btn-sm">
      {pending ? 'Converting…' : 'Convert to member'}
    </button>
  );
}

export default function ConvertButton({ id }: { id: string }) {
  const action = convertAdmission.bind(null, id);
  const [state, formAction] = useFormState<AdmissionState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Btn />
      {state.error && <span className="text-right text-xs text-brand">{state.error}</span>}
    </form>
  );
}
