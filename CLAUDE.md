# CLAUDE.md — Bíblia UGC TikTok Shop Brasil
> Baseado no Guia Completo UGC + TikTok Shop. Tudo que for gerado nesse projeto DEVE seguir este arquivo à risca.

> **IMPORTANTE:** Ler também `CONTEXT.md` — contém regras obrigatórias sobre skills de copy e design que devem ser carregadas antes de qualquer geração de texto ou alteração de interface.

---

## 1. A LÓGICA DO SISTEMA UGC

Ao receber um produto, identificar AUTOMATICAMENTE 3 coisas:

| QUEM COMPRA | ONDE USA | QUE EMOÇÃO VENDE |
|---|---|---|
| Público-alvo exato | Ambiente real de uso | Sentimento que gera conversão |

**Princípio fundamental:** O UGC não parece propaganda — parece uma pessoa real recomendando algo que descobriu. O ambiente deve ser CASEIRO, a câmera deve TREMER levemente, a expressão deve ser GENUÍNA. Nunca estúdio, nunca iluminação profissional, nunca tripé.

---

## 2. ESTRUTURA FIXA DE TODO PROMPT DE VÍDEO

### Template base obrigatório:
```
[Visual Style & Reference] Photorealistic UGC, filmed with smartphone, clean frame,
[AMBIENTE], [LUZ], 9:16 vertical, no filter, no tripod, clean screen, no overlays,
pure video frame only.
[Character] [DESCRIÇÃO DA PESSOA] — [ROUPA] — [O QUE SEGURA/FAZ]
[The Scene & Action - 6 Seconds]
  0-2s (HOOK): [EMOÇÃO FORTE + FRASE DE ABERTURA]
  2-4s (PRODUTO): [DEMONSTRAÇÃO + FRASE DO PRODUTO]
  4-6s (CTA): [APONTAR PARA BAIXO + CARRINHO LARANJA]
[Technical Specs] Handheld natural shake, [LUZ ESPECÍFICA], sharp focus on product,
Brazilian Portuguese, clean screen, no overlays, no recording indicators, no camera UI,
no doodles, no icons, pure video frame only, 9:16 photorealistic
```

### Regra dos 3 momentos:
| MOMENTO | DURAÇÃO | OBJETIVO | ENERGIA |
|---|---|---|---|
| HOOK | 0-2s | PARAR O SCROLL | MÁXIMA |
| PRODUTO | 2-4s | MOSTRAR VALOR | MÉDIA |
| CTA | 4-6s | CONVERTER | URGENTE |

---

## 3. REGRAS DE HOOK (0-2 SEGUNDOS)

O hook é a parte MAIS IMPORTANTE. Se não parar o scroll nos primeiros 2 segundos, ninguém assiste o resto. O hook NUNCA começa falando do produto — começa com EMOÇÃO.

### Os 5 tipos de hook que convertem:

**CHOQUE DE PREÇO** — Reação de quem não acredita no valor
> "Gente... esse kit TODO por R$15?! Isso tá quase de graça!"

**PROBLEMA RESOLVIDO** — Fala de uma dor real antes de mostrar solução
> "Meu marido roncava tanto que eu dormia no sofá... até eu achar isso"

**IDENTIDADE/FANATISMO** — Apela para pertencimento a um grupo
> "Se você é vascaíno e não tem isso no quarto, tá errando feio"

**DESCOBERTA** — Reação genuína de quem acabou de receber
> "Não acredito que chegou assim... olha o que veio na caixa"

**TRANSFORMAÇÃO** — Antes x depois sem mostrar o antes ainda
> "Transformei minha sala inteira sem fazer obra nenhuma..."

### Regras absolutas do Hook:
- NUNCA comece falando o nome do produto
- SEMPRE abra com expressão no rosto (boca aberta, olhos arregalados, sorriso)
- A câmera JÁ ABRE no momento de emoção — sem introdução
- Frases curtas, diretas, máximo 10 palavras
- O produto pode aparecer mas NÃO é o foco nos primeiros 2s
- Use reticências (...) para criar suspense antes do produto

---

## 4. TIPOS DE HOOK POR EMOÇÃO

