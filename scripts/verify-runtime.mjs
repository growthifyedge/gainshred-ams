/**
 * GainShred AMS — runtime verification against a REAL Supabase project.
 *
 * What it checks (tasks 1-9): auth login, dashboard_stats, members CRUD,
 * due generation, payment creation + receipt, penalty calculation, reports
 * queries, and Admin vs Staff role enforcement (RLS).
 *
 * Usage (PowerShell):
 *   $env:VERIFY_ADMIN_EMAIL="admin@gainshred.com"; $env:VERIFY_ADMIN_PASSWORD="..."
 *   # optional, to test the Staff role too:
 *   $env:VERIFY_STAFF_EMAIL="staff@gainshred.com"; $env:VERIFY_STAFF_PASSWORD="..."
 *   node scripts/verify-runtime.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local.
 *
 * NOTE: This creates test rows prefixed "VERIFY_TEST". Because payments are never
 * hard-deleted by design, a voided test payment + its due will remain. Prefer
 * running against a fresh/staging project.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch {
    /* ignore */
  }
  return env;
}

const fileEnv = loadEnv();
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.VERIFY_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.VERIFY_ADMIN_PASSWORD;
const STAFF_EMAIL = process.env.VERIFY_STAFF_EMAIL;
const STAFF_PASSWORD = process.env.VERIFY_STAFF_PASSWORD;

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function newClient() {
  return createClient(URL, ANON, { auth: { persistSession: false } });
}

const TAG = 'VERIFY_TEST';
const monthDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const todayStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

