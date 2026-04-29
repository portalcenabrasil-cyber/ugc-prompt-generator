# Checklist — Adicionar Novo Estilo de Prompt

Tags: #template #estilo-prompt
Quando criar um estilo novo, seguir esta checklist integralmente. Não pular etapas.

## Fase 1 — System Prompt (vault)
- [ ] Criar `PROMPT-NOMENOVO.md` na **raiz do vault**
- [ ] Seguir estética visual do [[PROMPT-serie]] (separadores `═══`, seções em CAPS)
- [ ] Incluir seção `REGRAS INVIOLÁVEIS` no topo
- [ ] Incluir instrução de output JSON puro no final (sem markdown, sem blocos de código)
- [ ] Usar `legenda_topo` para legendas de vídeo final — nunca `ancora_fixa`
- [ ] Adicionar cabeçalho de metadata YAML no topo do arquivo:
  ```yaml
  ---
  Tags: #estilo-prompt
  Estilo: [nome-do-estilo]
  Documentação: [[tipos-de-prompt/nome]]
  Decisões relacionadas: [[decisoes/...]]
  Última atualização: YYYY-MM-DD
  ---
  ```

## Fase 2 — Documentação (vault)
- [ ] Criar `tipos-de-prompt/nome.md` com metadata (quando usar, input, output schema)
- [ ] Atualizar `tipos-de-prompt/index.md` incluindo o novo estilo
- [ ] Atualizar `00-INDEX/00-README.md` — tabela "Estilos Ativos"
- [ ] Se houver decisão arquitetural nova, criar em `decisoes/YYYY-MM-DD-descricao.md`

## Fase 3 — Backend (`server.js`)
- [ ] Adicionar branch `if (style === 'nomenovo')` na lógica de roteamento
- [ ] Ler o prompt com `fs.readFileSync('PROMPT-NOMENOVO.md', 'utf8')`
- [ ] Passar parâmetros específicos do estilo para o Claude (se necessário)
- [ ] Testar que o JSON retornado bate com o schema definido no prompt

## Fase 4 — Frontend (`public/index.html`)
- [ ] Adicionar botão de seleção do estilo no `styleGroup` do HTML
- [ ] Criar constante `NOMENOVO_CARD_CONFIG` com os campos do JSON
- [ ] Adicionar caso em `renderResult()` para o novo estilo
- [ ] Adicionar caso em `copyAll()` para copiar todos os campos
- [ ] Adicionar caso em `openGalleryItem()` para renderizar histórico corretamente
- [ ] Testar que galeria abre com layout correto (não herda layout de outro estilo)

## Fase 5 — Testes
- [ ] Testar em `localhost:3000`
- [ ] Confirmar que todos os estilos **anteriores** ainda funcionam (sem regressão)
- [ ] Testar galeria: gerar, salvar, reabrir — layout correto?
- [ ] Testar copyAll: todos os campos copiados corretamente?

## Fase 6 — Deploy
- [ ] `git add .`
- [ ] `git commit -m "feat: adicionar estilo [nome]"`
- [ ] `git push origin main`
- [ ] Aguardar 1-2 min e verificar produção
- [ ] Testar em produção com produto real
