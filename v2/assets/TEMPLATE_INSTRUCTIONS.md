# Template DOCX

A geração da minuta usa `assets/template.docx` com placeholders no
formato `{nome}` (delimitadores `{` `}`, configurados em
`lib/docx/generate.ts`).

## Placeholders esperados

| Placeholder | Conteúdo |
|---|---|
| `{numero}` | Número do processo TCE-PE |
| `{relator}` | Nome do conselheiro relator (caixa alta) |
| `{exercicio}` | Exercício auditado |
| `{unidade}` | Unidade jurisdicionada (caixa alta) |
| `{interessados}` | Lista de interessados |
| `{descricao_objeto}` | Objeto resumido |
| `{ementa}` | Ementa formatada |
| `{relatorio}` | Relatório completo (parágrafos) |
| `{analise_completa}` | Voto / análise de mérito |
| `{decisao_voto}` | Dispositivo (CONSIDERANDOs + itens romanos) |

## Como criar o template

1. Abra o template do v1 (`tce-minutas/scripts/template.docx`) no Word.
2. Substitua o cabeçalho fixo pelos placeholders acima — basta digitar
   `{numero}`, `{relator}` etc no lugar dos campos hardcoded.
3. Apague TODAS as tabelas escondidas no fim do template (o v1 dependia
   delas; o v2 não usa mais).
4. Coloque os placeholders de bloco (`{relatorio}`, `{analise_completa}`,
   `{decisao_voto}`) em parágrafos próprios — quebras de linha dentro do
   conteúdo viram parágrafos no DOCX (linebreaks: true em docxtemplater).
5. Salve como `v2/assets/template.docx`.

## Como testar

Após criar o template, faça um GET em `/api/minuta/docx?processo_id=...`
de um processo que já tenha minuta salva.