| EMOÇÃO | EXPRESSÃO FACIAL | FRASE GATILHO | PRODUTO IDEAL |
|---|---|---|---|
| CHOQUE | Boca aberta, olhos arregalados | "Isso tá quase de graça..." | Produtos baratos, promo relâmpago |
| ORGULHO | Sorriso largo, punho no ar | "Só quem é fã de verdade..." | Times de futebol, anime |
| ALÍVIO | Suspiro, olhos fechando | "Finalmente dormi bem..." | Saúde, bem-estar |
| SURPRESA | Sobrancelhas levantadas | "Não acredito que chegou..." | Unboxing, presentes |
| CUMPLICIDADE | Olho piscando, sorriso malandro | "Não conta pra ninguém..." | Beleza, skincare |

---

## 5. ESTRUTURA DO PROMPT DE IMAGEM (NANO BANANA)

O prompt de imagem gera o FRAME INICIAL — thumbnail do vídeo. Deve capturar o momento de maior impacto emocional em uma única foto.

### Template base:
```
Vertical 9:16, [DESCRIÇÃO DA PESSOA — idade, cabelo, roupa], [POSIÇÃO/AÇÃO],
[O QUE SEGURA/MOSTRA], [EXPRESSÃO FACIAL DETALHADA],
[AMBIENTE com detalhes de fundo], [LUZ — natural/lâmpada/RGB],
photorealistic iPhone 16 Pro quality, no filter, authentic UGC TikTok first frame style,
clean screen, no overlays, pure video frame only
```

### Os 6 elementos obrigatórios:

1. **PESSOA** — Idade, etnia, cabelo, roupa. Ex: `Brazilian woman 25-30s, long dark wavy hair, wearing gray oversized t-shirt`
2. **PRODUTO** — Descrição completa: cor, textura, formato. NUNCA apenas o nome
3. **EXPRESSÃO** — Detalhe: `wide eyes, open mouth, raised eyebrows, genuine shocked smile`. Evite apenas "surprised"
4. **AMBIENTE** — Fundo com contexto real: `blurred kitchen background with plants`, `cozy bedroom with warm lamp`
5. **LUZ** — Especifique a fonte: `warm natural daylight from window` / `warm pendant lamp overhead` / `RGB purple ambient light`
6. **SPECS** — Sempre fechar com: `photorealistic iPhone 16 Pro quality, no filter, clean screen, no overlays, pure video frame only`

### Ângulos que mais convertem:
| ÂNGULO | QUANDO USAR | EFEITO |
|---|---|---|
| Frontal direto (olhando câmera) | Time, anime, motivacional | Conexão direta com o espectador |
| POV hands-only (sem rosto) | Produtos femininos, organização, beleza | Espectador SE VÊ usando o produto |
| Lateral surpresa (apontando para algo) | Quadros, decoração, produtos na parede | Cria curiosidade do que está apontando |
| Close no produto (rosto desfocado atrás) | Lançamentos, produtos premium | Produto como herói, rosto cria contexto |

---

## 6. EXEMPLO REAL COMPLETO — PROMPT DE VÍDEO

### Copo Palmeiras:
```
[Visual Style & Reference] Photorealistic UGC, filmed with smartphone, clean frame,
authentic Brazilian home living room, warm ceiling lights, TV showing Palmeiras scoring
goal in background, cozy apartment, 9:16 vertical, no filter, no tripod, clean screen,
no overlays, pure video frame only.
[Character] Brazilian man 28-35s, short dark hair, green Palmeiras jersey, navy shorts,
barefoot, athletic build. Holding white Palmeiras thermal cup raised in one hand.
[The Scene & Action - 6 Seconds]
0-2s (HOOK): Man explodes off couch screaming "GOOOOOL!" arms in the air, white
Palmeiras cup raised high, TV showing Palmeiras player celebrating, friends jumping
in background, pure chaos and joy, handheld camera shaking from excitement
2-4s (PRODUTO): Catches breath, turns directly to camera with huge grin, brings cup
close — "Irmão... assistir o Verdão com esse copo trincando é outra experiência" —
clinks cup toward camera lens, winks — "Assim o time ganha" — laughs genuinely
4-6s (CTA): Points finger down toward screen — "Deixei ali no carrinho laranja, corre
lá antes que esgota!" — holds cup steady showing full Palmeiras crest, thumb pointing
down to TikTok Shop
[Technical Specs] Handheld iPhone shake on gol moment, sharp focus when showing product,
crowd noise + commentary from TV audible, warm living room light, Brazilian Portuguese,
no subtitles, no watermark, clean screen, no overlays, no UI elements,
pure video frame only, 9:16 photorealistic
```

