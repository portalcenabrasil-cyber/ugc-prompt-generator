# Galeria nano-veo-2 abria como "Edredons Premium"

Tags: #fix-bug #galeria
Data: 2026-04-28

## Estilo afetado
Nano + Vídeos 2 (`nano-veo-2`)

## Sintoma
Ao clicar em um item gerado pelo estilo `nano-veo-2` na galeria do histórico, o modal de visualização abria com o layout de "Edredons Premium" (único card grande) em vez do layout correto de 13 cards separados (`character_sheet` + `cena_1_imagem` + `cena_1_video` + ... + `ancora_fixa` + `resumo`).

## Causa raiz
A função `openGalleryItem` detectava o tipo de estilo por `item.emocao === 'nano-veo-2'`. O problema: o campo `emocao` no JSON armazenado no Supabase é metadata **emocional** do produto (ex: `"aconchego"`, `"conforto"`) — nunca é o identificador de estilo. Portanto a condição nunca batia e o código caía no branch default ("Edredons Premium").

## Solução
Alterar a detecção para `item.style === 'nano-veo-2'` OU verificar a presença de `item.cena_1_imagem` (campo exclusivo do estilo `nano-veo-2`). A segunda condição serve de fallback para itens salvos antes que o campo `style` fosse adicionado.

## Arquivo modificado
`public/index.html` — função `openGalleryItem`

## Tempo gasto
~45 minutos
