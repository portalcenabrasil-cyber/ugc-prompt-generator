#!/usr/bin/env node
/**
 * migrate-gallery-images.js
 *
 * Migra imagens base64 da tabela `gallery` para o Supabase Storage.
 * Usa node-fetch direto na REST API (sem @supabase/supabase-js client)
 * para evitar bugs de WebSocket/libuv no Windows.
 *
 * Para cada linha onde image começa com "data:", faz:
 *   1. Extrai o base64
 *   2. Upload para gallery-imgs/{user_id}/{id}.jpg
 *   3. Atualiza image = URL pública no banco
 *
 * SEGURO: não altera nada se upload falhar. Idempotente (pula URLs https://).
 *
 * Uso:
 *   node scripts/migrate-gallery-images.js           → dry run
 *   node scripts/migrate-gallery-images.js --execute → executa de verdade
 */

require('dotenv').config();
const fetch = require('node-fetch');

const DRY_RUN  = !process.argv.includes('--execute');
const BUCKET   = 'gallery-imgs';
const BATCH    = 20;    // linhas por request
const DELAY_MS = 300;   // pausa entre batches (ms)

const BASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const API_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!BASE_URL || !API_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar no .env');
  process.exit(1);
}

const HEADERS = {
  'apikey':        API_KEY,
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type':  'application/json',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function kb(b64len) { return Math.round(b64len * 0.75 / 1024); }

// ── REST helpers ──────────────────────────────────────────────────────────────

async function dbGet(path) {
  const r = await fetch(`${BASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function dbPatch(table, id, body) {
  const r = await fetch(`${BASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body:    JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${table}/${id} → ${r.status} ${await r.text()}`);
}

async function storageUpload(filePath, buffer, contentType) {
  const url = `${BASE_URL}/storage/v1/object/${BUCKET}/${filePath}`;
  const r = await fetch(url, {
    method:  'POST',
    headers: { 'apikey': API_KEY, 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body:    buffer,
  });
  if (!r.ok) throw new Error(`Storage upload → ${r.status} ${await r.text()}`);
}

function storagePublicUrl(filePath) {
  return `${BASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function migrate() {
  console.log('');
  console.log(DRY_RUN
    ? '🔍  DRY RUN — nenhuma alteração será feita. Use --execute para migrar.'
    : '🚀  EXECUTANDO migração real...');
  console.log('');

  // Conta total de linhas na gallery
  const r0 = await fetch(`${BASE_URL}/rest/v1/gallery?select=id`, {
    headers: { ...HEADERS, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
  });
  const contentRange = r0.headers.get('content-range') || '';
  const total = parseInt(contentRange.split('/')[1] || '0', 10);
  console.log(`📊  Total de linhas na gallery: ${total}`);

  let offset    = 0;
  let migrated  = 0;
  let already   = 0;  // já estão como URL
  let skipped   = 0;  // sem imagem ou formato inesperado
  let errors    = 0;
  let totalKb   = 0;

  while (offset < total) {
    const rows = await dbGet(
      `gallery?select=id,user_id,image&limit=${BATCH}&offset=${offset}&order=created_at.asc`
    );

    if (!rows?.length) break;

    for (const row of rows) {
      const { id, user_id, image } = row;

      // Sem imagem
      if (!image) { skipped++; continue; }

      // Já é URL (https://) — já migrada ou sem base64
      if (image.startsWith('http')) { already++; continue; }

      // Espera formato data:mime;base64,<dados>
      const match = image.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) {
        console.warn(`  ⚠️   ${id} — formato inesperado, pulando`);
        skipped++;
        continue;
      }

      const mimeType = match[1];
      const b64      = match[2];
      const sizeKb   = kb(b64.length);
      const ext      = mimeType.includes('png') ? 'png' : 'jpg';
      const uid      = user_id || 'sem-usuario';
      const filePath = `${uid}/${id}.${ext}`;
      const pubUrl   = storagePublicUrl(filePath);

      totalKb += sizeKb;

      if (DRY_RUN) {
        console.log(`  📁  ${id}  →  ${filePath}  (~${sizeKb}KB)`);
        migrated++;
        continue;
      }

      try {
        const buffer = Buffer.from(b64, 'base64');
        await storageUpload(filePath, buffer, mimeType);
        await dbPatch('gallery', id, { image: pubUrl });
        console.log(`  ✅  ${id}  →  ...${pubUrl.slice(-45)}`);
        migrated++;
      } catch (e) {
        console.error(`  ❌  ${id} — ${e.message}`);
        errors++;
      }
    }

    offset += BATCH;
    if (offset < total) await sleep(DELAY_MS);
  }

  const totalMb = (totalKb / 1024).toFixed(1);

  console.log('');
  console.log('══════════════════════════════════════════════════════');
  if (DRY_RUN) {
    console.log(`  A migrar       : ${migrated} imagens`);
    console.log(`  Já como URL    : ${already}`);
    console.log(`  Sem imagem     : ${skipped}`);
    console.log(`  Tamanho total  : ~${totalKb}KB  (~${totalMb}MB)`);
    console.log('');
    console.log('  Para executar:');
    console.log('  node scripts/migrate-gallery-images.js --execute');
  } else {
    console.log(`  Migrados       : ${migrated}`);
    console.log(`  Já como URL    : ${already}`);
    console.log(`  Pulados        : ${skipped}`);
    console.log(`  Erros          : ${errors}`);
  }
  console.log('══════════════════════════════════════════════════════');
  console.log('');
}

migrate()
  .then(() => process.exit(0))
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); });
