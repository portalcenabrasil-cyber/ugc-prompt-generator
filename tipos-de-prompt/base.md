# Estilo Base

Tags: #estilo-prompt
Arquivo do prompt: [[PROMPT]]
Data de criação: 2026-04-29 (estimado — anterior a todos os outros)
Status: Ativo

## Quando usar
Produto genérico de qualquer nicho (beleza, cozinha, pet, ferramentas, etc.). Não tem nicho específico — é o estilo universal de entrada. Ideal quando o usuário ainda não sabe qual estilo usar.

## Input esperado
- Imagem do produto (upload via interface)
- Nenhum parâmetro extra obrigatório

## Output gerado
JSON com 4 campos:
```json
{
  "prompt_video": "Prompt de 6 segundos (3 momentos: HOOK / PRODUTO / CTA)",
  "legenda": "~150 chars, 1 emoji, máx 5 hashtags",
  "nicho": "Nicho identificado automaticamente pela IA",
  "emocao": "Emoção principal que o produto evoca"
}
```

## Estrutura do prompt_video
- `[Visual Style & Reference]` — ambiente caseiro, luz, 9:16
- `[Character]` — persona variável (6 arquétipos: Entusiasta, Desconfiado Convertido, etc.)
- `[The Scene & Action - 6 Seconds]` com sub-seções 0-2s (HOOK) / 2-4s (PRODUTO) / 4-6s (CTA)
- `[Technical Specs]` — linha obrigatória de clean screen no final

## Decisões relacionadas
- [[decisoes/2026-04-29-prompt-md-no-vault]] — por que é um `.md` e não hardcoded no `server.js`

## Bugs históricos
- [[bugs-resolvidos/2026-04-28-truncamento-aspas-json]] — truncamento em lote afetava principalmente este estilo

## Notas adicionais
- HOOK nunca começa com o produto — sempre com emoção ou situação relatable
- CTA varia entre 10 frases diferentes de urgência (carrinho laranja)
- Personagem usa SEMPRE t-shirt básica lisa — nunca camisa de time ou estampa
- Câmera: sempre handheld com leve tremor, nunca tripé
