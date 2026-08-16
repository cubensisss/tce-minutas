import { describe, expect, it } from 'vitest';
import { apiMessage, readApiResponse } from '@/lib/http/api-response';

describe('readApiResponse', () => {
  it('le respostas JSON validas', async () => {
    const payload = await readApiResponse(new Response(
      JSON.stringify({ ok: true, message: 'concluido' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    expect(payload).toEqual({ ok: true, message: 'concluido' });
  });

  it('explica respostas vazias sem lancar erro de JSON', async () => {
    const payload = await readApiResponse(new Response(null, { status: 500 }));

    expect(payload.error).toBe('resposta_vazia');
    expect(apiMessage(payload, 'fallback')).toContain('HTTP 500');
  });

  it('explica respostas nao JSON sem expor o corpo da plataforma', async () => {
    const payload = await readApiResponse(new Response('<html>Internal error</html>', { status: 502 }));

    expect(payload.error).toBe('resposta_invalida');
    expect(apiMessage(payload, 'fallback')).toContain('HTTP 502');
    expect(apiMessage(payload, 'fallback')).not.toContain('<html>');
  });

  it('mostra uma mensagem especifica para timeout vazio', async () => {
    const payload = await readApiResponse(new Response(null, { status: 504 }));

    expect(apiMessage(payload, 'fallback')).toContain('tempo limite');
  });
});
