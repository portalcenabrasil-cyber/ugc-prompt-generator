# Design System — UGC·AI

## Estilo Visual
Apple-inspired, minimalista, dark, iridescente sutil.

## Fundo
- Base: `#000000` puro
- Gradientes atmosféricos de fundo: azul escuro e roxo (ex: `radial-gradient(ellipse at top, #0a0a1a, #000)`)

## Efeito Iridescente
- Bordas de cards com glow que muda entre azul, roxo e laranja no hover
- Implementar via `box-shadow` e `border-color` animados no `:hover`
- Exemplo: `box-shadow: 0 0 20px rgba(255,102,0,0.15), 0 0 40px rgba(204,68,255,0.1)`

## Tipografia
- Fonte: `SF Pro Display`, `system-ui`, `-apple-system`, sans-serif
- Títulos: `font-weight: 700`, limpa e espaçada
- Labels: `text-transform: uppercase`, `letter-spacing: 0.1em`, `color: rgba(255,255,255,0.4)`

## Cards
- Glassmorphism leve:
  - `background: rgba(255,255,255,0.03)`
  - `backdrop-filter: blur(10px)`
  - `border: 1px solid rgba(255,255,255,0.08)`
- Nunca usar fundo branco

## Cor de Ação
- Gradiente iridescente no lugar do laranja sólido:
  - `linear-gradient(135deg, #ff6600, #cc44ff, #0099ff)`
- Aplicar em botões primários, destaques e indicadores de progresso

## Animações
- Duração: `0.3s ease`
- Suaves, sem exagero
- Usar `transition` em vez de animações complexas sempre que possível

## Espaçamento
- Estilo Apple — generoso
- Padding mínimo: `24px`
- Gaps entre elementos: `20px`

## Botões
- Primário: `border-radius: 100px`, gradiente iridescente
- Secundário: `border-radius: 8px`, borda sutil

## Regras Invioláveis
- Nunca usar fundo branco
- Nunca adicionar elementos visuais que quebrem a automação existente (geração de prompts, galeria, lote, SSE)
