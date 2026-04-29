# Estilo Roupa Feminina (roupa-feminina)

Tags: #estilo-prompt
Arquivo do prompt: [[PROMPT-roupa-feminina]]
Data de criação: 2026-04-29
Status: Ativo

## Quando usar
Roupas femininas no TikTok Shop. Suporta dois modos operacionais:
- **Modo A** — modelo gerada do zero pela IA (com distribuição de características pré-definida)
- **Modo B** — imagem de modelo de referência enviada pelo usuário (IA extrai características e mantém consistência)

## Input esperado
- Imagem da roupa (produto)
- Parâmetro `modo`: `"A"` ou `"B"`
- Se Modo B: imagem adicional da modelo de referência

## Output gerado

### Modo A
```json
{
  "modo": "A",
  "personagem": {
    "etnia": "...",
    "idade": "...",
    "cabelo": "...",
    "pele": "...",
    "corpo": "...",
    "roupa_detalhe": "..."
  },
  "cenario": "...",
  "script": {
    "hook_0_2s": "...",
    "produto_2_4s": "...",
    "cta_4_6s": "..."
  },
  "cena_1_video_kling": "...",
  "cena_2_video_kling": "...",
  "cena_3_video_kling": "...",
  "legenda_topo": "..."
}
```

### Modo B
```json
{
  "modo": "B",
  "referencia_imagem": {
    "rosto": "...",
    "cabelo": "...",
    "pele": "...",
    "oculos": "...",
    "vibe_geral": "..."
  },
  "cenario": "...",
  "script": { ... },
  "cena_1_video_kling": "...",
  "cena_2_video_kling": "...",
  "cena_3_video_kling": "...",
  "legenda_topo": "..."
}
```

## Nota sobre legenda_topo
`legenda_topo` neste estilo = legenda/overlay de texto fixo no topo do vídeo final (editado no CapCut). **NÃO confundir** com `ancora_fixa` dos estilos `nano` e `nano-veo-2`, que é um bloco de consistência de prompt. Ver [[decisoes/2026-04-29-ancora-fixa-conflito-nomenclatura]].

## Distribuição obrigatória de características (Modo A)
REGRA OBRIGATÓRIA — a IA DEVE seguir a cada geração:
- 40% morena clara
- 30% morena média
- 20% pele clara quente
- 10% morena escura ou negra

## Decisões relacionadas
- [[decisoes/2026-04-29-ancora-fixa-conflito-nomenclatura]] — por que usa `legenda_topo` e não `ancora_fixa`
- [[decisoes/2026-04-29-prompt-md-no-vault]]
