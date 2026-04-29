# public/index.html continuava versão antiga em produção após push

Tags: #fix-bug #deploy #vercel
Data: 2026-04-29

## Sintoma
Após `git push origin main`, o servidor em produção servia o `public/index.html` da versão anterior. Mesmo forçando hard refresh no browser, o HTML antigo persistia.

## Causa raiz
O `@vercel/node` usa **ncc** para empacotar `server.js` numa Lambda. O ncc inclui apenas o código JS e suas dependências — **não inclui arquivos estáticos** lidos via `res.sendFile()` em tempo de execução. O `public/index.html` ficava para trás do bundle.

## Solução (dois passos)

**1. Ler index.html em memória no startup** (Lambda-safe):
```js
// Em server.js, no início do arquivo:
const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

// Na rota GET /:
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(indexHtml);
});
```

**2. Adicionar `public/**` ao `vercel.json` includeFiles**:
```json
{
  "functions": {
    "server.js": {
      "includeFiles": ["public/**", "PROMPT*.md", "CONTEXT.md"]
    }
  }
}
```
Sem o `includeFiles`, o Vercel não bundla os arquivos estáticos na função.

## Efeito colateral importante
Editar `public/index.html` localmente exige **restart do servidor** (`Ctrl+C` + `node server.js`) para a mudança refletir em localhost — o HTML é lido apenas no startup. Em produção, o push + deploy já resolve porque a Lambda reinicia.

## Arquivos modificados
`server.js`, `vercel.json`

## Tag git associada
`stable-v1.1-20260429`
