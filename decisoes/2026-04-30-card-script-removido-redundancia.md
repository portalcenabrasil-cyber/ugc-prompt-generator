# Decisão: Card "Script PT-BR" removido do Base v2

**Data:** 2026-04-30
**Status:** Implementado em 2026-05-01

## Decisão
O Card 3 "Script PT-BR" foi removido do Base v2. As falas vivem apenas dentro dos prompts de vídeo.

## Problema resolvido
O card anterior duplicava informação:
- Exibia labels duplicadas: "🎙️ HOOK 🎙️ HOOK (0-2s)"
- Repetia as mesmas falas já presentes no prompt de vídeo
- Consumia tokens sem agregar valor

## Novo schema (5 cards)
1. 📋 Character Sheet
2. 🖼️ Start Frame (Nano)
3. 🎬 Prompt Vídeo 1 (8s)
4. 🎬 Prompt Vídeo 2 — Continuação (8s)
5. 📌 Legendas (3 variações)