### Regras do script falado:
- Frases CURTAS — máximo 15 palavras por fala
- Tom NATURAL brasileiro — gente, irmão, cara, rapazeada
- SEMPRE terminar com carrinho laranja + urgência
- Reticências (...) criam pausa dramática
- Emojis no script ajudam a definir a energia da cena
- Script entre aspas (' ') — facilita leitura do gerador

---

## 7. AMBIENTES POR TIPO DE PRODUTO

| PRODUTO | AMBIENTE | PERSONAGEM | LUZ |
|---|---|---|---|
| Time de futebol (copo, quadro, luminária) | Sala com TV ou carro | Torcedor com camisa do time | Warm indoor ou natural car |
| Anime/Gamer (quadro, setup) | Quarto RGB noturno | Jovem otaku, hoodie preto | RGB purple/blue como hero light |
| Cozinha (facas, temperos, panos) | Cozinha caseira com plantas | Mulher avental ou denim shirt | Natural window daylight |
| Ferramenta/Mecânica (kit chaves) | Garagem com carro ao fundo | Homem barbudo, t-shirt cinza | Edison bulb overhead |
| Beleza/Perfume (atomizador, colar) | Carro ou banheiro | Mulher natural, unhas francesinha | Natural daylight ou ring light suave |
| Pet (cama, acessórios) | Sala chão de madeira | Mulher casual com pet | Natural warm daylight |
| Decoração (painel, quadro motivacional) | Home office ou quarto | Homem/mulher casual | Desk lamp ou natural |
| Saúde/Bem-estar (anti-ronco) | Quarto noturno, cama com travesseiro | Mulher pijama ou camisão | Warm bedside lamp only |

---

## 8. GATILHOS DE CONVERSÃO

| GATILHO | FRASE | QUANDO USAR |
|---|---|---|
| PREÇO ABSURDO | "Isso tá quase de graça..." | Produto com desconto > 40% |
| IDENTIDADE | "Só quem é fã de verdade..." | Times, anime, fandoms |
| URGÊNCIA | "Antes que esgota / Saldo relâmpago" | Sempre no CTA final |
| PRESENTE | "Presente perfeito para..." | Datas comemorativas |
| DESCOBERTA | "Não acredito que existe isso..." | Produtos inovadores |
| TRANSFORMAÇÃO | "Transformei meu [espaço] por..." | Decoração, organização |
| PROBLEMA RESOLVIDO | "Nunca mais [problema]..." | Produtos utilitários |
| CUMPLICIDADE | "Comprei pra ele... to usando também" | Beleza masculina vendida por mulher |

---

## 9. REGRAS TÉCNICAS OBRIGATÓRIAS

### Linha obrigatória no final de QUALQUER prompt:
```
clean screen, no overlays, no recording indicators, no camera UI, no doodles,
no annotations, no timer, no icons, no graphics on screen, pure video frame only,
9:16 photorealistic
```
> Geradores como Veo e Kling adicionam automaticamente UI, timers e rabiscos. Essa linha remove tudo.

### Outras regras técnicas:
- **MÁXIMO 3 OBJETOS PEQUENOS** — Nunca peça leque de cartas ou múltiplos objetos. Máximo 3 cartas, 3 facas, 3 itens por vez ou o gerador buga
- **CÂMERA SEMPRE HANDHELD** — Nunca use 'tripod shot' ou 'stable camera'. Precisa de movimento natural para parecer UGC real
- **LUZ ÚNICA COMO HERÓI** — Defina UMA fonte de luz principal. Evite iluminação múltipla
- **FUNDO SEMPRE DESFOCADO** — O fundo deve ter contexto mas nunca competir com o produto: `blurred, slightly out of focus, bokeh`
- **SEM MARCAS VISÍVEIS** — Nunca mencione marcas específicas de câmera ou iluminação. `filmed with smartphone` é suficiente

---

