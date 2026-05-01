# Decisão: Base v2 usa falas originais, não banco literal

**Data:** 2026-04-30
**Status:** Implementado em 2026-05-01

## Decisão
O servidor envia o banco de 720 frases (nicho) como **âncora de tom e vocabulário**, não como biblioteca a ser sortida literalmente. A IA escreve falas frescas e originais a cada geração.

## Contexto
Sistema anterior sorteava 1 hook + 1 produto + 1 CTA do banco 720 e copiava literalmente no prompt do vídeo. Resultado: falas genéricas e mecânicas, sem referência ao produto específico.

Exemplo problemático (Hilux miniatura):
- HOOK: "Gente, esse produto me pegou de surpresa." ❌
- PRODUTO: "Parece muito mais caro do que é." ❌
- CTA: "Pega logo gente, acabando rápido." ❌

Exemplo correto (Hilux miniatura):
- HOOK: "Agora sim, chegou a peça que faltava na minha sala de estudos." ✅
- PRODUTO: "Olha esses detalhes em miniatura realista, tá sensacional." ✅
- CTA: "Essa é pra quem ama roça e hilux — carrinho laranja embaixo!" ✅

## Implementação
- `loadFrasesNicho()` carrega todos os 30 de cada seção
- `callClaudeBaseV2()` formata como âncora de tom no user message
- `PROMPT-base-v2.md` contém regras explícitas de anti-clichê e especificidade de produto

## Alternativas descartadas
- Banco literal sortido: gerava combinações mecânicas sem personagem/produto específico
- Banco completamente ignorado: perdia o vocabulário e tom do nicho
