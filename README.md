# GainShred — Account Management System (V1)

A web-based admin system to manage gym members, payments, receipts, dues, late-payment
penalties and reports for the **GainShred** fitness brand.

**Stack:** Next.js 14 (App Router + Server Actions) · Supabase (Postgres + Auth + Storage) ·
Tailwind CSS · TypeScript · Zod validation.

---

## 1. Project structure

```
gainshred-ams/
├─ supabase/
│  ├─ schema.sql            # All tables, views, functions, triggers, RLS, storage
│  └─ seed.sql              # Optional sample plans/members + a sample penalty rule
├─ src/
│  ├─ middleware  ─────────► ../middleware.ts  (route protection / session refresh)
│  ├─ app/
│  │  ├─ layout.tsx         # Root layout
│  │  ├─ globals.css        # Tailwind + black/red/white theme
│  │  ├─ page.tsx           # Redirects to /dashboard
│  │  ├─ login/             # Login page + auth server actions
│  │  ├─ (app)/             # Authenticated area (sidebar shell)
│  │  │  ├─ layout.tsx      # Guards the area, renders <Shell/>
│  │  │  ├─ dashboard/      # KPIs, recent payments, overdue members
│  │  │  ├─ members/        # List, add, edit, (de)activate, delete
│  │  │  ├─ payments/       # List + add receipt (with image upload), void
│  │  │  ├─ dues/           # Member-wise dues, generate dues, waive penalty
│  │  │  ├─ reports/        # Collection / dues / penalty / member history + CSV
│  │  │  └─ settings/       # Gym info, penalty rule, membership plans (admin)
│  │  └─ receipt/[id]/      # Printable receipt (Print / Save as PDF)
│  ├─ components/           # Shell, forms, tables, badges, buttons
│  └─ lib/
│     ├─ supabase/          # browser / server / middleware clients
│     ├─ auth.ts            # getProfile(), role helpers
│     ├─ audit.ts           # audit-log writer
│     ├─ utils.ts           # money/date/CSV helpers
│     └─ validations.ts     # Zod schemas
├─ .env.local.example
├─ package.json
└─ README.md
```

---

## 2. Database design (important notes)

The schema in `supabase/schema.sql` creates every table you asked for plus the supporting
logic. A few deliberate design choices for a clean MVP:

- **`dues` is the ledger.** One row per member per billing month (`amount_due`, `due_date`).
  Payments are applied against a due. Balance = `amount_due − amount paid`.
- **Penalties are *calculated*, not stored.** The `calc_penalty()` function reads the penalty
  rule from `settings` and the days past due, so the outstanding penalty is always current.
  Collected penalties live on `payments.penalty_amount`; the **`penalties`** table records
  manual **waivers/adjustments** (audit trail). Admins can waive a penalty per due.
- **A payment *is* a receipt.** The receipt number is auto-generated on the payment
  (`GS-YYYY-00001`). **`receipt_details`** is a view that assembles the printable receipt
  (member + amounts + balance). This avoids duplicating payment data into a separate table.
- **Nothing financial is hard-deleted.** Payments are **voided** (`status = 'void'`) and kept
  in history. Members with payment history are deactivated rather than deleted (FK protected).
- **`audit_logs`** records important actions (create/update/void/waive/settings/etc.).

### Role matrix (V1)

| Capability                         | Admin | Staff |
|-----------------------------------|:-----:|:-----:|
| View dashboard / members / dues / reports / receipts | ✅ | ✅ |
| Add payments (receipts)           | ✅ | ✅ |
| Add / edit members                | ✅ | ❌ |
| (De)activate / delete members     | ✅ | ❌ |
| Void payments                     | ✅ | ❌ |
| Generate dues / waive penalties   | ✅ | ❌ |
| Manage plans & settings           | ✅ | ❌ |
| View audit logs (via SQL)         | ✅ | ❌ |

Roles are enforced in **three layers**: Postgres Row Level Security, server-action checks,
and UI gating. (You can loosen staff permissions later by editing the RLS policies + the
`role !== 'admin'` checks in the `actions.ts` files.)

---

## 3. Setup guide (step by step)

