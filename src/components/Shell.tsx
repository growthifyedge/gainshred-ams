'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/auth';

type NavItem = { href: string; label: string; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/members', label: 'Members' },
  { href: '/attendance', label: 'Attendance' },
  { href: '/payments', label: 'Payments' },
  { href: '/dues', label: 'Dues' },
  { href: '/reports', label: 'Reports' },
  { href: '/export', label: 'Export', adminOnly: true },
  { href: '/settings', label: 'Settings', adminOnly: true },
];

export default function Shell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((i) => !i.adminOnly || profile.role === 'admin');

  const NavLinks = () => (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'block rounded-lg px-3 py-2 text-sm font-medium transition',
              active
                ? 'bg-brand text-white'
                : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col bg-brand-black p-4 lg:flex">
        <Brand />
        <div className="mt-6 flex-1">
          <NavLinks />
        </div>
        <UserBox profile={profile} />
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between bg-brand-black px-4 py-3 lg:hidden">
        <Brand />
        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-white"
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-neutral-800 bg-brand-black px-4 py-4 lg:hidden">
          <NavLinks />
          <div className="mt-4">
            <UserBox profile={profile} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="text-xl font-extrabold tracking-tight text-white">
      GAIN<span className="text-brand">SHRED</span>
    </Link>
  );
}

function UserBox({ profile }: { profile: Profile }) {
  return (
    <div className="rounded-lg bg-neutral-900 p-3">
      <p className="truncate text-sm font-medium text-white">
        {profile.full_name || profile.email}
      </p>
      <p className="text-xs uppercase tracking-wide text-brand">{profile.role}</p>
      <form action={logout} className="mt-3">
        <button className="w-full rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800">
          Sign out
        </button>
      </form>
    </div>
  );
}
