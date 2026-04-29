# Estilo Nano + Vídeos 2 (nano-veo-2)

Tags: #estilo-prompt
Arquivo do prompt: [[PROMPT-nano-veo-2]]
Data de criação: 2026-04-29
Status: Ativo

## Quando usar
Edredons premium — mesmo caso de uso do `nano`, mas com output em **cards separados** (imagem e vídeo em campos distintos). Ideal para workflow de copy-paste individual: copia o campo `cena_1_imagem` no Nano Banana, copia `cena_1_video` no Veo, sem precisar separar manualmente.

## Input esperado
- Imagem do edredom (upload via interface)
- Parâmetro "Duração selecionada": 22s / 26s / 30s / 38s

## Output gerado
JSON com campos separados por cena e por gerador:

```json
{
  "character_sheet": "...",
  "cena_1_imagem": "📸 CENA 1 — IMAGEM (NANO) | TIPO X | 00:00-00:0X | Xs\n[✅ ou ❌]\n[prompt]",
  "cena_1_video":  "🎬 CENA 1 — VIDEO (VEO) | TIPO X | 00:00-00:0X | Xs\n[✅ ou ❌]\n[prompt com audio PT-BR]",
  "cena_2_imagem": "...",
  "cena_2_video":  "...",
  "cena_3_imagem": "...",
  "cena_3_video":  "...",
  "cena_4_imagem": "",
  "cena_4_video":  "",
  "cena_5_imagem": "",
  "cena_5_video":  "",
  "ancora_fixa":   "Bloco de consistência com variáveis reais preenchidas",
  "resumo":        "💰 Resumo com total de segundos e tipo de cada cena"
}
```

## Diferenças vs nano
| Aspecto | nano | nano-veo-2 |
|---|---|---|
| Output por cena | 1 campo blob (Nano + Veo) | 2 campos separados |
| Workflow | Revisar tudo junto | Copy-paste individual |
| Âncora fixa | Embutida no blob de cada cena | Campo separado `ancora_fixa` |
| Resumo | Embutido na última cena | Campo separado `resumo` |

## Regras técnicas específicas
- R2: celular NUNCA aparece no frame — a câmera É o celular
- R4: proibido `radiant glowing skin`, `4K photorealistic`, `flawless skin` (acionam beauty filter)
- R5: diálogo PT-BR completo dentro do prompt Veo (não "descrever" — escrever o texto literal)
- Âncora fixa preenchida com variáveis REAIS do lote (não template genérico)

## Tipos de cena disponíveis
7 tipos: WIDE BED SHOT / HAND STROKE / REVEAL / SQUEEZE / EXTREME CLOSE-UP / MODEL LYING / CTA POINT

## Decisões relacionadas
- [[decisoes/2026-04-29-cards-separados-vs-blob]] — motivo da separação
- [[decisoes/2026-04-29-3-a-5-cenas-por-duracao]]
- [[decisoes/2026-04-29-ancora-fixa-conflito-nomenclatura]]

## Bugs históricos
- [[bugs-resolvidos/2026-04-28-galeria-nano-veo-2-tags-erradas]] — galeria abria como "Edredons Premium"
