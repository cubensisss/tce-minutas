import type { SupabaseClient } from '@supabase/supabase-js';

export type JobProgress = {
  phase: string;
  message: string;
  progress: number;
  timings?: Record<string, number>;
};

export async function updateJobProgress(
  supabase: SupabaseClient,
  jobId: string | null | undefined,
  progress: JobProgress,
  status: 'running' | 'done' | 'error' = 'running',
) {
  if (!jobId) return;
  await supabase
    .from('jobs')
    .update({
      status,
      payload: progress,
      ...(status === 'running' && progress.progress <= 8
        ? { started_at: new Date().toISOString() }
        : {}),
      ...(status === 'done' || status === 'error'
        ? { finished_at: new Date().toISOString() }
        : {}),
    })
    .eq('id', jobId);
}

export function elapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}
