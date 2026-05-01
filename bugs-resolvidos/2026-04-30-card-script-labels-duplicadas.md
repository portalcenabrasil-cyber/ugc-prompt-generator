---
name: Card Script PT-BR — labels duplicadas
description: Card 3 exibia "🎙️ HOOK 🎙️ HOOK (0-2s)" — label duplicada + conteúdo redundante com prompt de vídeo
type: project
---

# Bug: Card "Script PT-BR" com labels duplicadas

**Data identificado:** 2026-04-30
**Status:** Corrigido em 2026-05-01 (card removido)

## Sintoma
Card 3 "Script PT-BR" exibia labels como:
- `🎙️ HOOK 🎙️ HOOK (0-2s)`
- `🎙️ PRODUTO 🎙️ PRODUTO (2-6s)`
- `🎙️ CTA 🎙️ CTA (6-8s)`

Cada label aparecia duplicada na renderização.

## Causa raiz
O renderer do card aplicava o emoji e título tanto na construção do texto (server-side, no prompt) quanto no frontend ao exibir. O sistema de parsing do JSON estava retornando um campo `script_pt_br` com texto já formatado, e o frontend adicionava mais formatação por cima.

## Solução
Card removido completamente. As falas vivem dentro dos prompts de vídeo (Cards 3 e 4), onde já estão contextualizadas com timing, cenário e instruções visuais. Um card separado de "script" era redundância pura — consumia tokens sem agregar valor ao usuário.

## Schema resultante (5 cards)
1. 📋 Character Sheet
2. 🖼️ Start Frame (Nano)
3. 🎬 Prompt Vídeo 1 (8s)
4. 🎬 Prompt Vídeo 2 — Continuação (8s)
5. 📌 Legendas (3 variações)
