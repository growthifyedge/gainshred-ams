'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getKarachiDate } from '@/lib/utils';

// Check a member IN. The DB has a unique partial index that allows only one
// open session per member, so a duplicate check-in simply does nothing.
// We stamp `date` with the Karachi business date so "today" is correct on Vercel (UTC).
export async function checkIn(memberId: string) {
  const profile = await getProfile();
  if (!profile) return;

  const supabase = createClient();
  const { error } = await supabase
    .from('attendance')
    .insert({ member_id: memberId, created_by: profile.id, date: getKarachiDate() });

  // Ignore unique-violation (already inside); any other state is reflected on reload.
  if (!error) await logAudit('check_in', 'attendance', memberId);
  revalidatePath('/attendance');
}

// Check a member OUT — only affects the currently OPEN session (check_out_at is null).
export async function checkOut(memberId: string) {
  const profile = await getProfile();
  if (!profile) return;

  const supabase = createClient();
  const { error } = await supabase
    .from('attendance')
    .update({ check_out_at: new Date().toISOString(), status: 'outside' })
    .eq('member_id', memberId)
    .is('check_out_at', null);

  if (!error) await logAudit('check_out', 'attendance', memberId);
  revalidatePath('/attendance');
}
