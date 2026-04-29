/**
 * test-parse-fix.js — Valida o fix de safeParseJSON para o bug de truncamento
 *
 * Execução: node test-parse-fix.js
 * Não faz chamadas de API, não precisa de .env.
 */

'use strict';

// ── Copia exata da função safeParseJSON do server.js (VERSÃO NOVA com fix) ──
function safeParseJSON(str) {
  try { return JSON.parse(str); } catch (_) {}

  // Tentativa 2 com fix de aspas sem escape
  try {
    let out = '';
    let inStr = false;
    let esc = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      const code = str.charCodeAt(i);
      if (esc) { out += c; esc = false; continue; }
      if (c === '\\' && inStr) { out += c; esc = true; continue; }
      if (c === '"') {
        if (!inStr) {
          inStr = true; out += c; continue;
        }
        // Lookahead: distingue fechamento de aspas interior
        let j = i + 1;
        while (j < str.length && ' \t\r\n'.includes(str[j])) j++;
        const next = str[j] || '';
        if (next === ':' || next === ',' || next === '}' || next === ']' || next === '"') {
          inStr = false; out += c;
        } else {
          out += '\\"';
        }
        continue;
      }
      if (inStr && code < 0x20) {
        if      (c === '\n') out += '\\n';
        else if (c === '\r') out += '\\r';
        else if (c === '\t') out += '\\t';
        else out += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      out += c;
    }
    return JSON.parse(out);
  } catch (_) {}

  // Tentativa 3: regex
  const extractStr = (key) => {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"`, 's');
    const m = str.match(re);
    if (!m) return null;
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  };

  const result = {
    prompt_video: extractStr('prompt_video'),
    legenda:      extractStr('legenda'),
    nicho:        extractStr('nicho'),
    emocao:       extractStr('emocao'),
  };
  if (!result.prompt_video && !result.legenda) throw new Error('Não foi possível extrair dados da resposta da API');
  return result;
}

// ── Versão ANTIGA (bugada) para comparação ──
function safeParseJSONOLD(str) {
  try { return JSON.parse(str); } catch (_) {}
  try {
    let out = '';
    let inStr = false;
    let esc = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      const code = str.charCodeAt(i);
      if (esc) { out += c; esc = false; continue; }
      if (c === '\\' && inStr) { out += c; esc = true; continue; }
      if (c === '"') { inStr = !inStr; out += c; continue; }  // BUG: sempre alterna, sem lookahead
      if (inStr && code < 0x20) {
        if      (c === '\n') out += '\\n';
        else if (c === '\r') out += '\\r';
        else if (c === '\t') out += '\\t';
        else out += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      out += c;
    }
    return JSON.parse(out);
  } catch (_) {}

  const extractStr = (key) => {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"`, 's');
    const m = str.match(re);
    if (!m) return null;
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  };

  const result = {
    prompt_video: extractStr('prompt_video'),
    legenda: extractStr('legenda'),
    nicho: extractStr('nicho'),
    emocao: extractStr('emocao'),
  };
  if (!result.prompt_video && !result.legenda) throw new Error('Não foi possível extrair');
  return result;
}

// ── Helpers de teste ──
let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  const symbol = ok ? '✅' : '❌';
  console.log(`${symbol} ${label}`);
  if (!ok) {
    console.log(`   ESPERADO : "${expected ? expected.slice(0, 120) : expected}"`);
    console.log(`   RECEBIDO : "${actual   ? actual.slice(0, 120)   : actual}"`);
  }
  ok ? passed++ : failed++;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TESTES safeParseJSON — fix de aspas sem escape ═══\n');

// ── CASO 1: JSON perfeitamente válido (deve funcionar em ambas) ──
const caso1 = `{
  "prompt_video": "0-2s: Woman says hello. 4-6s: clean screen, no overlays, pure video frame only, 9:16 photorealistic",
  "legenda": "Produto incrível! #tiktokshop",
  "nicho": "Casa",
  "emocao": "surpresa"
}`;
const r1 = safeParseJSON(caso1);
check('CASO1: JSON válido → prompt_video completo', r1.prompt_video, '0-2s: Woman says hello. 4-6s: clean screen, no overlays, pure video frame only, 9:16 photorealistic');
check('CASO1: JSON válido → legenda', r1.legenda, 'Produto incrível! #tiktokshop');

// ── CASO 2: Aspas sem escape no diálogo — PADRÃO EXATO DO BUG ──
// Claude gera: "com tom de quem não aguenta mais: "Gente, como assim?!" ..."
// A aspas antes de "Gente" não está escapada no JSON, quebrando o parse.
const dialogoCompleto = `0-2s (HOOK): Mulher com expressão de choque, com tom de quem não aguenta mais: "Gente, como assim?!" — olhos arregalados, boca aberta. 2-4s: Pega o produto na mão — "Isso aqui resolveu tudo!" — mostra câmera. 4-6s: Aponta pra baixo — "Carrinho laranja AGORA!" — corre antes que esgota. [Technical Specs] Handheld shake, clean screen, no overlays, pure video frame only, 9:16 photorealistic`;

