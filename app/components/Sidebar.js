'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { icon: 'dashboard', label: 'Dashboard', href: '/' },
  { icon: 'note_add', label: 'Novo Processo', href: '/novo' },
  { icon: 'inventory_2', label: 'Arquivos', href: '/arquivos' },
  { icon: 'tune', label: 'Configurações', href: '/configuracoes' },
];

export default function Sidebar({ processoId, processoNumero }) {
  const pathname = usePathname();

  const processoNav = processoId ? [
    { icon: 'compare', label: 'Análise', href: `/processo/${processoId}/resumo` },
    { icon: 'edit_note', label: 'Diretrizes', href: `/processo/${processoId}/diretrizes` },
    { icon: 'description', label: 'Minuta', href: `/processo/${processoId}/minuta` },
  ] : [];

  return (
    <aside className="h-screen w-64 fixed left-0 top-0 border-r border-slate-200/50 bg-slate-100 flex flex-col py-6 z-40">
      {/* Logo */}
      <div className="px-6 mb-8">
        <Link href="/">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
            </div>
            <div>
              <div className="font-[Newsreader] font-bold text-primary text-lg">TCE-PE</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">The Judicial Atelier</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Processo Context */}
      {processoId && (
        <div className="px-4 mb-6">
          <div className="bg-white p-3 rounded-lg border border-slate-200/50">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Processo Ativo</p>
            <p className="text-sm font-semibold text-primary">{processoNumero || processoId}</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {/* Global Navigation - Always show the most important ones */}
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm tracking-tight transition-all ${
                isActive
                  ? 'bg-white text-primary font-semibold border-r-4 border-primary rounded-r-none'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        
        {/* Divider if showing process */}
        {processoId && <div className="h-px bg-slate-200/60 my-2 mx-4" />}

        {processoId && processoNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm tracking-tight transition-all ${
                isActive
                  ? 'bg-white text-primary font-semibold border-r-4 border-primary rounded-r-none'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pt-6 border-t border-slate-200/50 space-y-1">
        <Link href="/configuracoes"
          className="flex items-center gap-3 px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm transition-all"
        >
          <span className="material-symbols-outlined text-lg">help_outline</span>
          <span>Ajuda</span>
        </Link>
      </div>
    </aside>
  );
}
