# System prompts como .md no Obsidian

Tags: #decisao-arquitetural #obsidian #estilo-prompt
Data: 2026-04-29

## Contexto
System prompts inicialmente eram strings hardcoded dentro do `server.js`. Cada ajuste de prompt exigia edição do código, commit e deploy na Vercel — ciclo lento e arriscado.

## Decisão
Mover todos os system prompts para arquivos `.md` na raiz do projeto, lidos ao vivo pelo servidor via `fs.readFileSync` a cada request de geração.

## Motivo
- Permite editar prompts diretamente no Obsidian com visualização visual
- Não exige redeploy para ajustes de prompt — salva o arquivo e gera
- Versionamento via git junto com o restante do código
- Separação de responsabilidades: código em `.js`, conteúdo em `.md`
- Facilita experimentação rápida sem risco de quebrar lógica do servidor

## Alternativas consideradas
- **Strings no server.js:** Descartado — editar código pra mudar prompt é frágil e lento
- **Banco de dados (Supabase):** Descartado — overkill pra arquivos de texto estáticos; adiciona latência
- **Variáveis de ambiente:** Descartado — prompts grandes não cabem em `.env`

## Limitações conhecidas
- Editar `public/index.html` localmente exige restart do servidor para refletir (lido em memória no startup)
- `PROMPT-*.md` são lidos a cada request — mudança local reflete imediatamente SEM restart

## Arquivos afetados
[[PROMPT]], [[PROMPT-serie]], [[PROMPT-nano]], [[PROMPT-nano-veo-2]], [[PROMPT-roupa-feminina]], `server.js`
