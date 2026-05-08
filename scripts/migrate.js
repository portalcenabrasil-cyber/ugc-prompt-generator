#!/usr/bin/env node
// scripts/migrate.js
// Aplica as migrations SQL do painel admin contra o Supabase (via conexão Postgres direta).
//
// USO:
//   npm run migrate              → aplica todas as migrations (001 → 011)
//   npm run migrate:down         → reverte todas (011 → 001)
//   node scripts/migrate.js up 003        → aplica só até 003
//   node scripts/migrate.js down 005      → reverte só até 005
//   node scripts/migrate.js up --dry-run  → mostra os SQLs sem executar
//
// REQUISITO: DATABASE_URL no .env
//   Formato Supabase: postgresql://postgres.[project-ref]:[password]@[host]:5432/postgres
//   Disponível em: Supabase Dashboard → Settings → Database → Connection string (URI)

require('dotenv').config();
const { Client } = require('pg');
const fs         = require('fs');
const path       = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations', '2026-05-08-admin');

const direction = (process.argv[2] || 'up').toLowerCase();
const limitArg  = process.argv.find(a => !a.startsWith('--') && a !== direction);
const dryRun    = process.argv.includes('--dry-run');

if (!['up', 'down'].includes(direction)) {
  console.error('Uso: node scripts/migrate.js [up|down] [número] [--dry-run]');
  process.exit(1);
}

// Coleta arquivos de migration ordenados
function getMigrationFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.match(/^\d{3}-[^.]+\.sql$/) && !f.endsWith('.down.sql'))
    .sort();
}

function getDownFile(upFile) {
  return upFile.replace('.sql', '.down.sql');
}

function getNumber(filename) {
  return filename.slice(0, 3);
}

async function run() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('\n❌  DATABASE_URL não encontrado no .env');
    console.error('   Adicione: DATABASE_URL=postgresql://postgres.[ref]:[senha]@[host]:5432/postgres');
    console.error('   Disponível em: Supabase → Settings → Database → Connection string\n');
    process.exit(1);
  }

  let files = getMigrationFiles(MIGRATIONS_DIR);

  // Filtro por número limite (ex: "003")
  if (limitArg) {
    const limit = limitArg.padStart(3, '0');
    files = files.filter(f => {
      const n = getNumber(f);
      return direction === 'up' ? n <= limit : n >= limit;
    });
  }

  if (direction === 'down') files = files.reverse();

  if (files.length === 0) {
    console.log('Nenhuma migration encontrada para os critérios informados.');
    return;
  }

  console.log(`\n🗄  Migrations — direção: ${direction.toUpperCase()}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`   Total: ${files.length} arquivo(s)\n`);

  if (dryRun) {
    for (const f of files) {
      const sqlFile = direction === 'up' ? f : getDownFile(f);
      const sqlPath = path.join(MIGRATIONS_DIR, sqlFile);
      if (!fs.existsSync(sqlPath)) {
        console.log(`⚠️  [SKIP] ${sqlFile} — arquivo não encontrado`);
        continue;
      }
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`── ${sqlFile} ${'─'.repeat(50 - sqlFile.length)}`);
      console.log(sql.trim());
      console.log();
    }
    console.log('✅  Dry run concluído. Nenhuma alteração foi feita.\n');
    return;
  }

  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log('✔  Conectado ao Postgres\n');
  } catch (err) {
    console.error(`❌  Falha na conexão: ${err.message}\n`);
    process.exit(1);
  }

  let ok = 0, fail = 0;

  for (const f of files) {
    const sqlFile = direction === 'up' ? f : getDownFile(f);
    const sqlPath = path.join(MIGRATIONS_DIR, sqlFile);

    if (!fs.existsSync(sqlPath)) {
      console.warn(`⚠️  [SKIP] ${sqlFile} — arquivo não encontrado`);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    process.stdout.write(`  ⏳  ${sqlFile} ... `);

    try {
      await client.query(sql);
      console.log('✔');
      ok++;
    } catch (err) {
      console.log(`✘\n     ${err.message}`);
      fail++;
      // Continua para os próximos — cada migration é independente
    }
  }

  await client.end();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`   ✔ ${ok} ok    ✘ ${fail} erro(s)`);
  if (fail > 0) {
    console.log('   Verifique os erros acima. Cada migration é independente — as demais foram aplicadas.');
  }
  console.log();
}

run().catch(err => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
