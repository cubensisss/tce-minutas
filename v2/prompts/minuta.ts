/**
 * Prompt master da minuta de voto (Gemini Pro).
 * Substitui o gigante embebido em app/api/minuta/gerar/route.js do v1,
 * mantendo o mesmo contrato de saída (ementa, relatorio, analise, decisao).
 *
 * Compõe quatro partes:
 *   1. SYSTEM: persona + tom + proibições + estrutura padrão
 *   2. CONTEXTO ESTRUTURADO: resumo + diretrizes
 *   3. CONTEXTO BRUTO: textos completos do relatório e das defesas
 *   4. PRECEDENTES: top-N da busca híbrida (fonte oficial + acervo do gabinete)
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
  /** Precedentes ou entendimentos que devem ser considerados em toda minuta. */
  precedentesObrigatorios: string;
  /** Valor bruto (apenas dígitos) do limite legal vigente do art. 73. */
  limiteLegalArt73: string;
  resumo: Resumo;
  diretrizes: Diretrizes;
  documentosBrutos: Array<{ filename: string; text: string }>;
  precedentes: SimilarResult[];
  /** Relatório auditável da pesquisa obrigatória realizada antes da redação. */
  jurisprudenceResearch: string;
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
  "ementa": "string — a ementa completa seguindo rigorosamente a ESTRUTURA de Caso em Exame, Razões de Decidir e Dispositivo e Tese (fornecida no prompt do usuário)",
  "descricao_objeto": "string|null — síntese do que foi auditado",
  "interessados": "string|null — lista de nomes (use o que veio no resumo)",
  "exercicio": "string|null — ano do exercício auditado",
  "modalidade_tipo": "string|null — ex: 'Auditoria Especial - Conformidade'",
  "relatorio": "string — narrativa cronológica do processo, SEM 'É o relatório' (já no template)",
  "analise_completa": "string — para CADA achado: '**2.1.X. Título**', '**Análise da Auditoria:**', citações com '> ', '**Defesa do Interessado:**', '**Análise do Relator:**', conclusão",
  "decisao_voto": "string — '**6. DECISÃO**', 'Ante o exposto...', 'Voto no sentido de:', seguido de CONSIDERANDOs e depois itens 1. **JULGAR**, 2. **IMPUTAR DÉBITO**, 3. **APLICAR MULTA**, 4. **DECLARAR INIDONEIDADE**, 5. **DETERMINAR**",
  "sugestao_pendente": "string|null — pontos onde usei [VERIFICAR: ...] ou que precisam de validação humana",
  "referencias": [{
    "id": "string único",
    "section": "ementa|relatorio|analise_completa|decisao_voto",
    "excerpt": "trecho EXATO da minuta sustentado pela fonte",
    "source_type": "document|precedent",
    "evidence_id": "ID de resumo.evidencias ou null",
    "precedent": "objeto com result_id, processo, acordao, title, link e quote; ou null",
    "verification": "pending",
    "confirmed_by_user": false
  }]
}

REGRAS DE MARKDOWN E TOM (o DOCX converte literalmente):
- **Evite expressões fortes e deterministas**, mantendo um tom equilibrado e técnico ao longo de toda a minuta.
- **negrito** vira negrito real no Word.
- *itálico* vira itálico real.
- "> trecho" no início da linha vira CITAÇÃO INDENTADA EM ITÁLICO
  (use sempre para reproduzir trechos literais de auditoria/defesa).
