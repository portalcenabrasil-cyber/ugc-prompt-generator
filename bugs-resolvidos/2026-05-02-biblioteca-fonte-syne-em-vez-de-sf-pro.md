# Bug: Biblioteca Usando Fonte Syne (Errada) em Títulos

**Data:** 2026-05-02  
**Status:** Resolvido

## Sintoma

Títulos da biblioteca usavam a fonte `Syne` (Google Fonts) em vez do system font stack `SF Pro Display / system-ui` usado no app principal (`index.html`).

## Causa Raiz

Ao criar `biblioteca.html`, o `--font-title` foi definido como `'Syne'` seguindo uma referência de design anterior. O site real usa system fonts (sem Google Fonts para os títulos). Além disso, o hero da biblioteca não aplicava o mesmo gradient de texto que o hero da landing (`linear-gradient(150deg, #fff 20%, rgba(255,255,255,0.42) 100%)`).

## Correção Aplicada

1. **CSS `--font-title`**: `'Syne', BlinkMacSystemFont` → `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif`
2. **Google Fonts**: removido `Syne:wght@400;600;700;800;900` do `<link>` (mantidos apenas DM Mono e DM Sans)
3. **`.hero-title`**: agora usa exatamente o mesmo estilo da landing:
   - `font-size: clamp(36px, 6.5vw, 96px)`
   - `background: linear-gradient(150deg, #fff 20%, rgba(255,255,255,0.42) 100%)` + `-webkit-background-clip: text`
4. **`.hero-title-gradient`** (2ª linha): mantém o gradient iridescente `linear-gradient(135deg, #ff6600, #cc44ff, #0099ff)`

## Arquivo

`public/biblioteca.html` — `<link>` de fonts, `:root { --font-title }`, `.hero-title`, `.hero-title-gradient`
