# Estilo Edredons Premium (serie)

Tags: #estilo-prompt
Arquivo do prompt: [[PROMPT-serie]]
Data de criação: 2026-04-29
Status: Ativo

## Quando usar
Edredons e cobertores premium. Gera apenas imagens estáticas (Nano Banana / Midjourney) — sem prompts de vídeo Veo. Focado em qualidade visual e consistência de personagem.

## Input esperado
- Imagem do edredom (upload via interface)
- Parâmetro "Duração selecionada": 22s / 26s / 32s (define número de cenas)

## Output gerado
JSON com `character_sheet` + `cena_1` a `cena_4` (conforme duração):

```json
{
  "character_sheet": "Prompt em inglês para gerar reference sheet da personagem (5 views)",
  "cena_1": "🎬 CENA 1 — [TIPO] [DURAÇÃO]\n[prompt completo]",
  "cena_2": "...",
  "cena_3": "...",
  "cena_4": "..." // apenas se 26s ou 32s
}
```

## Tipos de cena disponíveis
- **A — Rosto Direto** (✅ character sheet obrigatório): personagem olha para câmera
- **B — Selfie** (✅ character sheet): câmera de cima, personagem segura phone
- **C — Mãos Toque Suave** (❌ sem personagem): 1 mão tocando textura
- **D — Mãos Dupla Face** (❌ sem personagem): 2 mãos revelando interior/exterior
- **E — Mãos Erguendo** (❌ sem personagem): edredom erguido mostrando ambas faces
- **F — CTA Conversão** (✅ character sheet ⭐): sempre a ÚLTIMA cena, personagem aponta para baixo

## Regras de duração
| Opção | Cenas | Estrutura |
|---|---|---|
| 22s | 3 | 6s + 8s + 8s |
| 26s | 4 | 6s + 8s + 8s + 4s |
| 32s | 4 | 8s + 8s + 8s + 8s |

## Decisões relacionadas
- [[decisoes/2026-04-29-3-a-5-cenas-por-duracao]] — lógica de duração
- [[decisoes/2026-04-29-prompt-md-no-vault]] — por que é um `.md`

## Notas adicionais
- Ambiente SEMPRE quarto — nunca sala, cozinha ou externo
- Personagem SEMPRE loungewear/sleepwear premium (cetim, modal, seda)
- Cor da roupa harmoniza com cor do edredom (tabela no prompt)
- 67% das gerações usam cabelo LOIRO (regra de distribuição explícita)
- NUNCA mencionar texto, tipografia, labels nos prompts de cena (faz IA gerar texto visível)
