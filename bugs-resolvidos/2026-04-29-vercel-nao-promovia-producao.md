# Vercel não disparava deploy automático após git push

Tags: #fix-bug #deploy #vercel
Data: 2026-04-29

## Sintoma
`git push origin main` completava com sucesso, mas a URL de produção (`https://ugc-prompt-generator-six.vercel.app`) continuava na versão anterior. Nenhum deploy era disparado automaticamente.

## Causa raiz
O projeto foi originalmente criado via **CLI** (`vercel deploy`), não via "Import from GitHub" no painel da Vercel. Projetos criados pelo CLI têm `link.type = null` — não têm vínculo com repositório GitHub, portanto não monitoram pushes no branch `main`.

## Solução
Conectar o projeto ao repositório via **API da Vercel**:
```
POST /v2/projects/{projectId}/link
{
  "type": "github",
  "repoId": 1214862460,
  "productionBranch": "main"
}
```
Após a conexão, o auto-deploy via push passou a funcionar normalmente.

## Fallback (caso a integração quebre novamente)
```bash
vercel deploy --prod
```
Este comando força deploy da versão local diretamente para produção, contornando a integração GitHub.

## Arquivo modificado
Configuração Vercel (painel web + API) — sem alteração de código

## Observação
Se futuramente um `git push` não disparar deploy, este é o primeiro bug a investigar. Sinal: produção parada na versão anterior por mais de 3 minutos após o push.