async function main() {
  if (!URL || !ANON || URL.includes('placeholder')) {
    console.error('Missing/placeholder NEXT_PUBLIC_SUPABASE_URL or ANON key in .env.local.');
    process.exit(2);
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Set VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD env vars.');
    process.exit(2);
  }

  const admin = newClient();

  // 1) Auth
  const { data: signIn, error: signErr } = await admin.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  record('1. Auth — admin login', !signErr && !!signIn?.session, signErr?.message);
  if (signErr) return finish();

  // confirm admin role
  const { data: prof } = await admin
    .from('profiles')
    .select('role')
    .eq('id', signIn.user.id)
    .single();
  record('1b. Admin profile role = admin', prof?.role === 'admin', `role=${prof?.role}`);

  // 2) Dashboard stats
  const { data: stats, error: statsErr } = await admin.rpc('dashboard_stats');
  record(
    '2. Dashboard — dashboard_stats()',
    !statsErr && stats && 'total_members' in stats,
    statsErr?.message || JSON.stringify(stats)
  );

  // 3) Members CRUD
  let memberId = null;
  {
    const { data, error } = await admin
      .from('members')
      .insert({
        full_name: `${TAG} Member`,
        phone: '03000000000',
        monthly_fee: 1000,
        due_day: 5,
        status: 'active',
        joining_date: todayStr(),
      })
      .select('id')
      .single();
    memberId = data?.id;
    record('3a. Members — create', !error && !!memberId, error?.message);
  }
  if (memberId) {
    const { error } = await admin
      .from('members')
      .update({ monthly_fee: 1500 })
      .eq('id', memberId);
    record('3b. Members — update', !error, error?.message);

    const { error: stErr } = await admin
      .from('members')
      .update({ status: 'inactive' })
      .eq('id', memberId);
    record('3c. Members — deactivate', !stErr, stErr?.message);
    await admin.from('members').update({ status: 'active' }).eq('id', memberId);
  }

  // 5) Due generation (RPC) + 4) Payment + 7) Receipt
  let dueId = null;
  let paymentId = null;
  if (memberId) {
    const { data: due, error: dueErr } = await admin.rpc('get_or_create_due', {
      p_member: memberId,
      p_month: monthDate(),
    });
    dueId = due;
    record('5. Dues — get_or_create_due()', !dueErr && !!dueId, dueErr?.message);

    const { data: genCount, error: genErr } = await admin.rpc('generate_dues_for_month', {
      p_month: monthDate(),
    });
    record('5b. Dues — generate_dues_for_month()', !genErr, genErr?.message || `created=${genCount}`);

    const { data: pay, error: payErr } = await admin
      .from('payments')
      .insert({
        member_id: memberId,
        due_id: dueId,
        payment_month: monthDate(),
        amount: 1500,
        penalty_amount: 0,
        payment_method: 'cash',
        payment_date: todayStr(),
        notes: `${TAG} payment`,
        created_by: signIn.user.id,
      })
      .select('id, receipt_number')
      .single();
    paymentId = pay?.id;
    record(
      '4. Payments — create + auto receipt number',
      !payErr && !!pay?.receipt_number,
      payErr?.message || pay?.receipt_number
    );

    if (paymentId) {
      const { data: rec, error: recErr } = await admin
        .from('receipt_details')
        .select('receipt_number, member_name, total_paid, balance_due')
        .eq('id', paymentId)
        .single();
      record(
        '7. Receipts — receipt_details view',
        !recErr && !!rec?.receipt_number,
        recErr?.message || `total=${rec?.total_paid} balance=${rec?.balance_due}`
      );
    }
  }

  // 6) Penalty calculation — fixed Rs.500, overdue due, expect penalty_due = 500
  {
    // capture + set settings
    const { data: prev } = await admin.from('settings').select('*').eq('id', 1).single();
    await admin
      .from('settings')
      .update({ penalty_type: 'fixed', penalty_fixed: 500, penalty_grace_days: 0, penalty_max: 0 })
      .eq('id', 1);

    let penaltyDueId = null;
    if (memberId) {
      const { data: d, error } = await admin
        .from('dues')
        .insert({
          member_id: memberId,
          billing_month: '2000-01-01', // old, unique test month
          amount_due: 1000,
          due_date: todayStr(-10),
          penalty_waived: false,
        })
        .select('id')
        .single();
      penaltyDueId = d?.id;
      if (error && error.message.includes('duplicate')) {
        const { data: existing } = await admin
          .from('dues')
          .select('id')
          .eq('member_id', memberId)
          .eq('billing_month', '2000-01-01')
          .single();
        penaltyDueId = existing?.id;
      }
    }
    if (penaltyDueId) {
      const { data: dd, error } = await admin
        .from('due_details')
        .select('penalty_due, balance, status')
        .eq('id', penaltyDueId)
        .single();
      record(
        '6. Penalty — fixed Rs.500 on overdue due',
        !error && Number(dd?.penalty_due) === 500,
        error?.message || `penalty_due=${dd?.penalty_due} status=${dd?.status}`
      );
      await admin.from('dues').delete().eq('id', penaltyDueId);
    } else {
      record('6. Penalty — fixed Rs.500 on overdue due', false, 'could not create test due');
    }

    // restore settings
    if (prev) {
      await admin
        .from('settings')
        .update({
          penalty_type: prev.penalty_type,
          penalty_fixed: prev.penalty_fixed,
          penalty_grace_days: prev.penalty_grace_days,
          penalty_max: prev.penalty_max,
        })
        .eq('id', 1);
    }
  }

  // 8) Reports queries
  {
    const start = monthDate();
    const { error: colErr } = await admin
      .from('payments')
      .select('receipt_number, amount, penalty_amount, member:members(full_name)')
      .gte('payment_date', start)
      .eq('status', 'completed');
    const { error: dueRepErr } = await admin.from('due_details').select('*').gt('balance', 0);
    record('8. Reports — collection + dues queries', !colErr && !dueRepErr, colErr?.message || dueRepErr?.message);
  }

  // 9) Role enforcement (Staff) — requires staff creds
  if (STAFF_EMAIL && STAFF_PASSWORD) {
    const staff = newClient();
    const { data: sIn, error: sErr } = await staff.auth.signInWithPassword({
      email: STAFF_EMAIL,
      password: STAFF_PASSWORD,
    });
    record('9a. Auth — staff login', !sErr && !!sIn?.session, sErr?.message);

    if (!sErr) {
      // staff should be able to INSERT a payment
      let staffDue = null;
      if (memberId) {
        const { data: sd } = await staff.rpc('get_or_create_due', {
          p_member: memberId,
          p_month: monthDate(),
        });
        staffDue = sd;
      }
      const { error: staffPayErr } = await staff.from('payments').insert({
        member_id: memberId,
        due_id: staffDue,
        payment_month: monthDate(),
        amount: 1,
        penalty_amount: 0,
        payment_method: 'cash',
        payment_date: todayStr(),
        notes: `${TAG} staff payment`,
        created_by: sIn.user.id,
      });
      record('9b. RLS — staff CAN add payment', !staffPayErr, staffPayErr?.message);

      // staff should NOT be able to INSERT a member
      const { error: staffMemErr } = await staff.from('members').insert({
        full_name: `${TAG} StaffMember`,
        monthly_fee: 1,
        due_day: 5,
        status: 'active',
        joining_date: todayStr(),
      });
      record('9c. RLS — staff BLOCKED from adding member', !!staffMemErr, staffMemErr?.message || 'NOT blocked!');

      // staff should NOT be able to VOID (update) a payment.
      // Under RLS, a blocked update returns no error but affects 0 rows.
      if (paymentId) {
        const { data: vData, error: voidErr } = await staff
          .from('payments')
          .update({ status: 'void' })
          .eq('id', paymentId)
          .select('id');
        const blocked = !!voidErr || !vData || vData.length === 0;
        record('9d. RLS — staff BLOCKED from voiding payment', blocked, voidErr?.message || `rows=${vData?.length ?? 0}`);
      }

      // staff should NOT be able to change settings
      const { data: setData, error: setErr } = await staff
        .from('settings')
        .update({ gym_name: 'HACKED' })
        .eq('id', 1)
        .select('id');
      const setBlocked = !!setErr || !setData || setData.length === 0;
      record('9e. RLS — staff BLOCKED from settings', setBlocked, setErr?.message || `rows=${setData?.length ?? 0}`);

      await staff.auth.signOut();
    }
  } else {
    record('9. RLS — staff role checks', true, 'SKIPPED (no VERIFY_STAFF_EMAIL/PASSWORD)');
  }

  // Cleanup (best-effort) — void test payments, deactivate test member
  if (paymentId) await admin.from('payments').update({ status: 'void' }).eq('id', paymentId);
  await admin.from('payments').update({ status: 'void' }).ilike('notes', `${TAG}%`);
  if (memberId) await admin.from('members').update({ status: 'inactive' }).eq('id', memberId);

  await admin.auth.signOut();
  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────');
  console.log(`Total: ${results.length}  |  Passed: ${results.length - failed.length}  |  Failed: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach((f) => console.log(`  • ${f.name} — ${f.detail}`));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
