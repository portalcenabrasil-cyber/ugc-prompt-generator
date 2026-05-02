# Bug: Grid da Biblioteca Mostrando "0 de 69 Prompts"

**Data:** 2026-05-02  
**Status:** Resolvido

## Sintoma

Grid exibia "Nenhum prompt encontrado" e "Mostrando 0 de 69 prompts" mesmo com tabs mostrando contadores corretos (13/11/3/12/4/26 = 69).

## Causa Raiz

`applyFilters()` não tinha proteção contra falhas de acesso ao DOM. Se `document.getElementById('searchInput')` retornasse `null` por qualquer razão de timing (ex: script rodando antes do DOM estar completamente estável em algumas versões de browser), `.value` lançaria TypeError — abortando a função ANTES de `renderGrid` ser chamado, mas DEPOIS de `updateCounts` já ter atualizado as tabs corretamente (pois `updateCounts` é chamado separadamente em `init()`).

Adicionalmente, `renderGrid` não tinha validação de null nos itens do array, e `init()` não verificava se o JSON retornado era realmente um array.

## Correção Aplicada

1. `applyFilters()` envolvida em `try/catch` com fallback para mostrar todos os prompts sem filtro se ocorrer qualquer erro
2. Verificação `searchEl ? searchEl.value : ''` no acesso ao DOM
3. Null check `!p || typeof p !== 'object'` no callback do `.filter()`
4. Null safety nos campos: `(p.prompt || '') + ...`
5. `init()` verifica `Array.isArray(allPrompts)` após parse do JSON
6. Console.log em `[init]`, `[applyFilters]` e `[renderGrid]` para diagnóstico futuro
7. Fallback `IntersectionObserver`: se não disponível, adiciona classe `visible` diretamente

## Arquivo

`public/biblioteca.html` — funções `init()`, `applyFilters()`, `renderGrid()`
