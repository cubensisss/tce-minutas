/**
 * Prompt master da minuta de voto (Gemini Pro).
 * Substitui o gigante embebido em app/api/minuta/gerar/route.js do v1,
 * mantendo o mesmo contrato de saída (ementa, relatorio, analise, decisao).
 *
 * Compõe quatro partes:
 *   1. SYSTEM: persona + tom + proibições + estrutura padrão
 *   2. CONTEXTO ESTRUTURADO: resumo + diretrizes
 *   3. CONTEXTO BRUTO: textos completos do relatório e das defesas
 *   4. PRECEDENTES: top-N do Vertex
 */
import type { Resumo } from '@/schemas/resumo';
import type { Diretrizes } from '@/schemas/diretrizes';
import type { SimilarResult } from '@/lib/types/database';
import { buildLimiteLegalBlock } from '@/prompts/persona';

export type BuildMinutaInput = {
  persona: string;
  tomVoz: string;
  proibicoes: string;
  estruturaPadrao: string;
  /** Valor bruto (apenas dígitos) do limite legal vigente do art. 73. */
  limiteLegalArt73: string;
  resumo: Resumo;
  diretrizes: Diretrizes;
  documentosBrutos: Array<{ filename: string; text: string }>;
  precedentes: SimilarResult[];
};

export function buildMinutaSystemPrompt(
  input: Pick<BuildMinutaInput, 'persona' | 'tomVoz' | 'proibicoes' | 'estruturaPadrao' | 'limiteLegalArt73'>,
) {
  return `# PERSONA
${input.persona}

${buildLimiteLegalBlock(input.limiteLegalArt73)}

# TOM DE VOZ
${input.tomVoz}

# PROIBIÇÕES
${input.proibicoes}

# ESTRUTURA OBRIGATÓRIA DA MINUTA
${input.estruturaPadrao}

# FORMATO DE SAÍDA (JSON estrito)
Retorne APENAS um JSON com as chaves abaixo. Sem markdown wrapper, sem
comentários, sem texto fora do JSON. O DOCX é montado a partir desses
campos — o cabeçalho (PROCESSO, RELATOR, MODALIDADE, EXERCÍCIO, UJ,
INTERESSADOS) é gerado pelo template, NÃO inclua essas linhas no
"relatorio".

{
  "ementa": "string — bloco de palavras-chave em caixa alta + dispositivos numerados (1., 2., 3.)",
  "descricao_objeto": "string|null — síntese do que foi auditado",
  "interessados": "string|null — lista de nomes (use o que veio no resumo)",
  "exercicio": "string|null — ano do exercício auditado",
  "modalidade_tipo": "string|null — ex: 'Auditoria Especial - Conformidade'",
  "relatorio": "string — narrativa cronológica do processo, SEM 'É o relatório' (já no template)",
  "analise_completa": "string — para CADA achado: '**2.1.X. Título**', '**Análise da Auditoria:**', citações com '> ', '**Defesa do Interessado:**', '**Análise do Relator:**', conclusão",
  "decisao_voto": "string — '**6. DECISÃO**', 'Ante o exposto...', itens 1. **JULGAR**, 2. **IMPUTAR DÉBITO**, 3. **APLICAR MULTA**, 4. **DECLARAR INIDONEIDADE**, 5. **DETERMINAR**, depois 'Voto no sentido de:' + CONSIDERANDOs",
  "sugestao_pendente": "string|null — pontos onde usei [VERIFICAR: ...] ou que precisam de validação humana"
}

REGRAS DE MARKDOWN (o DOCX converte literalmente):
- **negrito** vira negrito real no Word.
- *itálico* vira itálico real.
- "> trecho" no início da linha vira CITAÇÃO INDENTADA EM ITÁLICO
  (use sempre para reproduzir trechos literais de auditoria/defesa).
- Parágrafos separados por linha em branco (\\n\\n).
- NÃO usar tabelas, listas com "- ", nem cabeçalhos com "# ".
- NÃO incluir o cabeçalho "TRIBUNAL DE CONTAS DO ESTADO DE PERNAMBUCO"
  nem a IDENTIFICAÇÃO DO PROCESSO em nenhum campo — o template já
  renderiza essas caixas.`;
}