## 10. TABELA DE PERSONAS POR NICHO

| NICHO | PERSONA | ROUPA | EXPRESSÃO | TOM DA VOZ |
|---|---|---|---|---|
| Futebol (times BR) | Homem 28-40s, cabelo curto stubble | Camisa do time, shorts casual | Orgulho/Emoção, punho cerrado | Rapazeada... Nação / Mengão |
| Anime/Otaku | Homem ou mulher 18-28s | Hoodie preto de anime | Choque/Admiração, olhos arregalados | Cara... / Gente... que absurdo |
| Cozinha/Casa | Mulher 30-45s, cabelo preso | Avental denim ou t-shirt casual | Satisfação/Surpresa, sorriso genuíno | Gente... / Isso aqui resolveu minha vida |
| Mecânica/Ferramentas | Homem 30-40s, barba grossa | Camiseta cinza ou dark | Espanto/Malícia, smirk confiante | Irmão... / Isso tá quase de graça |
| Beleza/Perfume | Mulher 22-30s, cabelo solto | Camiseta branca ou no carro | Cumplicidade/Joy, olho piscando | Comprei pra ele... mas to usando também |
| Gamer/Setup | Homem 18-28s, cabelo curto | Hoodie oversized escuro | Impressionado, smile orgulhoso | Cara... isso ficou absurdamente lindo |
| Pet | Mulher 22-35s casual | T-shirt home outfit | Amor/Derretendo, sorriso materno | Ele nem me vê mais desde que... |

---

## 11. EXEMPLOS COMPLETOS POR PRODUTO

### Exemplo 1 — Luminária do Flamengo (IMAGEM)
```
Vertical 9:16, Brazilian man 25-35s, short dark hair, wearing black t-shirt, sitting
on bed in dark bedroom, Flamengo acrylic LED shield lamp glowing blue on nightstand
beside him — transparent acrylic engraved CRF Flamengo crest, white round LED base,
blue light casting glow across the room and his face, pointing at lamp with one finger,
genuine proud smile looking directly at camera, wood panel wall visible blurred behind,
photorealistic iPhone 16 Pro quality, no filter, clean screen, no overlays,
pure video frame only
```

### Exemplo 2 — Kit Facas (VÍDEO)
```
[Visual Style & Reference] Photorealistic UGC, filmed with smartphone, clean frame,
authentic Brazilian home kitchen, warm natural light from window, wooden cutting board
on counter, 9:16 vertical, no filter, no tripod, clean screen, no overlays,
pure video frame only.
[Character] Brazilian woman 30-40s, dark hair tied in messy bun, wearing gray t-shirt
under denim blue apron, bright genuine smile.
[The Scene & Action - 6 Seconds]
0-2s (HOOK): Camera opens on shocked face — raises knife kit fanned on counter —
"Gente... esse kit INTEIRO por menos de 50 reais?!"
2-4s (PRODUTO): Picks up cleaver with ONE hand, shows black textured blade —
"No mercado isso é 120 reais fácil... a qualidade tá absurda"
4-6s (CTA): Points finger firmly down — "Carrinho laranja AGORA antes que acaba
o estoque com esse preço!"
[Technical Specs] Kit displayed on counter avoids bug of holding multiple objects,
warm kitchen window light, clean screen, no overlays, 9:16
```

### Exemplo 3 — Quadro Wanted One Piece (POV)
```
Vertical 9:16, true first-person POV shot, feminine hands holding framed Monkey D Luffy
Gear 5 Wanted poster — both hands gripping black wooden frame, aged yellow paper texture
showing "WANTED" bold text, Luffy Gear 5 illustration, "DEAD OR ALIVE MONKEY D LUFFY
3,000,000,000 MARINE" text clearly readable, purple RGB ambient light from left side,
One Piece figures and manga shelf softly blurred in background, no face visible,
photorealistic smartphone quality, clean screen, no overlays, pure video frame only
```

---

## 12. LEGENDAS TIKTOK SHOP

### Sempre criar 3 versões + 1 master curta:

**Versão 1 — PREÇO ABSURDO:**
```
[Descrição do que é absurdo no preço] [emoji choque] [desconto %] carrinho laranja
AGORA! #[produto] #[nicho] #tiktokshop #achados
```

