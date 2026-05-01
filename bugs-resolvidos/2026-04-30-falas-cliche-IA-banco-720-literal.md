---
name: Falas clichê — banco 720 sorteado literalmente
description: Sistema sorteava frases literais do banco → falas genéricas, mecânicas, sem referência ao produto
type: project
---

# Bug: Falas genéricas ao sortear banco de 720 literalmente

**Data identificado:** 2026-04-30
**Status:** Corrigido em 2026-05-01

## Sintoma
Falas geradas soavam como IA óbvia, sem referência ao produto específico:

- HOOK: "Gente, esse produto me pegou de surpresa." ❌
- PRODUTO: "Parece muito mais caro do que é." ❌
- CTA: "Pega logo gente, acabando rápido." ❌

(Exemplo com produto: Hilux miniatura diecast)

## Causa raiz
`sortearFrases()` sorteava 1 hook + 1 produto + 1 CTA do banco de 720 frases e injetava literalmente no user message. A IA recebia frases prontas e as usava quase sem modificação.

## Solução
Banco de 720 frases enviado como **âncora de tom e vocabulário** — todos os 30 de cada seção, marcados explicitamente como "APENAS para captar vocabulário e tom — NUNCA copie literalmente".

A IA escreve falas frescas e originais analisando o produto na imagem:

- HOOK: "Agora sim, chegou a peça que faltava na minha sala de estudos." ✅
- PRODUTO: "Olha esses detalhes em miniatura realista, tá sensacional." ✅
- CTA: "Essa é pra quem ama roça e Hilux — carrinho laranja embaixo!" ✅

## Mudanças no código
- `sortearFrases()` removida do server.js
- `loadFrasesNicho()` retorna todos os 30 de cada seção
- `callClaudeBaseV2()` formata os 90 exemplos como âncora no user message
- `PROMPT-base-v2.md` contém seção "REGRAS DE FALA AUTÊNTICA" com anti-clichê explícito

## Regras anti-clichê adicionadas ao PROMPT
Nunca usar:
- "Esse produto me pegou de surpresa"
- "Parece muito mais caro do que é" (forma genérica)
- "Pega logo gente, acabando rápido"
- "Gente, olha o que chegou aqui"
- Qualquer frase do banco literalmente
