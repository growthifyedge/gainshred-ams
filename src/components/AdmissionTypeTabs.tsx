'use client';

import { useState } from 'react';
import MemberForm from '@/components/MemberForm';
import CoupleForm from '@/components/CoupleForm';
import { createMember, createCouple } from '@/app/(app)/members/actions';
import type { Plan, Service } from '@/lib/packages';

export default function AdmissionTypeTabs({
  plans,
  services,
  joiningDate,
}: {
  plans: Plan[];
  services: Service[];
  joiningDate: string;
}) {
  const [type, setType] = useState<'single' | 'couple'>('single');

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => setType('single')}
          className={type === 'single' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
        >
          Single
        </button>
        <button
          type="button"
          onClick={() => setType('couple')}
          className={type === 'couple' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
        >
          Couple (Husband + Wife)
        </button>
      </div>

      {type === 'single' ? (
        <MemberForm
          action={createMember}
          plans={plans}
          services={services}
          initial={{ joining_date: joiningDate, due_day: 5, status: 'active', offer_code: 'none', service_ids: [] }}
          submitLabel="Create Member"
        />
      ) : (
        <CoupleForm action={createCouple} plans={plans} services={services} defaultJoining={joiningDate} />
      )}
    </div>
  );
}
