import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-brand-black p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            GAIN<span className="text-brand">SHRED</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-400">Account Management System</p>
        </div>
        <div className="card p-6 shadow-xl">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-neutral-500">
          Authorized staff only.
        </p>
      </div>
    </div>
  );
}
