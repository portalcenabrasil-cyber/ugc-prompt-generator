# Scripts utilitários

## criar-usuario-pago.js

Cria ou atualiza um usuário pago diretamente no Supabase (sem passar pelo webhook da Kiwify).

```bash
node scripts/criar-usuario-pago.js <email> <senha> <plano> <generations_limit> [name]

# Exemplo — plano starter com 285 créditos (200 base + 50 bônus + 35 extra):
node scripts/criar-usuario-pago.js daviddavi145@gmail.com senha12345 starter 285 David
```

Planos disponíveis: `starter` (200) | `pro` (500) | `agencia` (1200)
