import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-display font-semibold text-primary mb-4">404</h1>
        <p className="text-on-surface-variant mb-6">
          Esta página não existe ou foi removida.
        </p>
        <Link href="/" className="btn-primary">
          <span className="material-symbols-outlined text-base">home</span>
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}
