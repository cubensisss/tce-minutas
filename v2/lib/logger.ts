/**
 * Logger compartilhado. Usa Pino (rápido, estruturado).
 * Só roda no servidor — em rotas client cai no console.
 *
 * IMPORTANTE: NÃO usamos o transport `pino-pretty` aqui. Ele roda numa
 * worker thread separada que, sob o Next.js 16 + Turbopack, morre de
 * forma instável e derruba a resposta HTTP no meio do envio (erro
 * "the worker thread exited" + uncaughtException) — isso quebrava o
 * download do DOCX. O log sai como JSON puro no stdout, que é estável.
 */
import pino from 'pino';

const isServer = typeof window === 'undefined';

export const logger = isServer
  ? pino({
      level: process.env.LOG_LEVEL ?? 'info',
      base: { service: 'tce-minutas-v2' },
    })
  : (console as unknown as pino.Logger);

export function loggerFor(scope: string) {
  if (isServer) return (logger as pino.Logger).child({ scope });
  return logger;
}
