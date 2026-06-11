'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteProcessButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault(); // Evita a navegação do <Link>
    e.stopPropagation();

    if (!window.confirm('Tem certeza que deseja apagar este processo e todos os seus documentos? Esta ação não pode ser desfeita.')) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`/api/processo/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao apagar');
      router.refresh(); // Atualiza a lista na tela inicial
    } catch {
      alert('Erro ao apagar o processo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-1 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-full transition-colors disabled:opacity-50 inline-flex items-center justify-center"
      title="Apagar processo"
    >
      <span className="material-symbols-outlined text-[18px]">
        {loading ? 'hourglass_empty' : 'delete'}
      </span>
    </button>
  );
}
