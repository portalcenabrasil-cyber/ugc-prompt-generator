---
name: Video 2 é CONTINUAÇÃO do Video 1
description: Card 4 (antes "Variação") reformulado como continuação narrativa com mesmo personagem
type: project
---

# Decisão: Card 4 vira CONTINUAÇÃO — mesmo personagem, falas novas

**Data:** 2026-04-30
**Status:** Implementado em 2026-05-01

## Decisão
O Card 4 deixou de ser uma "variação" com personagem diferente e passou a ser uma **CONTINUAÇÃO** do Vídeo 1 — mesmo personagem físico, mesmo cenário (ou ângulo diferente), falas completamente novas que aprofundam a narrativa do Vídeo 1.

## Problema resolvido
O sistema anterior gerava um segundo personagem diferente no "Card Variação". Isso quebrava a continuidade narrativa:
- Vídeo 1: mulher 35 anos, cozinha, casaco verde
- "Variação": homem jovem, quarto, roupa diferente ← **inútil para emenda**

O usuário não conseguia concatenar Vídeo 1 + Vídeo 2 em uma sequência de 16s porque os personagens eram incompatíveis.

## Solução implementada
**Prompt instrui explicitamente:**
- MESMO personagem: cópia exata da descrição física (rosto, cabelo, roupa, pele) do Vídeo 1
- MESMO cenário OU apenas ângulo diferente (ex: Vídeo 1 = close, Vídeo 2 = mid-shot)
- MESMA voz_estilo (continuidade de tom)
- FALAS TOTALMENTE DIFERENTES — nenhuma palavra-chave das falas do Vídeo 1 se repete
- Linha final: "The exact person from the reference image attached. Continuation of previous video."

## Caso de uso principal
Emenda de Vídeo 1 (8s) + Vídeo 2 (8s) = vídeo final de 16s com narrativa coerente, mesmo personagem do início ao fim.

## Narrativa do Vídeo 2
- 0-2s: complementação ou novo gancho sobre o produto
- 2-6s: outro benefício, prova social, preço específico ou garantia
- 6-8s: CTA reforçado ou complementar
