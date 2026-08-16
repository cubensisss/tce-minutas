'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SignOutButton from './SignOutButton';

const NAV = [
  { href: '/', icon: 'dashboard', label: 'Painel' },
  { href: '/novo', icon: 'add_circle', label: 'Novo Processo' },
  { href: '/similares', icon: 'travel_explore', label: 'Similares' },
  { href: '/configuracoes', icon: 'settings', label: 'Configurações' },
];

export default function AppSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  return (
    <>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 bg-surface border-r border-outline-variant flex-col">
        <Brand />
        <Navigation pathname={pathname} />
        <div className="px-4 py-4 border-t border-outline-variant">
          <p className="text-xs text-on-surface-variant truncate mb-2">{userEmail}</p>
          <SignOutButton />
        </div>
      </aside>

      <details className="lg:hidden sticky top-0 z-40 bg-surface border-b border-outline-variant group">
        <summary className="list-none min-h-16 px-4 flex items-center justify-between cursor-pointer">
          <div className="flex items-baseline gap-2">
            <strong className="font-display text-xl text-primary">Atelier Judicial</strong>
            <span className="text-xs text-on-surface-variant">TCE-PE</span>
          </div>
          <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
        </summary>
        <div className="border-t border-outline-variant px-3 py-3 shadow-[var(--shadow-elev-2)]">
          <Navigation pathname={pathname} />
          <div className="px-3 pt-3 mt-3 border-t border-outline-variant">
            <p className="text-xs text-on-surface-variant truncate mb-2">{userEmail}</p>
            <SignOutButton />
          </div>
        </div>
      </details>
    </>
  );
}

function Brand() {
  return (
    <div className="px-6 py-8 border-b border-outline-variant">
      <h1 className="font-display font-semibold text-xl text-primary leading-tight">
        Atelier<br /><span className="text-on-surface-variant text-base font-normal">Judicial</span>
      </h1>
      <p className="text-xs text-on-surface-variant mt-2">TCE-PE</p>
    </div>
  );
}

function Navigation({ pathname }: { pathname: string }) {
  return (
    <nav className="flex-1 px-3 py-3 space-y-1" aria-label="Navegação principal">
      {NAV.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
              active
                ? 'bg-primary-container text-on-primary-container font-semibold'
                : 'text-on-surface-variant hover:bg-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
