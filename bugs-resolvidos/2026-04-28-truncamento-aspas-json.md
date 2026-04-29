# Truncamento de prompt_video por bug de aspas no parser JSON

Tags: #fix-bug #parser
Data: 2026-04-28

## Estilo afetado
Base — principalmente em modo de geração em lote (múltiplos produtos)

## Sintoma
1 a cada 3-4 itens processados em lote chegava com `prompt_video` truncado no meio do hook — o texto simplesmente cortava sem encerrar a string JSON. O JSON ficava malformado e o frontend exibia o card incompleto.

## Causa raiz
A função `safeParseJSON` no `server.js` usava um parser char-a-char customizado para extrair o JSON da resposta do Claude (que às vezes vinha com lixo ao redor). Quando o diálogo do personagem continha **aspas duplas literais** (ex: `"Gente... isso tá 'quase' de graça?!"`), o parser se dessincronizava: interpretava a aspa do interior da frase como fechamento da string JSON, truncando todo o conteúdo subsequente.

## Solução
Fix com **lookahead** na tentativa 2 do parser: ao encontrar uma aspa `"`, verifica se o próximo token é `,`, `}`, `\n` ou espaço antes de decidir se é fechamento legítimo ou aspa interior de diálogo. Caso ambíguo → assume que é aspa interior e continua consumindo.

## Arquivo modificado
`server.js` — função `safeParseJSON`

## Tempo gasto
~3 horas

## Tag git associada
`stable-v1.1-20260429`
