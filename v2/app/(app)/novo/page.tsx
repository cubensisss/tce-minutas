'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import StepIndicator from '@/components/StepIndicator';
import { createClient } from '@/lib/supabase/client';

function sanitize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 200);
}

type FileKind = 'relatorio' | 'defesa';

export default function NovoProcessoPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setProgress('Criando processo...');

    const form = new FormData(e.currentTarget);
    const supabase = createClient();

    try {
      // 1. Cria o processo SEM metadados — a triagem extrai do relatório.
      //    O backend grava placeholders ("(extraindo...)") em número e
      //    unidade jurisdicionada, e a chamada a /api/resumo sobrescreve.
      const res = await fetch('/api/processos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'falha ao criar processo');
      const processoId: string = json.id;

      // 2. Coleta arquivos
      const files: Array<{ kind: FileKind; file: File }> = [];
      const relatorio = form.get('relatorio');
      if (relatorio instanceof File && relatorio.size > 0) {
        files.push({ kind: 'relatorio', file: relatorio });
      }
      const defesas = form.getAll('defesa');
      for (const f of defesas) {
        if (f instanceof File && f.size > 0) files.push({ kind: 'defesa', file: f });
      }

      // 3. Upload direto pro Storage (browser → Supabase) + insere registro
      let i = 1;
      for (const { kind, file } of files) {
        setProgress(`Enviando arquivo ${i}/${files.length}: ${file.name}`);
        const safeName = sanitize(file.name);
        const path = `${processoId}/${kind}/${Date.now()}_${safeName}`;

        const { error: upErr } = await supabase.storage
          .from('documentos')
          .upload(path, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          });
        if (upErr) throw new Error(`upload ${file.name}: ${upErr.message}`);

        const { error: insErr } = await supabase.from('documentos').insert({
          processo_id: processoId,
          kind,
          filename: safeName,
          storage_path: path,
          size_bytes: file.size,
          content_type: file.type || null,
          // legado v1 (caso a tabela ainda exija)
          tipo: kind === 'relatorio' ? 'auditoria' : kind,
          nome_arquivo: safeName,
        });
        if (insErr) throw new Error(`registro ${file.name}: ${insErr.message}`);
        i++;
      }

      setProgress('Pronto. Redirecionando...');
      router.push(`/processo/${processoId}/resumo`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro desconhecido');
      setProgress(null);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={1} />
      <header>
        <h1 className="text-3xl font-display font-semibold text-primary">Novo processo</h1>
        <p className="text-on-surface-variant mt-1">
          Carregue o relatório de auditoria e as defesas prévias. Os
          metadados (número, unidade jurisdicionada, exercício, interessados)
          serão extraídos automaticamente do relatório na próxima etapa.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="label" htmlFor="relatorio">Relatório de auditoria (PDF ou DOCX)</label>
          <input
            id="relatorio"
            name="relatorio"
            type="file"
            accept=".pdf,.docx"
            required
            className="input file:bg-primary file:text-on-primary file:border-0 file:rounded-full file:px-4 file:py-1 file:mr-4"
          />
        </div>

        <div>
          <label className="label" htmlFor="defesa">Defesas prévias (PDF ou DOCX, várias)</label>
          <input
            id="defesa"
            name="defesa"
            type="file"
            multiple
            accept=".pdf,.docx"
            className="input file:bg-primary file:text-on-primary file:border-0 file:rounded-full file:px-4 file:py-1 file:mr-4"
          />
        </div>

        {progress && !error && (
          <div className="p-4 rounded-xl bg-primary-container/40 text-on-surface text-sm flex items-center gap-2">
            <span className="material-symbols-outlined animate-spin text-primary text-base">progress_activity</span>
            {progress}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-error-container text-on-surface text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar e iniciar triagem'}
          </button>
        </div>
      </form>
    </div>
  );
}
