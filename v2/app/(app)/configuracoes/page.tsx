'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PersonaConfig } from '@/lib/types/persona';

const SECTIONS: Array<{ key: keyof PersonaConfig; label: string; chave: string }> = [
  { key: 'persona', label: 'Persona', chave: 'persona' },
  { key: 'tomVoz', label: 'Tom de voz', chave: 'tom_voz' },
  { key: 'proibicoes', label: 'Proibições', chave: 'proibicoes' },
  { key: 'estruturaPadrao', label: 'Estrutura padrão', chave: 'estrutura_padrao' },
  { key: 'precedentesObrigatorios', label: 'Precedentes obrigatórios', chave: 'precedentes_obrigatorios' },
];

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<PersonaConfig | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/configuracoes')
      .then((r) => r.json())
      .then((j) => setConfig(j.config));
  }, []);

  async function save(field: keyof PersonaConfig, chave: string, valor?: string) {
    if (!config) return;
    setSavingKey(chave);
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave, valor: valor ?? config[field] }),
      });
      if (res.ok) {
        setSavedKey(chave);
        setTimeout(() => setSavedKey(null), 2000);
      }
    } finally {
      setSavingKey(null);
    }
  }

  // Preview formatado do limite legal (R$ 75.000,00) para feedback visual.
  const limitePreview = useMemo(() => {
    const digits = (config?.limiteLegalArt73 ?? '').replace(/\D/g, '');
    const num = digits ? Number(digits) : 0;
    if (!num) return null;
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [config?.limiteLegalArt73]);

  if (!config) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-display font-semibold text-primary">Configurações</h1>
        <div className="card text-on-surface-variant">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-display font-semibold text-primary">Configurações</h1>
        <p className="text-on-surface-variant mt-1">
          Ajuste a persona da Conselheira, tom de voz e proibições. Aplicado em todas as próximas minutas geradas.
        </p>
      </header>

      {/* Limite legal do art. 73 — campo numérico, não textarea. Valor base
          de cálculo das multas; o TCE-PE atualiza periodicamente. */}
      <section className="card space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-primary">Limite legal do art. 73</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Base de cálculo das multas (Lei 12.600/2004, art. 73). O TCE-PE
              atualiza este valor periodicamente — informe o valor vigente em
              reais, sem pontuação. Ex: <code className="text-on-surface">75000</code>.
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              // Salva apenas dígitos no banco — a formatação é feita no consumo.
              const digits = (config.limiteLegalArt73 ?? '').replace(/\D/g, '') || '50000';
              setConfig({ ...config, limiteLegalArt73: digits });
              save('limiteLegalArt73', 'limite_legal_art_73', digits);
            }}
            disabled={savingKey === 'limite_legal_art_73'}
          >
            {savingKey === 'limite_legal_art_73'
              ? 'Salvando...'
              : savedKey === 'limite_legal_art_73'
              ? 'Salvo ✓'
              : 'Salvar'}
          </button>
        </header>
        <div className="flex items-center gap-3">
          <input
            className="input max-w-[200px] text-lg font-mono"
            inputMode="numeric"
            placeholder="50000"
            value={config.limiteLegalArt73 ?? ''}
            onChange={(e) =>
              setConfig({ ...config, limiteLegalArt73: e.target.value.replace(/\D/g, '') })
            }
          />
          {limitePreview && (
            <span className="text-on-surface-variant text-sm">
              ≈ <strong className="text-on-surface">{limitePreview}</strong>
            </span>
          )}
        </div>
      </section>

      {SECTIONS.map((section) => (
        <section key={section.chave} className="card space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="font-display text-xl text-primary">{section.label}</h2>
            <button
              className="btn-primary"
              onClick={() => save(section.key, section.chave)}
              disabled={savingKey === section.chave}
            >
              {savingKey === section.chave
                ? 'Salvando...'
                : savedKey === section.chave
                ? 'Salvo ✓'
                : 'Salvar'}
            </button>
          </header>
          <textarea
            className="input"
            rows={6}
            value={config[section.key]}
            onChange={(e) => setConfig({ ...config, [section.key]: e.target.value })}
          />
        </section>
      ))}
    </div>
  );
}