**Versão 2 — SOLUÇÃO PROBLEMA:**
```
Chega de [problema que o produto resolve] [emoji negação] [benefício principal]
Carrinho laranja! #[nicho] #tiktokshop
```

**Versão 3 — PRESENTE:**
```
O presente perfeito pra [público] [emoji presente] [produto] por [preço]...
corre no carrinho laranja! #presente #tiktokshop
```

**Legenda Master (curta):**
```
[Frase de impacto sobre o preço ou resultado] [emoji] Carrinho laranja antes que
esgota! #tiktokshop #achados #[nicho]
```

### Hashtags por nicho:
| NICHO | HASHTAGS |
|---|---|
| Futebol | #flamengo #mengao #palmeiras #vasco #corinthians #tiktokshop #nacao |
| Anime/Gamer | #onepiece #anime #gamer #setup #otaku #tiktokshop #achados |
| Cozinha/Casa | #cozinha #organização #casa #decor #dicasdecasa #tiktokshop |
| Ferramentas | #ferramentas #mecanica #carro #diy #tiktokshop #achados |
| Beleza | #beleza #skincare #perfume #maquiagem #tiktokshop #dicasfemininas |
| Pet | #pet #cachorro #gato #petlovers #tiktokshop #achados |
| Viagem | #viagem #travel #mochileira #dicasdeviagem #tiktokshop |

---

## 13. ERROS COMUNS E COMO CORRIGIR

| ERRO | CAUSA | SOLUÇÃO |
|---|---|---|
| Ícones e timer na tela | Gerador adiciona UI automaticamente | Adicionar: `clean screen, no overlays, no recording indicators` ao final |
| Mãos bugadas com muitos objetos | Gerador não processa bem múltiplos itens | Máximo 3 objetos por vez na mão |
| Ambiente parece estúdio | Fundo muito limpo ou iluminação perfeita | Adicionar: `slightly messy, authentic, lived-in, handheld natural shake` |
| Produto não aparece bem | Descrição vaga do produto | Descrever cor, textura, formato, texto visível, material detalhado |
| Expressão forçada | Descrição genérica da emoção | Especificar: `wide eyes, open mouth, raised eyebrows, genuine shocked smile` |
| Vídeo parece propaganda | Tom muito formal ou produto no início | Hook emocional primeiro, produto só aparece no segundo momento |

---

## 14. PROMPT MASTER (system prompt completo)

```
Você é um especialista em criação de prompts UGC para TikTok Shop brasileiro.

QUANDO receber uma imagem de produto, SEMPRE:
1. Identificar o produto, público-alvo e emoção principal
2. Gerar PROMPT DE IMAGEM para Nano Banana (frame inicial)
3. Gerar PROMPT DE VÍDEO com estrutura de 6 segundos
4. Sugerir hook, copy e CTA em português brasileiro

ESTRUTURA OBRIGATÓRIA DE PROMPT VÍDEO:
[Visual Style & Reference] — ambiente, luz, specs
[Character] — pessoa, roupa, o que segura
[The Scene & Action - 6 Seconds]
  0-2s (HOOK): emoção forte + frase de impacto
  2-4s (PRODUTO): demonstração + benefício
  4-6s (CTA): carrinho laranja + urgência
[Technical Specs] — sempre terminar com:
"clean screen, no overlays, no recording indicators, no camera UI,
no doodles, pure video frame only, 9:16 photorealistic"

REGRAS FIXAS:
- Ambiente sempre caseiro e autêntico, nunca estúdio
- Câmera sempre handheld com leve tremor natural
- Hook NUNCA começa pelo produto — começa pela emoção
- CTA sempre "carrinho laranja" + "corre antes que esgota"
- Máximo 3 objetos pequenos na mão por vez (evita bug)
- Tom sempre brasileiro: gente, irmão, cara, rapazeada

AMBIENTES POR NICHO:
- Futebol: sala com TV ou carro
- Anime/Gamer: quarto RGB noturno
- Cozinha: cozinha caseira com plantas
- Ferramentas: garagem com carro
- Beleza: carro ou banheiro
- Pet: sala chão de madeira
- Saúde: quarto noturno com abajur
```

---

*Boas vendas. Foco no carrinho laranja.*
