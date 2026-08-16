export type ApiResponsePayload = Record<string, unknown>;

export async function readApiResponse(response: Response): Promise<ApiResponsePayload> {
  const text = await response.text();

  if (!text.trim()) {
    return {
      error: 'resposta_vazia',
      message: response.status === 504
        ? 'A geração atingiu o tempo limite do servidor. Tente novamente.'
        : `O servidor encerrou a solicitação sem enviar detalhes (HTTP ${response.status}). Tente novamente.`,
    };
  }

  try {
    const payload: unknown = JSON.parse(text);
    if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as ApiResponsePayload;
    }
  } catch {
    // A resposta de erro de proxies e plataformas pode ser HTML ou texto puro.
  }

  return {
    error: 'resposta_invalida',
    message: `O servidor devolveu uma resposta inválida (HTTP ${response.status}). Tente novamente.`,
  };
}

export function apiMessage(payload: ApiResponsePayload, fallback: string): string {
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  return fallback;
}
