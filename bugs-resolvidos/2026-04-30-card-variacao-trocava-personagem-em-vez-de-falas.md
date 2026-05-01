---
name: Card Variação trocava personagem em vez de falas
description: Card 4 gerava personagem novo em vez de continuar com o mesmo personagem do Vídeo 1
type: project
---

# Bug: Card "Variação" gerava personagem diferente

**Data identificado:** 2026-04-30
**Status:** Corrigido em 2026-05-01 (card reformulado como Continuação)

## Sintoma
O Vídeo 2 ("Variação") gerava um personagem completamente diferente do Vídeo 1:
- Vídeo 1: mulher 35 anos, cabelo escuro, cozinha, avental denim
- Vídeo 2: homem jovem, quarto com setup, roupa diferente

Usuário não conseguia emendaros dois vídeos em uma sequência coerente de 16s.

## Causa raiz
O prompt do card não especificava que o personagem devia ser idêntico ao do Vídeo 1. A instrução "variação" era interpretada pela IA como liberdade para criar um novo personagem.

## Solução
Card reformulado como "CONTINUAÇÃO" com regras críticas explícitas no `PROMPT-base-v2.md`:
- MESMO personagem: cópia exata da descrição física (rosto, cabelo, roupa, pele) do Vídeo 1
- MESMO cenário OU ângulo diferente (ex: close → mid-shot)
- MESMA voz_estilo
- FALAS TOTALMENTE DIFERENTES — sem repetição de palavras-chave do Vídeo 1
- Linha final: "The exact person from the reference image attached. Continuation of previous video."

## Campo JSON renomeado
- Antes: `prompt_video_2` (ou `variacao`)
- Depois: `prompt_video_2_continuacao`