### Step 1 — Create a Supabase project
1. Go to <https://supabase.com> → **New project**. Pick a name, password and region.
2. Wait for it to provision.

### Step 2 — Run the schema
1. In the Supabase dashboard open **SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql` and click **Run**.
3. (Optional) Run `supabase/seed.sql` for sample plans/members and an example penalty rule.

The schema also creates a public **`receipts` storage bucket** for optional receipt images.
If your project blocks creating storage policies via SQL, create the bucket manually:
**Storage → New bucket → name `receipts`, Public → on.**

### Step 3 — Get your API keys
**Project Settings → API**, copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 4 — Configure the app
```bash
copy .env.local.example .env.local      # Windows
# cp .env.local.example .env.local       # macOS/Linux
```
Edit `.env.local` and paste your two values.

### Step 5 — Install & run
```bash
npm install
npm run dev
```
Open <http://localhost:3000>. You'll be redirected to **/login**.

---

## 4. Authentication setup (create your first admin)

Supabase Auth (email + password) is already wired up. A trigger auto-creates a `profiles`
row for every new user (default role **staff**). To create the **admin**:

1. Supabase dashboard → **Authentication → Users → Add user**.
   - Email: e.g. `admin@gainshred.com`, set a password, tick **Auto Confirm User**.
2. Promote them to admin — **SQL Editor**:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Gym Admin'
   where email = 'admin@gainshred.com';
   ```
3. To add **staff**, repeat step 1 (they default to the `staff` role — no SQL needed).

> Tip: Under **Authentication → Providers → Email**, you can turn **Confirm email** off for an
> internal tool, or keep "Auto Confirm User" ticked when creating accounts manually.

Sign in at `/login` with the admin email/password.

---

## 5. Running locally

```bash
npm run dev      # start dev server on http://localhost:3000
npm run build    # production build
npm run start    # run the production build
```

---

## 6. Build verification

```bash
npm install
npm run build
```
A successful build prints a route table (each page under `/dashboard`, `/members`, etc.) with
no TypeScript errors. Then smoke-test the flow:

1. Sign in as admin.
2. **Settings** → set a penalty rule (e.g. Fixed Rs. 500, grace 3 days) and add a plan.
3. **Members** → add a member with a monthly fee and due day.
4. **Dues** → *Generate Dues* for the current (or a past) month.
5. **Payments** → *Add Payment* for that member → you land on the printable **receipt**.
6. **Dashboard** updates (paid this month, pending, overdue, penalties).
7. **Reports** → open each tab, export CSV.
8. Create a **staff** user → confirm Settings is hidden and member edit/void is blocked.

---

## 7. Suggestions for Version 1.5 (after the MVP)

- **WhatsApp / SMS / email reminders** for upcoming and overdue dues (Twilio / Meta WhatsApp
  Cloud API), plus a "send receipt" button.
- **Scheduled auto-generation of dues** on the 1st of each month (Supabase `pg_cron` or a
  Vercel Cron hitting a route) so you don't click *Generate Dues* manually.
- **Server-side PDF receipts** (e.g. `@react-pdf/renderer`) for pixel-perfect downloads and
  email attachments, instead of browser print.
- **Member self-service portal** — members log in to see their dues and download receipts.
- **Partial-payment & advance-payment UX** — show outstanding balance inline on the payment
  form and support paying multiple months at once.
- **Charts on the dashboard** — monthly collection trend, plan distribution, churn.
- **Proper user management UI** for inviting/disabling staff and editing roles (instead of SQL).
- **Audit-log viewer** page for admins.
- **Income vs. expense tracking** (rent, salaries, equipment) for a basic P&L.
- **Soft-delete + restore** everywhere, and per-page export to real `.xlsx`.
- **Tests** (Vitest + Playwright) and CI.

### Attendance roadmap
- **QR check-in** — *planned.* Each member gets a QR code; the front desk scans it to
  toggle check-in/out (reuses the existing `attendance` table and `checkIn`/`checkOut` actions).
- **Fingerprint / biometric scanning** — *deferred* (not implemented in this phase).

---

Built as a lean, working Version 1 — easy to extend. 💪
