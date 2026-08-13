'use client';

import { useEffect, useState } from 'react';

type ProgressPayload = {
  phase?: string;
  message?: string;
  progress?: number;
  timings?: Record<string, number>;
};

type JobState = {
  status: 'queued' | 'running' | 'done' | 'error';
  payload: ProgressPayload | null;
  error: string | null;
};

export default function JobProgress({ jobId }: { jobId: string | null }) {
  const [job, setJob] = useState<JobState | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/jobs?id=${encodeURIComponent(jobId!)}`, { cache: 'no-store' });
        const json = await res.json();
        if (!stopped && res.ok) setJob(json.job);
      } catch {
        // A operacao principal continua mesmo se uma atualizacao falhar.
      }
    }
    poll();
    const timer = setInterval(poll, 1200);
    return () => { stopped = true; clearInterval(timer); };
  }, [jobId]);

  const payload = job?.payload;
  const pct = Math.max(2, Math.min(100, payload?.progress ?? 2));
  const timings = payload?.timings ?? {};

  return (
    <div className="mt-4 space-y-2">
      <div className="h-2 overflow-hidden rounded-full bg-surface-variant">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
        <span>{payload?.message ?? 'Preparando a operacao...'}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      {Object.keys(timings).length > 0 && (
        <p className="text-[11px] text-on-surface-variant">
          Tempos medidos: {Object.entries(timings)
            .filter(([name]) => name !== 'total_ms')
            .map(([name, ms]) => `${label(name)} ${(ms / 1000).toFixed(1)}s`)
            .join(' | ')}
        </p>
      )}
    </div>
  );
}

function label(name: string) {
  const labels: Record<string, string> = {
    documentos_ms: 'documentos',
    extracao_ocr_ms: 'extracao/OCR',
    precedentes_ms: 'precedentes',
    triagem_ia_ms: 'triagem IA',
    redacao_ms: 'redacao IA',
  };
  return labels[name] ?? name.replace(/_ms$/, '').replaceAll('_', ' ');
}
