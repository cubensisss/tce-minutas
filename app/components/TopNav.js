'use client';

export default function TopNav() {
  return (
    <header className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center w-full px-8 py-3 border-b border-slate-200/30">
      <div className="flex items-center gap-8">
        <span className="text-xl font-[Newsreader] font-bold text-primary">The Judicial Atelier</span>
        <nav className="hidden md:flex gap-6">
          <a href="/" className="font-[Newsreader] italic font-medium text-primary border-b-2 border-primary pb-1">Processos</a>
          <a href="/configuracoes" className="font-[Newsreader] italic font-medium text-slate-500 hover:text-primary transition-colors">Configurações</a>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <button className="p-2 text-slate-500 hover:text-primary transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="p-2 text-slate-500 hover:text-primary transition-colors">
          <span className="material-symbols-outlined">settings</span>
        </button>
        <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-on-primary-container text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
        </div>
      </div>
    </header>
  );
}
