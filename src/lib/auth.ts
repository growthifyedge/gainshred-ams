import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'staff';

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
};

// Returns the current user's profile, or null if not signed in.
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .single();

  if (!data) {
    // Profile row not created yet — treat as least-privileged staff.
    return { id: user.id, full_name: '', email: user.email ?? null, role: 'staff' };
  }
  return data as Profile;
}

export async function isAdmin(): Promise<boolean> {
  const p = await getProfile();
  return p?.role === 'admin';
}
