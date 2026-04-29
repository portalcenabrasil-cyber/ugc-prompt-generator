# Distribuição de cenas por duração (3 a 5 cenas)

Tags: #decisao-arquitetural #estilo-prompt
Data: 2026-04-29

## Contexto
Ao criar os estilos `nano` e `nano-veo-2`, foi necessário definir quantas cenas gerar por vídeo dependendo da duração total selecionada pelo usuário.

## Decisão
Distribuição de cenas por duração total:

| Duração | Cenas | Estrutura |
|---|---|---|
| 22s | 3 cenas | 6s + 8s + 8s |
| 26s | 4 cenas | 6s + 8s + 8s + 4s |
| 30s | 4 cenas | 8s + 8s + 8s + 6s |
| 38s | 5 cenas | 8s + 8s + 8s + 8s + 6s |

## Motivo
- O Veo 3.1 Pro aceita clips de **apenas** 4s, 6s ou 8s — nenhuma outra duração
- As combinações acima são as únicas que somam exatamente as durações totais usando esses blocos
- 22s foi testado como mínimo viável para conversão no TikTok Shop
- A última cena é sempre CTA (apontar para baixo + urgência) — mantida em 6s ou 8s (exceto 26s onde é 4s)

## Alternativas consideradas
- **Durações livres (ex: 7s, 9s, 11s):** Descartado — Veo 3.1 não aceita essas durações
- **Sempre 3 cenas independente da duração:** Descartado — vídeos longos (38s) precisam de mais variação de ângulo
- **Sempre 22s:** Descartado — usuário precisa de opções de duração para diferentes formatos de campanha

## Arquivos afetados
[[PROMPT-serie]], [[PROMPT-nano]], [[PROMPT-nano-veo-2]]
