import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import SignOutButton from './_components/SignOutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="min-h-screen flex">
      <Sidebar userEmail={user.email ?? ''} />
      <main className="flex-1 ml-64">
        <div className="max-w-6xl mx-auto px-8 py-10">{children}</div>
      </main>
    </div>
  );
}

function Sidebar({ userEmail }: { userEmail: string }) {
  const nav = [
    { href: '/', icon: 'dashboard', label: 'Painel' },
    { href: '/novo', icon: 'add_circle', label: 'Novo Processo' },
    { href: '/similares', icon: 'travel_explore', label: 'Similares' },
    { href: '/configuracoes', icon: 'settings', label: 'Configurações' },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-surface border-r border-outline-variant flex flex-col">
      <div className="px-6 py-8 border-b border-outline-variant">
        <h1 className="font-display font-semibold text-xl text-primary leading-tight">
          Atelier
          <br />
          <span className="text-on-surface-variant text-base font-normal">Judicial</span>
        </h1>
        <p className="text-xs text-on-surface-variant mt-2">TCE-PE</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            <span className="text-sm">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-outline-variant">
        <p className="text-xs text-on-surface-variant truncate mb-2">{userEmail}</p>
        <SignOutButton />
      </div>
    </aside>
  );
}
