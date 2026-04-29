# Conflito de nomenclatura: ancora_fixa

Tags: #decisao-arquitetural #regra-inviolavel
Data: 2026-04-29

## Contexto
O termo `ancora_fixa` surgiu em dois contextos com significados completamente diferentes:

**Significado 1 — Já estabelecido em `PROMPT-nano` e `PROMPT-nano-veo-2`:**
Bloco de texto colado no **fim de cada prompt de cena** para garantir consistência de personagem, cenário e estética entre os clips. Exemplo:
```
Consistent character: same [CABELO] woman, [PELE] skin, [ROUPA].
Same bedroom: [CAMA] bed, [HEADBOARD] headboard...
```

**Significado 2 — Novo, vindo do contexto de Roupa Feminina:**
Legenda/overlay em texto fixo no **topo do vídeo final** (editado no CapCut), tipo uma chamada de marca ou categoria visível durante todo o vídeo.

## Decisão
- Manter `ancora_fixa` com o **Significado 1** (bloco de consistência no fim dos prompts) — já está em produção e o `server.js` pode parsear esse campo
- Renomear o Significado 2 para **`legenda_topo`** no [[PROMPT-roupa-feminina]]

## Motivo
- Mudança retroativa do Significado 1 quebraria o `server.js` que já parseia `ancora_fixa` no output JSON
- `legenda_topo` é mais descritivo: indica que é uma legenda (texto), e que fica no topo do vídeo
- Evita ambiguidade semântica em futuros estilos

## Regra resultante
**NUNCA usar `ancora_fixa` no `PROMPT-roupa-feminina.md` ou em qualquer estilo futuro que se refira a legenda de vídeo final.** Usar sempre `legenda_topo` para esse conceito.

## Arquivos afetados
[[PROMPT-roupa-feminina]] (usa `legenda_topo`), [[PROMPT-nano]] (mantém `ancora_fixa` = bloco de consistência), [[PROMPT-nano-veo-2]] (idem)
