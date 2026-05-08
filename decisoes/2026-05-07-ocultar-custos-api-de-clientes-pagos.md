# Decisão: Ocultar custos da API de clientes pagos

**Data:** 2026-05-07  
**Status:** Implementado

## Contexto

Clientes pagos (plano starter/pro/agência) enxergavam métricas de custo interno (USD/BRL por geração, saldo de sessão, câmbio) que são relevantes apenas para o admin monitorar a operação. Expor esses dados gera confusão e revela nossa estrutura de custo.

## Decisão

Usar a função `isAdmin()` (nova) para condicionar toda exibição de custo na UI:

- `sessionCostBadge` — oculto para não-admin  
- `exchangeRateBadge` — oculto para não-admin  
- `renderCostBox()` — retorna imediatamente se não-admin  
- `updateSessionBadge()` — retorna imediatamente se não-admin  
- `_galleryCardHTML()` — cost tag omitida para não-admin  
- `openGalleryItem()` — `costHtml` = `''` para não-admin  
- `handleBatchEvent` — bloco de custo por item de lote omitido para não-admin  
- `renderRecentPrompts()` — custo por item omitido para não-admin  
- `renderInsights()` — "Custo médio" substituído por "Créditos disponíveis" para não-admin  

## O que NÃO mudou

- O código de custo não foi removido — apenas condicional. Admin continua vendo tudo.  
- Nenhum endpoint de geração foi alterado.  
- Estilos de prompt não foram tocados.

## Alternativas rejeitadas

- Remover código de custo completamente — rejeitado porque o admin precisa manter visibilidade.
