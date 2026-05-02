# Bug: Click em Qualquer Lugar Causa Glitch / Mostra Hero da Landing

**Data:** 2026-05-02  
**Status:** Resolvido

## Sintoma

Ao clicar em qualquer área da página `/biblioteca`, a página "glitchava" mostrando o hero "UGC PROMPT GENERATOR" da landing page. Nenhum botão funcionava.

## Causa Raiz

Os 3 modais (`modal-backdrop`, `.admin-pw-modal`, `.admin-new-modal`) tinham CSS:
```css
display: flex;          /* SEMPRE flex, mesmo quando ocultos */
opacity: 0;
pointer-events: none;
backdrop-filter: blur(16px/20px);
position: fixed;
inset: 0;
z-index: 200/300;
```

No Chrome/Windows, elementos com `position: fixed; inset: 0; backdrop-filter` criam um **novo stacking context** mesmo com `opacity: 0`. Nesse contexto, `pointer-events: none` pode falhar em interceptar eventos de forma inesperada em certos casos. Com 3 overlays cobrindo 100% da viewport com `backdrop-filter` ativo, qualquer interação ficava comprometida.

## Correção Aplicada

1. **CSS**: Todos os 3 modais agora têm `display: none` por padrão (removido do render tree completamente — nenhum `backdrop-filter` ativo enquanto fechados)
2. **JS**: Funções de abertura usam `modal.style.display = 'flex'` → `requestAnimationFrame(() => modal.classList.add('open'))` para garantir transição suave de opacidade
3. **JS**: Funções de fechamento removem classe `open` (fade out) → `setTimeout(() => modal.style.display = 'none', 260)` para esconder após a transição

## Arquivos

`public/biblioteca.html` — CSS dos 3 modais + funções `openModal`, `closeModal`, `openAdminPw`, `closeAdminPw`, `openNewPromptModal`, `closeNewPromptModal`