const caso2 = `{
  "prompt_video": "0-2s (HOOK): Mulher com expressão de choque, com tom de quem não aguenta mais: "Gente, como assim?!" — olhos arregalados, boca aberta. 2-4s: Pega o produto na mão — "Isso aqui resolveu tudo!" — mostra câmera. 4-6s: Aponta pra baixo — "Carrinho laranja AGORA!" — corre antes que esgota. [Technical Specs] Handheld shake, clean screen, no overlays, pure video frame only, 9:16 photorealistic",
  "legenda": "Não acredito que existe isso 😱 Carrinho laranja! #tiktokshop",
  "nicho": "Eletrônicos",
  "emocao": "choque"
}`;

const r2new = safeParseJSON(caso2);
let r2old;
try { r2old = safeParseJSONOLD(caso2); } catch { r2old = { prompt_video: null }; }

check('CASO2 (BUG): versão NOVA recupera prompt_video completo', r2new.prompt_video, dialogoCompleto);
check('CASO2 (BUG): versão NOVA termina com "9:16 photorealistic"', r2new.prompt_video?.endsWith('9:16 photorealistic') ? 'sim' : 'nao', 'sim');
check('CASO2 (BUG): versão ANTIGA trunca prompt_video', r2old.prompt_video?.includes('[Technical Specs]') ? 'completo' : 'truncado', 'truncado');

// ── CASO 3: Aspas no meio do hook (padrão do item #243 relatado) ──
const caso3 = `{"prompt_video": "0-2s (HOOK): Mulher entra na sala e grita com tom de quem não aguenta mais: "NÃO FUNCIONA NADA AQUI!" — a extensão de tomadas na mão, cara de raiva. 2-4s: Mostra a extensão — 6 tomadas, USB, protetor — "Mas esse aqui sim!". 4-6s: Aponta pra baixo — "Carrinho laranja antes que acaba!". [Technical Specs] clean screen, no overlays, pure video frame only, 9:16 photorealistic","legenda":"Chega de tomadas que não funcionam 😤 #tiktokshop","nicho":"Eletrônicos","emocao":"raiva"}`;

const r3new = safeParseJSON(caso3);
let r3old;
try { r3old = safeParseJSONOLD(caso3); } catch { r3old = { prompt_video: null }; }

const truncadoNaAspas3 = '0-2s (HOOK): Mulher entra na sala e grita com tom de quem não aguenta mais: ';
check('CASO3 (item #243 simulado): NOVA não trunca', r3new.prompt_video?.includes('[Technical Specs]') ? 'sim' : 'nao', 'sim');
check('CASO3 (item #243 simulado): NOVA tem "pure video frame only"', r3new.prompt_video?.includes('pure video frame only') ? 'sim' : 'nao', 'sim');
check('CASO3 (item #243 simulado): ANTIGA para em "mais: "', r3old.prompt_video?.trim(), truncadoNaAspas3.trim());

// ── CASO 4: JSON com newlines (chars de controle) ──
const caso4 = `{"prompt_video": "Hook: expressão genuína\nProduto: segura com cuidado\n4-6s: carrinho laranja, pure video frame only, 9:16 photorealistic","legenda":"#tiktok","nicho":"Casa","emocao":"alegria"}`;
const r4 = safeParseJSON(caso4);
check('CASO4: chars de controle (newline) → ainda recupera', r4.prompt_video?.includes('pure video frame only') ? 'sim' : 'nao', 'sim');

// ── CASO 5: JSON sem aspas sem escape (deve passar no attempt 1) ──
const caso5 = JSON.stringify({
  prompt_video: 'Linha 1: sem problemas. Linha 2: sem aspas duplas. clean screen, no overlays, pure video frame only, 9:16 photorealistic',
  legenda: 'Tudo bem! #tiktokshop',
  nicho: 'General',
  emocao: 'neutro'
});
const r5 = safeParseJSON(caso5);
check('CASO5: JSON correto (attempt 1) → completo', r5.prompt_video?.endsWith('9:16 photorealistic') ? 'sim' : 'nao', 'sim');

// ── CASO 6: Múltiplas aspas sem escape ──
const caso6 = `{"prompt_video": "0-2s: "Você já viu isso?" — mostra produto. 2-4s: "É incrível!" — zoom. 4-6s: "Vai lá!" — aponta. clean screen, pure video frame only, 9:16 photorealistic","legenda":"#shop","nicho":"Test","emocao":"x"}`;
const r6 = safeParseJSON(caso6);
check('CASO6: múltiplas aspas sem escape → recupera completo', r6.prompt_video?.includes('pure video frame only') ? 'sim' : 'nao', 'sim');

// ══════════════════════════════════════════════════════════════════
console.log(`\n═══ RESULTADO: ${passed} passaram, ${failed} falharam ═══\n`);

if (failed === 0) {
  console.log('✅ TODOS OS TESTES PASSARAM');
  console.log('   O fix de safeParseJSON está correto.');
  console.log('   O bug de truncamento (aspas sem escape no diálogo) está resolvido.\n');
} else {
  console.log('❌ ALGUNS TESTES FALHARAM — revisar a implementação\n');
  process.exit(1);
}