export function buildMinutaUserPrompt(input: BuildMinutaInput): string {
  const docsBlock = input.documentosBrutos
    .map(
      (d, i) =>
        `--- DOCUMENTO ${i + 1} (${d.filename}) ---\n${truncate(d.text, 40_000)}`,
    )
    .join('\n\n');

  const precedentesBlock =
    input.precedentes.length > 0
      ? input.precedentes
          .map(
            (p, i) =>
              `### Precedente ${i + 1}${p.title ? ` — ${p.title}` : ''}
Link: ${p.link ?? 'n/a'}
Trecho relevante:
${p.snippet ?? '(sem trecho)'}`,
          )
          .join('\n\n')
      : '(sem precedentes encontrados na base vetorial)';

  return `# RESUMO DO PROCESSO (extraído na triagem)
${JSON.stringify(input.resumo, null, 2)}

# DIRETRIZES DA CONSELHEIRA (decisões já tomadas — espelhar literalmente)
${JSON.stringify(input.diretrizes, null, 2)}

# DOCUMENTOS BRUTOS (fonte primária — extrair citações literais daqui)
${docsBlock}

# PRECEDENTES JURISPRUDENCIAIS DO TCE-PE
# Esta é a SUA FONTE de jurisprudência. Leia cada trecho com atenção:
# - Se um trecho citar número de acórdão/processo (ex: "Acórdão TC nº
#   1891/19", "Processo nº 24101338-0"), você PODE e DEVE reproduzir esse
#   número na análise do achado aderente, no formato real.
# - Extraia o número EXATAMENTE como está escrito. Nunca invente nem
#   complete números. Se o trecho não tiver número, não cite acórdão nominal.
# - Aproveite a fundamentação dos trechos (teses, dispositivos, raciocínio)
#   para enriquecer a Análise do Relator do achado correspondente.
# - Use um precedente apenas no achado a que ele for materialmente aderente.
${precedentesBlock}

# TAREFA
Elabore a minuta de voto seguindo RIGOROSAMENTE a estrutura padrão.

Para CADA achado das diretrizes, na seção 5 (analise_completa):
  1. Bloco "Análise da auditoria": entre aspas, transcreva pelo menos
     2 trechos LITERAIS do Relatório de Auditoria (busque nos documentos
     brutos) que fundamentem o achado. Após as citações, faça resumo.
  2. Bloco "Defesa do interessado": entre aspas, transcreva pelo menos
     2 trechos LITERAIS da Defesa correspondente. Se houver múltiplas
     defesas, separe com subtítulos (Defesa do Prefeito, Defesa da
     Empresa, etc.). Após as citações, faça resumo.
  3. Bloco "Análise do Relator": aplicar o MÉTODO DOS 4 ATOS sem
     mostrar os títulos das etapas. Iniciar com "Compulsando os autos,
     verifico que a equipe técnica apontou..." ou similar. Detalhar
     datas, metragens e valores exatos. Concluir com "Diante do
     exposto, voto por (...)" usando LITERALMENTE o "resultado" das
     DIRETRIZES (irregular / regular_com_ressalvas / regular).

     PROFUNDIDADE OBRIGATÓRIA da Análise do Relator (mínimo 4-6
     parágrafos densos por achado — este é o coração da minuta):
     a) DESDOBRE os dispositivos legais, não apenas os cite. Em vez de
        "viola o art. 24 da Lei 8.080/90", explique O QUE o dispositivo
        exige em concreto: "o art. 24 da Lei 8.080/90 condiciona a
        participação complementar da iniciativa privada à demonstração
        objetiva — via diagnóstico situacional, quantitativo de
        profissionais efetivos, taxa de ocupação da estrutura e demanda
        reprimida — de que a rede própria opera em capacidade máxima".
     b) CITE JURISPRUDÊNCIA quando, e SOMENTE quando, houver precedente
        aderente nos PRECEDENTES fornecidos. Use o formato real:
        "Acórdão T.C. nº [número] (Processo nº [número])". Extraia os
        números EXATAMENTE como aparecem no trecho do precedente —
        nunca invente, nunca aproxime, nunca complete um número parcial.
        Se o trecho não traz número de acórdão, NÃO cite jurisprudência
        nominal (pode referir "a jurisprudência consolidada desta Corte"
        sem número).
     c) CONTRAPONHA argumento por argumento: exponha a tese da auditoria,
        depois a da defesa, depois POR QUE acolhe ou rejeita cada uma,
        ancorando em lei + (quando houver) jurisprudência. Considere
        nuances (ex: "é possível haver demanda reprimida e, ao mesmo
        tempo, capacidade ociosa por má gestão de escalas").
     d) Ao aplicar a LINDB, distinga o art. 20 (consequências práticas
        da decisão) do art. 22 (dificuldades reais do gestor) e diga
        qual incide e por quê.

ESTRUTURA DAS DIRETRIZES (interpretação obrigatória):
- diretrizes.achados[i].resultado:
  • Se "irregular" → "voto pela IRREGULARIDADE" (DEFINITIVO)
  • Se "regular_com_ressalvas" → "voto pela REGULARIDADE COM RESSALVAS" (DEFINITIVO)
  • Se "regular" → "voto pela REGULARIDADE" (DEFINITIVO)
  • Se null → a Conselheira deixou em ABERTO. Você tem livre arbítrio
    para decidir entre as três hipóteses, FUNDAMENTANDO a escolha com:
    (a) Lei 12.600/2004 art. 59 (regular se exatidão+legalidade; ressalvas
    se falha formal sem dano grave; irregular se grave infração ou dano);
    (b) LINDB arts. 20 e 22 (ponderar dificuldades reais, ausência de erro
    grosseiro, eficácia das medidas corretivas); (c) gravidade declarada do
    achado e qualidade da defesa apresentada. Quando decidir você mesmo,
    sinalize em sugestao_pendente: "Decisão tomada pela IA — confirmar".
- diretrizes.achados[i].multa.aplicar=true → aplicar multa com o valor
  em diretrizes.achados[i].multa.valor (texto livre da Conselheira) e
  fundamento no art. 73 da Lei 12.600/2004 (escolha o inciso aderente).
- diretrizes.achados[i].debito.imputar=true → imputar débito com o valor
  em diretrizes.achados[i].debito.valor.
- diretrizes.achados[i].medida.aplicar=true → incluir o texto literal de
  diretrizes.achados[i].medida.texto como recomendação/determinação/ciência.
- Se algum dos três acima estiver com aplicar=false, você TEM AUTORIZAÇÃO
  para aplicar a sanção quando ela for RAZOÁVEL diante:
    (a) do resultado escolhido (ex: irregular sem multa é incomum quando
        há grave infração comprovada);
    (b) da gravidade do achado;
    (c) da Lei 12.600/2004 (art. 73 com inciso adequado para multa, art. 62
        para débito quando houver dano apurado);
    (d) da LINDB (atenuantes que evitem aplicação automática).
  Quando aplicar uma sanção não marcada pela Conselheira, OBRIGATÓRIO:
    1. Calcular respeitando as faixas do art. 73 (multa = % sobre o LIMITE LEGAL VIGENTE indicado no system prompt —
       NUNCA % sobre sobrepreço, contrato ou dano);
    2. Justificar no bloco "Análise do Relator" do achado correspondente;
    3. Anotar em sugestao_pendente: "Sanção aplicada pela IA por inferência —
       confirmar: [tipo] no achado [n]".
  Se NÃO for razoável aplicar (ex: regular sem dano, falha estritamente
  formal), NÃO aplicar nada.
- diretrizes.achados[i].sugestao_ia, se presente, é uma proposta antiga
  da própria IA — IGNORAR para a minuta final, ela já foi avaliada pela
  Conselheira.

Os CONSIDERANDOs em decisao_voto refletem os fatos e o direito
aplicável; cada um em parágrafo próprio iniciando com "CONSIDERANDO".
Os itens em algarismos romanos (I, II, III...) devem espelhar
EXATAMENTE o resultado por achado, multas, débitos e medidas das
DIRETRIZES.

REGRAS CRÍTICAS:
- Use SOMENTE artigos da Lei 12.600/2004, LINDB (arts. 20 e 22),
  Lei 8.666/93, Lei 14.133/2021 e Lei 10.028/2000 — todos descritos
  na PERSONA. Outros dispositivos só se vierem nos documentos brutos.
- NUNCA inverter o resultado das diretrizes quando ele estiver definido
  (irregular/regular_com_ressalvas/regular). Só decidir você mesmo
  quando resultado=null.
- NUNCA mudar o valor de multa/débito/medida QUANDO a Conselheira
  marcou aplicar=true — esses valores são literais.
- Quando aplicar=false, você está AUTORIZADO a aplicar a sanção se for
  razoável (ver "ESTRUTURA DAS DIRETRIZES" acima) — sempre calculando
  multa pelo art. 73 (% sobre o LIMITE LEGAL VIGENTE indicado no system prompt) e anotando em sugestao_pendente.
- NUNCA inventar precedente, processo, conselheiro ou número de voto.
- NUNCA aplicar % sobre sobrepreço/contrato/dano — multa é SEMPRE %
  sobre o LIMITE LEGAL VIGENTE (informado no system prompt, bloco
  "LIMITE LEGAL VIGENTE DO ART. 73"), nunca sobre R$ 50.000,00 fixo
  nem sobre qualquer outra base.
- Se faltar informação essencial, usar [VERIFICAR: ...] e listar
  em sugestao_pendente.`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor(max / 2) - 50;
  return s.slice(0, half) + '\n\n[... TEXTO TRUNCADO ...]\n\n' + s.slice(-half);
}
