# UGC Prompt Generator — Índice Central

**Última atualização:** 2026-05-02
**Versão estável atual:** v3.0-base-v2-biblioteca-150-20260501
**URL produção:** https://ugc-prompt-generator-six.vercel.app

## Visão Geral
Plataforma Node.js + Express que gera prompts UGC para TikTok Shop Brasil. Frontend single-file em `public/index.html`. System prompts mantidos como arquivos `.md` neste vault Obsidian, lidos ao vivo pelo servidor a cada geração.

## Estilos Ativos
| Estilo | Arquivo | Descrição |
|---|---|---|
| Base | [[PROMPT]] | Prompt UGC genérico para qualquer produto — 6s, 3 momentos, personagem variável |
| Edredons Premium | [[PROMPT-serie]] | Edredom + character_sheet + 3-4 cenas (Nano Banana apenas) |
| Nano + Vídeos | [[PROMPT-nano]] | Edredom Nano: output em bloco único (Nano + Veo concatenados por cena) |
| Nano + Vídeos 2 | [[PROMPT-nano-veo-2]] | Edredom Nano: cards separados (imagem e vídeo em campos distintos) |
| Roupa Feminina | [[PROMPT-roupa-feminina]] | Roupa feminina + Modo A (modelo nova) e Modo B (referência de imagem) |
| **⚡ Base v2** | [[PROMPT-base-v2]] | **UGC autêntico: detecta nicho, seleciona personagem do pool de 100, gera 5 cards (character sheet, start frame, vídeo 1, vídeo 2 continuação, legendas)** |

## Documentação por Tópico
- [[tipos-de-prompt/index]] — Catálogo de todos os estilos (metadata, quando usar, schema de output)
- [[decisoes/index]] — Decisões arquiteturais importantes do projeto
- [[bugs-resolvidos/index]] — Bugs críticos já resolvidos com causa raiz documentada
- [[templates/index]] — Templates pra criar novas notas rapidamente

## Stack Técnico
- **Backend:** Node.js + Express (`server.js`)
- **Frontend:** HTML/CSS/JS single-file (`public/index.html`)
- **DB:** Supabase
- **IA:** Anthropic Claude (vision) — modelo claude-sonnet-4-6
- **Deploy:** Vercel (auto-deploy do branch `main` via integração GitHub)
- **Vault:** Obsidian (este diretório) — prompts `.md` lidos via `fs.readFileSync` a cada request

Regras gerais em [[CLAUDE]] | Regras de skills em [[CONTEXT]]

## Páginas Extras
| Rota | Arquivo | Descrição |
|---|---|---|
| `/biblioteca` | `public/biblioteca.html` | Galeria visual de 69 prompts UGC — filtros por categoria, busca, modal, admin |

## Fluxo de Deploy (REGRA SAGRADA)
1. Edita arquivo localmente ou no Obsidian
2. Sobe `localhost:3000` e testa (`npm start` ou `node server.js`)
3. Confirma todos os 4 estilos originais funcionando + o novo se for o caso
4. `git add . && git commit -m "msg"`
5. `git push origin main`
6. Aguarda 1-2 min — Vercel auto-deploya via GitHub
7. Verifica produção em https://ugc-prompt-generator-six.vercel.app

> NUNCA commit/push sem testar local primeiro. Ver [[decisoes/2026-04-29-localhost-first-deploy]].

## Pontos de Restauração
- `stable-v1.0-20260429` — antes do auto-deploy GitHub configurado
- `stable-v1.1-20260429` — após auto-deploy + fixes serverless
- `v3.0-base-v2-biblioteca-150-20260501` — Base v2 com 100 personagens + 720 frases nicho + 5 cards sem Script PT-BR (versão estável atual)

## Comandos de Emergência
```bash
# Restaurar local pra versão estável
git checkout v3.0-base-v2-biblioteca-150-20260501

# Subir o servidor
npm install && node server.js

# EMERGÊNCIA: forçar produção a voltar pra essa versão
git push -f origin v3.0-base-v2-biblioteca-150-20260501:main
```

## Tags Usadas no Vault
- `#estilo-prompt` — arquivo é um system prompt ativo lido pelo servidor
- `#regra-inviolavel` — regra que nunca pode ser violada sob nenhuma circunstância
- `#decisao-arquitetural` — registro de uma decisão importante do projeto
- `#fix-bug` — documentação de bug resolvido com causa raiz
- `#template` — template pra reuso em novas notas
- `#deploy` — relacionado ao processo de deploy ou configuração do Vercel
