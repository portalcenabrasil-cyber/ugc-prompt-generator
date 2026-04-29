# Estilo Nano + Vídeos (nano)

Tags: #estilo-prompt
Arquivo do prompt: [[PROMPT-nano]]
Data de criação: 2026-04-29
Status: Ativo

## Quando usar
Edredons premium com necessidade de prompts duplos (imagem + vídeo) por cena. Output em **blob único** por campo de cena — Nano Banana e Veo 3.1 Pro concatenados com marcadores textuais. Bom para revisar tudo junto antes de separar.

## Input esperado
- Imagem do edredom (upload via interface)
- Parâmetro "Duração selecionada": 22s / 26s / 30s / 38s

## Output gerado
JSON onde cada cena é um blob único com ambos os prompts:

```json
{
  "character_sheet": "...",
  "cena_1": "🎬 CENA 1 — [TIPO] [DURAÇÃO]s\n[✅ ou ❌]\n\n📸 NANO BANANA\n[prompt]\n\n🎬 VEO 3.1 PRO\n[prompt]",
  "cena_2": "...",
  "cena_3": "🎬 CENA N — CTA CONVERSÃO [DURAÇÃO]s\n...\n\n⚓ ÂNCORA FIXA — Nano Banana\n[...]\n\n💰 Resumo final\n..."
}
```

## Diferença do nano-veo-2
- `nano`: blob único por cena (Nano + Veo no mesmo campo) → [[tipos-de-prompt/nano]]
- `nano-veo-2`: campos separados por gerador (`cena_N_imagem` / `cena_N_video`) → [[tipos-de-prompt/nano-veo-2]]

Ver [[decisoes/2026-04-29-cards-separados-vs-blob]] para o motivo dessa divisão.

## Tipos de cena disponíveis
- **A — Rosto Direto** (✅ character sheet)
- **B — Selfie** (✅ character sheet)
- **C — Mãos Toque Suave** (❌)
- **D — Mãos Dupla Face** (❌)
- **E — Mãos Erguendo** (❌)
- **F — CTA Conversão** (✅ ⭐ sempre última cena)

## Âncora fixa (ESTE estilo)
Neste estilo, `ancora_fixa` = bloco de consistência colado NO FIM de cada prompt (Nano e Veo), garantindo mesma personagem/cenário entre cenas. NÃO confundir com `legenda_topo` do [[PROMPT-roupa-feminina]]. Ver [[decisoes/2026-04-29-ancora-fixa-conflito-nomenclatura]].

## Decisões relacionadas
- [[decisoes/2026-04-29-3-a-5-cenas-por-duracao]]
- [[decisoes/2026-04-29-cards-separados-vs-blob]]
- [[decisoes/2026-04-29-ancora-fixa-conflito-nomenclatura]]
