# Cards separados vs blob único (nano vs nano-veo-2)

Tags: #decisao-arquitetural #estilo-prompt #ux
Data: 2026-04-29

## Contexto
O estilo "Nano + Vídeos" (`PROMPT-nano`) foi o primeiro a gerar prompts tanto para Nano Banana (imagem) quanto para Veo 3.1 Pro (vídeo). Seu output entrega tudo em um **blob único** por cena: o prompt Nano e o prompt Veo são concatenados no mesmo campo do JSON, separados por marcadores textuais (`📸 NANO BANANA` / `🎬 VEO 3.1 PRO`).

## Decisão
Criar um segundo estilo em paralelo — `PROMPT-nano-veo-2` — onde cada cena tem **dois campos separados** no JSON:
- `cena_N_imagem` — prompt exclusivo para Nano Banana
- `cena_N_video` — prompt exclusivo para Veo 3.1 Pro

O estilo original (`PROMPT-nano`) foi **mantido sem alteração**.

## Motivo
- O usuário validou o output visual do `nano` original (bloco único concatenado) e não quer perder essa opção
- Porém o workflow real exige copiar cada prompt individualmente para colar no Kling ou Veo — campos separados facilitam isso
- Dois estilos coexistindo permitem que o usuário escolha conforme seu workflow pessoal

## Resultado
- `nano` → blob único por cena → bom para visualizar/revisar tudo junto
- `nano-veo-2` → campos separados → bom para workflow de copy-paste individual

## Arquivos afetados
[[PROMPT-nano]] (mantido como estava), [[PROMPT-nano-veo-2]] (novo estilo com cards separados)
