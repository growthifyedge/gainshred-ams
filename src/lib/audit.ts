import { createClient } from '@/lib/supabase/server';

// Append an entry to audit_logs. Best-effort: never throws into the caller.
export async function logAudit(
  action: string,
  entity: string,
  entityId: string | null,
  details?: Record<string, unknown>
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('audit_logs').insert({
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      action,
      entity,
      entity_id: entityId,
      details: details ?? null,
    });
  } catch {
    // Auditing must never block the primary action.
  }
}
