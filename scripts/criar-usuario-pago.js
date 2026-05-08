#!/usr/bin/env node
/**
 * Cria (ou atualiza) um usuário pago no Supabase.
 *
 * Uso:
 *   node scripts/criar-usuario-pago.js <email> <senha> <plano> <generations_limit> [name]
 *
 * Exemplo:
 *   node scripts/criar-usuario-pago.js daviddavi145@gmail.com senha12345 starter 285 David
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const [,, email, password, plan, generationsLimitStr, name] = process.argv;

if (!email || !password || !plan || !generationsLimitStr) {
  console.error('Uso: node scripts/criar-usuario-pago.js <email> <senha> <plano> <generations_limit> [name]');
  process.exit(1);
}

const generations_limit = parseInt(generationsLimitStr, 10);
if (isNaN(generations_limit)) {
  console.error('generations_limit deve ser um número inteiro.');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  // Verifica se já existe
  const { data: existing } = await supabase
    .from('users')
    .select('id, email, plan, plan_active')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  const password_hash = await bcrypt.hash(password, 12);

  if (existing) {
    console.log(`Usuário já existe (id: ${existing.id}). Atualizando plano...`);
    const { data, error } = await supabase
      .from('users')
      .update({
        password_hash,
        plan,
        plan_active: true,
        generations_limit,
        generations_used: 0,
        is_admin: false,
        ...(name ? { name } : {}),
      })
      .eq('id', existing.id)
      .select('id, email, name, plan, plan_active, generations_limit, generations_used, is_admin')
      .single();

    if (error) { console.error('Erro ao atualizar:', error.message); process.exit(1); }
    console.log('✅ Usuário atualizado com sucesso:');
    console.table(data);
  } else {
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash,
        name: name || null,
        plan,
        plan_active: true,
        generations_limit,
        generations_used: 0,
        is_admin: false,
      })
      .select('id, email, name, plan, plan_active, generations_limit, generations_used, is_admin')
      .single();

    if (error) { console.error('Erro ao criar usuário:', error.message); process.exit(1); }
    console.log('✅ Usuário criado com sucesso:');
    console.table(data);
  }

  // SELECT de confirmação
  const { data: confirm } = await supabase
    .from('users')
    .select('id, email, name, plan, plan_active, generations_limit, generations_used, is_admin')
    .eq('email', email.toLowerCase())
    .single();

  console.log('\n📋 Confirmação via SELECT:');
  console.table(confirm);
})();
