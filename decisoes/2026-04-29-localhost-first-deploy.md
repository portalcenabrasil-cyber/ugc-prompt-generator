# Localhost-first: testar local antes de qualquer deploy

Tags: #decisao-arquitetural #deploy #regra-inviolavel
Data: 2026-04-29

## Contexto
Em dois momentos distintos, um push direto para o `main` sem teste local quebrou a produção. O Vercel auto-deploya imediatamente qualquer push, sem janela de rollback automático. Erros chegam aos usuários antes de serem detectados.

## Decisão
**REGRA SAGRADA — inviolável:** toda alteração (código, prompt `.md`, HTML, config) deve ser:
1. Testada em `localhost:3000` primeiro
2. Todos os 4+ estilos confirmados funcionando
3. SÓ ENTÃO: `git commit` + `git push origin main`

## Motivo
- Vercel deploya em 1-2 minutos após o push — erros ficam visíveis em produção rapidamente
- Rollback manual via `git push -f` é destrutivo e arriscado
- O custo de testar local (2-5 minutos) é sempre menor que o custo de um hotfix em produção
- Histórico: após push direto, `public/index.html` ficou 2 horas com versão antiga em produção (ver [[bugs-resolvidos/2026-04-29-html-velho-cache-vercel]])

## Exceções
Nenhuma. Mesmo hotfixes críticos passam pelo localhost primeiro.

## Fluxo completo documentado
Ver [[00-INDEX/00-README.md]] — seção "Fluxo de Deploy".

## Arquivos afetados
[[CLAUDE]] (regra registrada na seção DEPLOY)
