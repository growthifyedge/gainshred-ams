# GainShred AMS — Deployment Guide

Simple, step-by-step instructions to set up the database, push to GitHub, and
deploy on Vercel. Follow the parts in order.

---

## 1. Supabase setup (the database)

1. Open your project at <https://supabase.com> → **SQL Editor**.
2. Run the SQL files **in this exact order** (paste each file's contents, then **Run**):
   1. `supabase/schema.sql` — base tables *(only if you haven't run it before)*
   2. `supabase/upgrade_phase2.sql` — Attendance + Advance payments
   3. `supabase/upgrade_phase2b.sql` — "Adjustment" payment type
   4. `supabase/seed.sql` — *optional* sample data
3. Create your admin user: **Authentication → Users → Add user** (tick *Auto Confirm*),
   then in **SQL Editor**:
   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR_LOGIN_EMAIL';
   ```
4. **Verify** everything (run in SQL Editor — expect all `true` and `admin_count >= 1`):
   ```sql
   select
     to_regclass('public.attendance') is not null               as attendance_table,
     to_regclass('public.member_attendance_status') is not null as presence_view,
     exists(select 1 from information_schema.columns
            where table_schema='public' and table_name='members'
              and column_name='advance_balance')                as advance_balance_col,
     exists(select 1 from pg_constraint
            where conname='payments_payment_method_check'
              and pg_get_constraintdef(oid) like '%adjustment%') as adjustment_supported,
     (select count(*) from public.profiles where role='admin')  as admin_count;
   ```

---

## 2. Environment variables

The app needs **two** values (both are public — safety comes from Row Level Security,
never put the `service_role` key or DB password here):

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / publishable key |

Locally these live in **`.env.local`** (never committed). On Vercel you add them in the
dashboard (Step 4).

---

## 3. Push to GitHub

Run in **PowerShell**, inside the project folder.

```powershell
# one-time cleanup of junk files
Remove-Item "Complete Folder.zip","New file.zip" -Force -ErrorAction SilentlyContinue
Remove-Item "New folder" -Recurse -Force -ErrorAction SilentlyContinue

git init
git add .
git status        # check: NO .env.local, node_modules, .next, *.zip, "New folder"
git commit -m "Initial commit: GainShred Account Management System"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/gainshred-ams.git
git push -u origin main
```

Create the empty repo first at **github.com → New repository** (make it **Private**).

---

## 4. Deploy on Vercel

1. <https://vercel.com> → **Log in with GitHub**.
2. **Add New… → Project** → **Import** your `gainshred-ams` repo.
3. Framework = **Next.js** (auto). **Root Directory = `./`** (not `New folder`).
4. Expand **Environment Variables** and add the two from Step 2
   (for Production, Preview, and Development).
5. Click **Deploy**. You'll get a `https://your-app.vercel.app` link.
6. *(Optional)* Supabase → Authentication → URL Configuration → set **Site URL** to that link.

---

## 5. Future updates

You don't redeploy manually. Just push your changes:

```powershell
git add .
git commit -m "Describe what you changed"
git push
```

Vercel automatically builds and deploys every push to `main`.
If you change the database, run the new SQL in Supabase **before** pushing.
