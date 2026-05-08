# Decisão: Card "Créditos Restantes" para clientes (vs "Total Gasto" para admin)

**Data:** 2026-05-07  
**Status:** Implementado

## Contexto

O card de perfil "Total Gasto" exibia o valor em R$ gasto pelo usuário na API — métrica útil para o admin mas que não faz sentido para clientes pagos (eles compraram um plano com X gerações, não pagam por token).

## Decisão

O card `statSaldo` agora é dinâmico conforme o papel do usuário:

| Papel | Label | Valor | Cor |
|---|---|---|---|
| Admin | Total Gasto | R$ XX,XX (custo USD × câmbio) | padrão |
| Cliente | Créditos Restantes | `generations_limit - generations_used` | verde/laranja/vermelho por % |

### Lógica de cor (cliente)
- > 20% restante → verde  
- 10–20% restante → laranja  
- < 10% restante → vermelho  

### Insight alternativo (cliente)
O insight "Custo médio por prompt" é substituído por:  
`"Você ainda tem X crédito(s) disponível(is) (Y% do plano usado)"`

## Arquivos alterados

- `public/index.html`: `renderProfilePage()`, `loadProfileStats()`, `renderInsights()`