- Parágrafos separados por linha em branco (\n\n).
- NÃO usar tabelas, listas com "- ", nem cabeçalhos com "# " (exceto os exigidos na estrutura da Ementa).
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
              `### Precedente ${i + 1} | RESULT_ID=${p.id}${p.title ? ` — ${p.title}` : ''}
Processo: ${p.processo ?? 'n/a'}
Acórdão: ${p.acordao ?? 'n/a'}
Relator(a): ${p.relator ?? 'n/a'}
Data do julgamento: ${p.julgamento ?? 'n/a'}
Consulta(s) relacionada(s): ${p.research_queries?.join(', ') ?? 'n/a'}
Link: ${p.link ?? 'n/a'}
Trecho relevante:
${p.snippet ?? '(sem trecho)'}`,
          )
          .join('\n\n')
      : '(a pesquisa obrigatória foi executada, mas nenhum precedente aderente foi selecionado)';

  return `# RESUMO DO PROCESSO (extraído na triagem)
${JSON.stringify(input.resumo, null, 2)}

# DIRETRIZES DA CONSELHEIRA (decisões já tomadas — espelhar literalmente)
${JSON.stringify(input.diretrizes, null, 2)}

# DOCUMENTOS BRUTOS (fonte primária — extrair citações literais daqui)
${docsBlock}

# RELATÓRIO DA PESQUISA JURISPRUDENCIAL OBRIGATÓRIA
${input.jurisprudenceResearch}

# PRECEDENTES JURISPRUDENCIAIS DO TCE-PE
# Esta é a SUA FONTE de jurisprudência. Leia cada trecho com atenção:
# - NUNCA chame de "Precedente 1", "Precedente 2", etc. na minuta gerada.
# - Para referenciar uma jurisprudência, cite OBRIGATORIAMENTE o Nº do Acórdão, a Unidade Jurisdicionada (UJ) e o Relator do processo (se essas informações constarem no trecho fornecido).
# - Extraia as informações EXATAMENTE como estão escritas. Nunca invente dados. Se o trecho não tiver esses dados, não cite a jurisprudência nominalmente.
# - Aproveite a fundamentação dos trechos (teses, dispositivos, raciocínio)
#   para enriquecer a Análise do Relator do achado correspondente.
# - Use um precedente apenas no achado a que ele for materialmente aderente.
# - A pesquisa na base oficial já foi realizada antes da redação. Não afirme
#   que não houve pesquisa nem diga que seria necessário consultar a base.
# - NUNCA escreva "entendimento consolidado", "jurisprudência pacífica" ou
#   expressão equivalente apenas por semelhança doutrinária. Essa conclusão
#   exige apoio consistente em múltiplos julgados identificados neste bloco.
# - A inexistência de precedente aderente entre os resultados selecionados
#   deve ser declarada apenas como ausência de precedente localizado nas
#   consultas executadas, nunca como inexistência absoluta no Tribunal.
# - Para todo precedente nominalmente citado, crie uma entrada em "referencias"
#   copiando RESULT_ID, processo, acórdão, link e trecho exatamente deste bloco.
${precedentesBlock}

# PRECEDENTES OBRIGATORIOS CONFIGURADOS PELA CONSELHEIRA
${input.precedentesObrigatorios.trim() || '(nenhum precedente obrigatorio configurado)'}

Considere este bloco como orientacao expressa da Conselheira. Ainda assim,
nao invente numeros, trechos ou metadados: quando a configuracao nao trouxer
elementos suficientes para uma citacao nominal segura, use apenas a tese
juridica e registre a necessidade de conferencia em "sugestao_pendente".

# INSTRUÇÕES PARA A EMENTA
ESCREVA a EMENTA do caso fornecido, seguindo estritamente a ESTRUTURA abaixo. Cite apenas fatos, normas e precedentes do caso fornecido. Comece o texto com "Ementa:".

ESTRUTURA
Use o formato da ESTRUTURA aqui fornecida, melhorando, adaptando e incluindo o que for necessário para garantir clareza, coesão, coerência, objetividade e precisão:

Ementa: MODALIDADE DO PROCESSO. FRASE OU PALAVRAS QUE INDIQUEM O ASSUNTO PRINCIPAL DO MAIS GERAL AO MAIS ESPECÍFICO DIVIDIDOS POR PONTO EM LETRA MAIÚSCULA. CONCLUSÃO.

### I. CASO EM EXAME
Apresente o caso, com a indicação dos fatos relevantes

### II. RAZÕES DE DECIDIR
Apresente as principais justificativas que fundamentam a decisão, extraídas da fundamentação. Cada justificativa autônoma deve ser redigida em um item numerado (2., 3., 4., etc.), de forma concisa e objetiva, contendo apenas uma ideia central por item. Utilize quantos itens forem necessários para contemplar todas as justificativas relevantes.

### III. DISPOSITIVO E TESE
Apresente o resultado definido nas diretrizes: Regularidade, Regularidade com ressalvas,
Irregularidade ou Expedição de determinações, recomendações e/ou medidas saneadoras.
Tese de julgamento: Enumere a(s) tese(s) jurídica(s) firmada(s) no julgamento (ratio decidendi), de forma concisa e objetiva, seguindo esta formatação: "1. [Tese 1]. 2. [Tese 2]. 3. [Tese 3]..." Cada tese deve ser redigida como uma única frase, iniciando com letra maiúscula e terminando com ponto final

EXEMPLO DE EMENTA BEM FORMATADA:
***Ementa***: AUDITORIA ESPECIAL. PROPOSTA DE PADRONIZAÇÃO. EMENTA-PADRÃO. RECOMENDAÇÃO DE MODELO PARA A ELABORAÇÃO DE EMENTAS PELOS TRIBUNAIS. APROVAÇÃO.
### I. CASO EM EXAME
1. Proposta de padronização de ementas dos acórdãos proferidos pelos mais de 90 tribunais brasileiros.
### II. RAZÕES DE DECIDIR
2. Ementas devem ser claras, objetivas e escritas em linguagem simples, sob pena de prejudicar a pesquisa e a compreensão pelas partes do processo, pela comunidade jurídica e pela população em geral.
3. Precedentes que não são conhecidos ou compreendidos não podem ser seguidos. Assim, a padronização das ementas favorece a consolidação do sistema brasileiro de precedentes.
4. Por fim, a adoção de um modelo de ementas favorece o treinamento de ferramentas de inteligência artificial para a busca de precedentes.
### III. DISPOSITIVO E TESE
5. Recomendação aprovada.


# TAREFA
Elabore a minuta de voto seguindo RIGOROSAMENTE a estrutura padrão e as instruções da ementa acima.

Para CADA achado das diretrizes, na seção 5 (analise_completa):
  1. Bloco "Análise da auditoria": entre aspas, transcreva pelo menos
     1 trecho LITERAL já cadastrado em resumo.evidencias que fundamente o
     achado. Após a citação, faça resumo e crie a referência correspondente.
  2. Bloco "Defesa do interessado": entre aspas, transcreva pelo menos
     1 trecho LITERAL cadastrado em resumo.evidencias da Defesa correspondente. Se houver múltiplas
     defesas, separe com subtítulos (Defesa do Prefeito, Defesa da
     Empresa, etc.). Após as citações, faça resumo.
  3. Bloco "Análise do Relator": aplicar o MÉTODO DOS 4 ATOS sem
     mostrar os títulos das etapas. Iniciar com "Compulsando os autos,
     verifico que a equipe técnica apontou..." ou similar. Detalhar
     datas, metragens e valores exatos. Concluir com "Diante do
     exposto, voto por (...)" usando LITERALMENTE o "resultado" das
     DIRETRIZES (irregular / regular_com_ressalvas / regular /
     expedicao_medidas_saneadoras).

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
  • Se "expedicao_medidas_saneadoras" → "voto pela EXPEDIÇÃO DE DETERMINAÇÕES,
    RECOMENDAÇÕES E/OU MEDIDAS SANEADORAS" (DEFINITIVO). Nesse caso, NÃO declare
    regularidade ou irregularidade e NÃO aprove, reprove ou rejeite as contas.
- Os campos de resultado, multa, débito e medida recebidos neste contexto já
  foram revisados e salvos pela Conselheira e são vinculantes. Não exija nem
  mencione qualquer caixa ou campo adicional de confirmação.
- Se qualquer resultado estiver null, NÃO redija a minuta: essa situação deve
  ser bloqueada pelo servidor e jamais completada por inferência.
- diretrizes.achados[i].multa.aplicar=true → aplicar multa com o valor
  em diretrizes.achados[i].multa.valor (texto livre da Conselheira) e
  fundamento no art. 73 da Lei 12.600/2004 (escolha o inciso aderente).
- diretrizes.achados[i].debito.imputar=true → imputar débito com o valor
  em diretrizes.achados[i].debito.valor.
- diretrizes.achados[i].medida.aplicar=true → incluir o texto literal de
  diretrizes.achados[i].medida.texto como recomendação/determinação/ciência.
- Se aplicar/imputar=false, NÃO inclua a sanção ou medida, mesmo que exista
  texto residual em qualquer outro campo.
- Para "expedicao_medidas_saneadoras", transcreva a medida preenchida sem
  inventar responsável, multa, débito ou julgamento das contas.
- É PROIBIDO criar, aumentar, reduzir ou sugerir sanção dentro da minuta.
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
- NUNCA inverter, preencher ou inferir o resultado das diretrizes.
- NUNCA mudar o valor de multa/débito/medida QUANDO a Conselheira
  marcou aplicar=true — esses valores são literais.
- Quando aplicar/imputar=false, é PROIBIDO incluir a sanção ou medida.
- Toda afirmação factual, citação literal e precedente nominal usado deve
  possuir uma entrada em "referencias". Referências são metadados do app
  e não devem ser inseridas no texto da minuta.
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
