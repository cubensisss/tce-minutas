'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StepIndicator from '@/components/StepIndicator';
import { ResumoSchema, type Resumo } from '@/schemas/resumo';
import {
  DiretrizesSchema,
  type Diretrizes,
  type DiretrizAchado,
} from '@/schemas/diretrizes';

type Props = { params: Promise<{ id: string }> };

const RESULTADOS = [
  { v: 'irregular', label: 'Irregular' },
  { v: 'regular_com_ressalvas', label: 'Regular com ressalvas' },
  { v: 'regular', label: 'Regular' },
] as const;

// valor sentinela para o radio "deixar a IA decidir" (no schema vira null)
const AUTO = '__auto__';

export default function DiretrizesPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [diretrizes, setDiretrizes] = useState<Diretrizes | null>(null);
  const [saving, setSaving] = useState(false);
  // múltiplos achados podem estar com sugestão em andamento em paralelo
  const [suggesting, setSuggesting] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/processo/${id}`);
      const json = await res.json();
      const r = ResumoSchema.safeParse(json.processo?.resumo_data);
      if (!r.success) {
        setError('Resumo do processo está inválido. Refaça a triagem.');
        return;
      }
      setResumo(r.data);

      const existing = DiretrizesSchema.safeParse(json.processo?.diretrizes);
      const initial: Diretrizes = existing.success
        ? existing.data
        : {
            achados: r.data.achados.map((a) => ({
              achado_numero: a.numero,
              resultado: null,
              multa: { aplicar: false, valor: '' },
              debito: { imputar: false, valor: '' },
              medida: { aplicar: false, texto: '' },
              observacoes: null,
              sugestao_ia: null,
            })),
            consideracoes_conselheira: null,
          };
      setDiretrizes(initial);

      // Já dispara sugestões automáticas para os achados que ainda não têm —
      // em paralelo, sem bloquear a renderização.
      initial.achados
        .filter((a) => !a.sugestao_ia)
        .forEach((a) => pedirSugestaoIa(a.achado_numero));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function updateAchado(numero: string, patch: Partial<DiretrizAchado>) {
    setDiretrizes((d) => d && {
      ...d,
      achados: d.achados.map((a) => (a.achado_numero === numero ? { ...a, ...patch } : a)),
    });
  }

  async function pedirSugestaoIa(numero: string) {
    setSuggesting((s) => new Set(s).add(numero));
    setError(null);
    try {
      const res = await fetch('/api/diretrizes/sugerir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: id, achado_numero: numero }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'falha ao sugerir');
      updateAchado(numero, { sugestao_ia: j.sugestao });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
    } finally {
      setSuggesting((s) => {
        const next = new Set(s);
        next.delete(numero);
        return next;
      });
    }
  }

  /**
   * Aceita a sugestão da IA: aplica os valores propostos nos campos
   * multa/débito/medida do achado, marcando os checkboxes correspondentes.
   * Só os campos que a IA preencheu (não-null) são copiados.
   */
  function aceitarSugestao(numero: string) {
    setDiretrizes((d) => {
      if (!d) return d;
      return {
        ...d,
        achados: d.achados.map((a) => {
          if (a.achado_numero !== numero) return a;
          const s = a.sugestao_ia;
          if (!s) return a;
          return {
            ...a,
            multa: s.multa ? { aplicar: true, valor: s.multa } : a.multa,
            debito: s.debito ? { imputar: true, valor: s.debito } : a.debito,
            medida: s.medida ? { aplicar: true, texto: s.medida } : a.medida,
          };
        }),
      };
    });
  }

  async function handleSave() {
    if (!diretrizes) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/diretrizes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: id, diretrizes }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'falha ao salvar');
      router.push(`/processo/${id}/minuta`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
      setSaving(false);
    }
  }

  if (!resumo || !diretrizes) {
    return (
      <div className="space-y-6">
        <StepIndicator currentStep={3} />
        <div className="card text-on-surface-variant">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={3} />

      <header>
        <h1 className="text-3xl font-display font-semibold text-primary">Diretrizes do julgamento</h1>
        <p className="text-on-surface-variant mt-1">
          Para cada achado: defina o resultado (final) e marque as medidas
          sancionatórias. A IA pode sugerir uma proposta alternativa para
          multa/débito/medida — sua decisão prevalece.
        </p>
      </header>

      <section className="space-y-4">
        {resumo.achados.map((a, idx) => {
          const d = diretrizes.achados.find((x) => x.achado_numero === a.numero);
          if (!d) return null;
          return (
            <article key={a.numero} className="card space-y-4">
              <header className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary-container text-on-primary-container flex items-center justify-center font-display font-bold">
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-lg text-primary">{a.titulo}</h3>
                  <p className="text-xs uppercase tracking-wider text-on-surface-variant">Achado {a.numero}</p>
                  {a.descricao && <p className="text-sm mt-2 text-on-surface-variant">{a.descricao}</p>}
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* COLUNA 1 — RESULTADO */}
                <div className="space-y-2">
                  <label className="label">Resultado (decisão final da Relatoria)</label>
                  <div className="space-y-2">
                    {/* Opção: deixar a IA decidir */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-md border border-dashed cursor-pointer transition-colors ${
                        d.resultado === null
                          ? 'border-secondary bg-secondary-container/40'
                          : 'border-outline-variant hover:bg-surface-variant/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`res-${a.numero}`}
                        value={AUTO}
                        checked={d.resultado === null}
                        onChange={() => updateAchado(a.numero, { resultado: null })}
                        className="text-secondary focus:ring-secondary"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-base">auto_awesome</span>
                          Deixar a IA decidir
                        </span>
                        <span className="text-[11px] text-on-surface-variant">livre arbítrio com base na evidência</span>
                      </div>
                    </label>

                    {RESULTADOS.map((r) => (
                      <label
                        key={r.v}
                        className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                          d.resultado === r.v
                            ? 'border-primary bg-primary-container/40'
                            : 'border-outline-variant hover:bg-surface-variant/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`res-${a.numero}`}
                          value={r.v}
                          checked={d.resultado === r.v}
                          onChange={() =>
                            updateAchado(a.numero, { resultado: r.v as DiretrizAchado['resultado'] })
                          }
                          className="text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium">{r.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* COLUNA 2 — SANÇÕES */}
                <div className="space-y-3">
                  <label className="label">Medidas sancionatórias</label>

                  {/* Multa */}
                  <div className="rounded-md border border-outline-variant p-3 space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={d.multa.aplicar}
                        onChange={(e) =>
                          updateAchado(a.numero, {
                            multa: { ...d.multa, aplicar: e.target.checked },
                          })
                        }
                        className="rounded text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="text-sm font-medium">Aplicação de multa</span>
                      <span className="text-[11px] text-on-surface-variant">art. 73 da Lei 12.600/2004</span>
                    </label>
                    <input
                      className="input text-sm"
                      placeholder="Valor (ex: R$ 5.000,00 ou 10% do limite, art. 73, IV)"
                      value={d.multa.valor}
                      onChange={(e) =>
                        updateAchado(a.numero, {
                          multa: { ...d.multa, valor: e.target.value },
                        })
                      }
                      disabled={!d.multa.aplicar}
                    />
                  </div>

                  {/* Débito */}
                  <div className="rounded-md border border-outline-variant p-3 space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={d.debito.imputar}
                        onChange={(e) =>
                          updateAchado(a.numero, {
                            debito: { ...d.debito, imputar: e.target.checked },
                          })
                        }
                        className="rounded text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="text-sm font-medium">Imputação de débito</span>
                    </label>
                    <input
                      className="input text-sm"
                      placeholder="Valor / responsáveis solidários"
                      value={d.debito.valor}
                      onChange={(e) =>
                        updateAchado(a.numero, {
                          debito: { ...d.debito, valor: e.target.value },
                        })
                      }
                      disabled={!d.debito.imputar}
                    />
                  </div>

                  {/* Medida */}
                  <div className="rounded-md border border-outline-variant p-3 space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={d.medida.aplicar}
                        onChange={(e) =>
                          updateAchado(a.numero, {
                            medida: { ...d.medida, aplicar: e.target.checked },
                          })
                        }
                        className="rounded text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="text-sm font-medium">Medida</span>
                      <span className="text-[11px] text-on-surface-variant">recomendação / determinação / ciência</span>
                    </label>
                    <textarea
                      rows={2}
                      className="input text-sm"
                      placeholder="Descreva a medida (recomendação, determinação ou ciência) em linguagem livre"
                      value={d.medida.texto}
                      onChange={(e) =>
                        updateAchado(a.numero, {
                          medida: { ...d.medida, texto: e.target.value },
                        })
                      }
                      disabled={!d.medida.aplicar}
                    />
                  </div>
                </div>
              </div>

              {/* Observações livres */}
              <div>
                <label className="label">Observações da Conselheira (livre)</label>
                <textarea
                  rows={2}
                  className="input"
                  value={d.observacoes ?? ''}
                  onChange={(e) =>
                    updateAchado(a.numero, { observacoes: e.target.value || null })
                  }
                  placeholder="Direcionamentos específicos pra esse achado (ex: 'enfatizar boa-fé do gestor')"
                />
              </div>

              {/* Painel lateral: sugestão da IA */}
              <aside className="rounded-md border border-secondary/30 bg-secondary-container/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-base">lightbulb</span>
                    <span className="text-sm font-medium text-on-secondary-container">
                      Sugestão da IA (opcional, não vinculante)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.sugestao_ia &&
                      (d.sugestao_ia.multa || d.sugestao_ia.debito || d.sugestao_ia.medida) && (
                        <button
                          type="button"
                          onClick={() => aceitarSugestao(a.numero)}
                          className="btn-primary text-xs py-1 px-2"
                        >
                          <span className="material-symbols-outlined text-base">check</span>
                          Aceitar sugestão
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => pedirSugestaoIa(a.numero)}
                      disabled={suggesting.has(a.numero)}
                      className="btn-ghost text-xs"
                    >
                      {suggesting.has(a.numero) ? (
                        <>
                          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                          Pensando…
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-base">auto_awesome</span>
                          {d.sugestao_ia ? 'Refazer sugestão' : 'Pedir sugestão'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {suggesting.has(a.numero) && !d.sugestao_ia ? (
                  <p className="text-xs text-on-surface-variant italic">
                    A IA está analisando este achado e propondo multa/débito/medida...
                  </p>
                ) : d.sugestao_ia ? (
                  <div className="text-xs space-y-1">
                    {d.sugestao_ia.multa && (
                      <p>
                        <strong>Multa:</strong> {d.sugestao_ia.multa}
                      </p>
                    )}
                    {d.sugestao_ia.debito && (
                      <p>
                        <strong>Débito:</strong> {d.sugestao_ia.debito}
                      </p>
                    )}
                    {d.sugestao_ia.medida && (
                      <p>
                        <strong>Medida:</strong> {d.sugestao_ia.medida}
                      </p>
                    )}
                    {d.sugestao_ia.justificativa && (
                      <p className="italic text-on-surface-variant pt-1">
                        {d.sugestao_ia.justificativa}
                      </p>
                    )}
                    {d.sugestao_ia.fontes && d.sugestao_ia.fontes.length > 0 && (
                      <div className="pt-2 border-t border-secondary/20">
                        <p className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold mb-1">
                          Fontes
                        </p>
                        <ul className="space-y-1">
                          {d.sugestao_ia.fontes.map((f, fi) => (
                            <li key={fi} className="flex items-start gap-1.5">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                  f.tipo === 'legislacao'
                                    ? 'bg-primary-container text-on-primary-container'
                                    : 'bg-tertiary-container text-on-tertiary-container'
                                }`}
                              >
                                {f.tipo === 'legislacao' ? 'LEI' : 'PRECEDENTE'}
                              </span>
                              <span className="flex-1">
                                <strong>{f.citacao}</strong>
                                {f.trecho && (
                                  <span className="block text-[11px] italic text-on-surface-variant">
                                    &ldquo;{f.trecho}&rdquo;
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!d.sugestao_ia.multa &&
                      !d.sugestao_ia.debito &&
                      !d.sugestao_ia.medida && (
                        <p className="italic text-on-surface-variant">
                          A IA não identificou sanção aplicável a este achado.
                        </p>
                      )}
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant">
                    A IA pode propor multa/débito/medida com base na lei e no precedente — clique para gerar.
                  </p>
                )}
              </aside>
            </article>
          );
        })}
      </section>

      {/* Considerações livres */}
      <section className="card space-y-3">
        <h2 className="font-display text-xl text-primary">Considerações gerais (todo o voto)</h2>
        <p className="text-sm text-on-surface-variant">
          Instruções globais para a fundamentação — ex: aplicar LINDB arts. 20 e 22, citar Resolução TC 231/2024.
        </p>
        <textarea
          rows={4}
          className="input"
          value={diretrizes.consideracoes_conselheira ?? ''}
          onChange={(e) =>
            setDiretrizes((d) => d && { ...d, consideracoes_conselheira: e.target.value || null })
          }
          placeholder="Direcionamentos gerais para a redação da minuta"
        />
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-error-container text-on-surface text-sm">{error}</div>
      )}

      <div className="flex justify-between pt-4">
        <Link href={`/processo/${id}/resumo`} className="btn-ghost">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Voltar ao resumo
        </Link>
        <button onClick={handleSave} className="btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar e gerar minuta'}
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
