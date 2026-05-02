# 2026-05-02 — Biblioteca de Prompts: Página Pública `/biblioteca`

**Data:** 2026-05-02  
**Status:** Implementado

## Decisão

Criada rota pública `/biblioteca` que exibe uma galeria visual de prompts UGC organizados por categoria, com filtros, busca textual, modal de visualização e painel admin discreto.

## Motivação

- Facilitar reutilização de prompts já validados sem precisar abrir os arquivos .txt manualmente
- Interface visual (imagem + prompt) para consulta rápida
- Acessível diretamente por URL, sem expor no menu principal ainda

## Arquivos criados

| Arquivo | Função |
|---|---|
| `public/biblioteca.html` | Página completa (HTML+CSS+JS self-contained) |
| `biblioteca/prompts.json` | JSON com 69 entradas (imagem_path + prompt + metadata) |
| `public/biblioteca-images/[slug]/` | Imagens copiadas da pasta local da biblioteca |
| `build-biblioteca.js` | Script de importação (executar uma vez para re-importar) |

## Rotas adicionadas no server.js

```js
app.get('/biblioteca', ...)           // serve biblioteca.html
app.get('/biblioteca/prompts.json', ...) // serve o JSON
// public/biblioteca-images/** já coberto pelo express.static
```

## Alternativas descartadas

- **Banco de dados Supabase:** Overhead desnecessário; JSON simples é suficiente por enquanto
- **Botão na landing/menu:** Adiado a pedido do usuário; página acessível só por URL direta

## Conteúdo importado

| Categoria | Slug | Prompts |
|---|---|---|
| INFLUENCER PODCAST | influencer-podcast | 4 |
| MODELO HOT | modelo-hot | 13 |
| PROMPTS COM IMAGENS INFLUENCER UGC | influencer-ugc | 26 |
| PROMPTS DE UGC ACADEMIA | academia | 11 |
| PROMPTS MULHER CORRIDA | corrida | 3 |
| UGC + PRODUTOS | ugc-produtos | 12 |
| **TOTAL** | | **69** |

## Arquivos órfãos (sem par)

- `PROMPTS COM IMAGENS INFLUENCER UGC/Mulher em vestido vermelho luxuoso foto atras de espelho.jpeg` — imagem sem .txt (nomes divergem do par .txt)
- `PROMPTS COM IMAGENS INFLUENCER UGC/Mulher em vestido vermelho luxuoso.txt` — .txt sem imagem correspondente
- `PROMPTS COM IMAGENS INFLUENCER UGC/Woman in Brazil soccer outfit mostrando a bunda no espelho na sala.txt` — .txt sem imagem
