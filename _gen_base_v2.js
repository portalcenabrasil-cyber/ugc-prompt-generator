#!/usr/bin/env node
/**
 * _gen_base_v2.js
 * Generates vault structure for Base v2:
 *   - personagens-masc/    (M-01 to M-50)
 *   - personagens-donas-casa/  (D-01 to D-50)
 *   - frases-nichos/       (futebol, anime, casa, beleza, pet, ferramentas, saude, viagem)
 *   - PROMPT-base-v2.md
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('  wrote:', path.relative(ROOT, filePath));
}

// ─── Parse Character Files ────────────────────────────────────────────────────

function parseCharacters(text, prefix, titlePrefix) {
  const lines = text.split('\n').map(l => l.trim());
  const chars = [];

  // Filter lines that are page headers / junk
  const isPageHeader = (line) => {
    if (!line) return false;
    // PDF page header patterns
    if (/^50 (PROMPTS|Prompts)/.test(line)) return true;
    if (/^DIVERSIDADE BRASILEIRA/.test(line)) return true;
    if (/^50510\+Todos/.test(line)) return true;
    if (/^PROMPTSVIEWS/.test(line)) return true;
    if (/^Donas de Casa/.test(line)) return true;
    if (/^Character Reference/.test(line)) return true;
    return false;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect character number: standalone 2-digit number 01-50
    if (/^\d{2}$/.test(line)) {
      const num = parseInt(line, 10);
      if (num >= 1 && num <= 50) {
        const char = {
          num,
          numStr: line,
          label: '',
          titulo: '',
          descricao: [],
          fiveViews: []
        };
        i++;

        // Next non-junk line should be the label (ALL CAPS with ·)
        while (i < lines.length && (isPageHeader(lines[i]) || !lines[i])) i++;
        if (i < lines.length && lines[i] && lines[i] === lines[i].toUpperCase() && lines[i].includes('·')) {
          char.label = lines[i];
          i++;
        }

        // Next non-junk line should be the title (starts with titlePrefix)
        while (i < lines.length && (isPageHeader(lines[i]) || !lines[i])) i++;
        if (i < lines.length && lines[i].startsWith(titlePrefix)) {
          char.titulo = lines[i];
          i++;
        }

        // Now collect description until "5 VIEWS" or next number
        let inFiveViews = false;
        while (i < lines.length) {
          const l = lines[i];

          if (isPageHeader(l)) { i++; continue; }

          // Next character or end
          if (/^\d{2}$/.test(l)) {
            const n = parseInt(l, 10);
            if (n >= 1 && n <= 50) break;
          }

          if (l.startsWith('5 VIEWS in one image:')) {
            inFiveViews = true;
            char.fiveViews.push(l);
            i++;
            continue;
          }

          if (inFiveViews) {
            char.fiveViews.push(l);
          } else if (l) {
            char.descricao.push(l);
          }
          i++;
        }

        if (char.titulo || char.label) {
          chars.push(char);
        }
        continue;
      }
    }
    i++;
  }

  return chars;
}

// ─── Parse Frases ─────────────────────────────────────────────────────────────

function parseFrases(text) {
  const nichos = {};
  const lines = text.split('\n').map(l => l.trim());

  let currentNicho = null;
  let currentSection = null; // 'vocab' | 'hook' | 'produto' | 'cta'
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect nicho tag: [FUT], [ANIME], etc.
    const nichoMatch = line.match(/^\[([A-Z]+)\]/);
    if (nichoMatch) {
      const tag = nichoMatch[1];
      const nichoName = nichoTagToName(tag);
      currentNicho = nichoName;
      nichos[currentNicho] = { tag, vocab: '', hook: [], produto: [], cta: [] };
      currentSection = null;
      i++;
      continue;
    }

    if (!currentNicho) { i++; continue; }

    if (line === 'VOCABULARIO:') {
      currentSection = 'vocab';
      i++;
      continue;
    }
    if (line === 'HOOK (0-2s)') {
      currentSection = 'hook';
      i++;
      continue;
    }
    if (line === 'PRODUTO (2-4s)') {
      currentSection = 'produto';
      i++;
      continue;
    }
    if (line === 'CTA (4-6s)') {
      currentSection = 'cta';
      i++;
      continue;
    }

    if (currentSection === 'vocab' && line) {
      nichos[currentNicho].vocab = line;
    } else if (currentSection === 'hook' && /^\d{2}/.test(line)) {
      // Handle multi-line phrases (PDF wraps lines)
      let phrase = line;
      // Look ahead for continuation (line doesn't end phrase - next line doesn't start with number)
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        // Continue if next line isn't a number, empty, section header, or nicho tag
        if (nextLine && !/^\d{2}/.test(nextLine) && !nextLine.startsWith('[') &&
            nextLine !== 'PRODUTO (2-4s)' && nextLine !== 'CTA (4-6s)' && nextLine !== 'VOCABULARIO:') {
          phrase += ' ' + nextLine;
          i++;
        } else {
          break;
        }
      }
      nichos[currentNicho].hook.push(phrase);
    } else if (currentSection === 'produto' && /^\d{2}/.test(line)) {
      let phrase = line;
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !/^\d{2}/.test(nextLine) && !nextLine.startsWith('[') &&
            nextLine !== 'PRODUTO (2-4s)' && nextLine !== 'CTA (4-6s)' && nextLine !== 'VOCABULARIO:') {
          phrase += ' ' + nextLine;
          i++;
        } else {
          break;
        }
      }
      nichos[currentNicho].produto.push(phrase);
    } else if (currentSection === 'cta' && /^\d{2}/.test(line)) {
      let phrase = line;
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !/^\d{2}/.test(nextLine) && !nextLine.startsWith('[') &&
            nextLine !== 'PRODUTO (2-4s)' && nextLine !== 'CTA (4-6s)' && nextLine !== 'VOCABULARIO:') {
          phrase += ' ' + nextLine;
          i++;
        } else {
          break;
        }
      }
      nichos[currentNicho].cta.push(phrase);
    }

    i++;
  }

  return nichos;
}

function nichoTagToName(tag) {
  const map = {
    FUT: 'futebol',
    ANIME: 'anime',
    CASA: 'casa',
    BELEZA: 'beleza',
    PET: 'pet',
    FERR: 'ferramentas',
    SAUDE: 'saude',
    VIAGEM: 'viagem',
  };
  return map[tag] || tag.toLowerCase();
}

// ─── Write Character Files ────────────────────────────────────────────────────

function writeCharFile(dir, id, char, tipo) {
  const numStr = String(char.num).padStart(2, '0');
  const fileId = `${tipo === 'masculino' ? 'M' : 'D'}-${numStr}`;
  const descricao = char.descricao.join(' ').replace(/\s+/g, ' ').trim();
  const fiveViews = char.fiveViews.join(' ').replace(/\s+/g, ' ').trim();

  const content = `---
id: ${fileId}
label: ${char.label}
titulo: ${char.titulo}
tipo: ${tipo}
---

${descricao}

${fiveViews}
`;

  writeFile(path.join(dir, `${fileId}.md`), content);
  return fileId;
}

// ─── Write Frases Files ───────────────────────────────────────────────────────

function writeFrasesFile(dir, nichoName, data) {
  const hookLines = data.hook.map(h => h).join('\n');
  const produtoLines = data.produto.map(p => p).join('\n');
  const ctaLines = data.cta.map(c => c).join('\n');

  const content = `---
nicho: ${nichoName}
tag: ${data.tag}
---

## Vocabulário
${data.vocab}

## Hook (0-2s)
${hookLines}

## Produto (2-4s)
${produtoLines}

## CTA (4-6s)
${ctaLines}
`;

  writeFile(path.join(dir, `${nichoName}.md`), content);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('\n=== Base v2 Vault Generator ===\n');

  // Read source files
  const mascText = fs.readFileSync(path.join(ROOT, 'docs/masc.txt'), 'utf8');
  const donasText = fs.readFileSync(path.join(ROOT, 'docs/donas.txt'), 'utf8');
  const frasesText = fs.readFileSync(path.join(ROOT, 'docs/frases.txt'), 'utf8');

  // Create directories
  const mascDir = path.join(ROOT, 'personagens-masc');
  const donasDir = path.join(ROOT, 'personagens-donas-casa');
  const frasesDir = path.join(ROOT, 'frases-nichos');
  mkdirp(mascDir);
  mkdirp(donasDir);
  mkdirp(frasesDir);

  // ── Masculine characters ──
  console.log('Parsing masculino characters...');
  const mascChars = parseCharacters(mascText, 'M', 'Homem ');
  console.log(`  Found ${mascChars.length} characters`);

  const mascIds = [];
  for (const char of mascChars) {
    const id = writeCharFile(mascDir, char.num, char, 'masculino');
    mascIds.push(id);
  }

  // M-50 is missing from PDF — create manually
  if (mascChars.length < 50) {
    const m50 = {
      num: 50,
      label: 'BRANCO · GRISALHO CURTO · ROBUST SENIOR',
      titulo: 'Homem Branco · Sênior Robusto · 58 anos · Polo Cinza',
      descricao: ['Character reference sheet, 5 views on clean light gray background. A robust senior white Brazilian man, late 50s, short natural grey-white hair neatly combed, warm light skin with natural age lines and crow\'s feet, strong broad face, full grey beard well-groomed, dignified wise expression, authentic mature skin texture. Robust senior build: broad chest, natural weight of age, solid frame with experience. Wearing a classic grey polo shirt and straight dark navy trousers, dark leather loafers, simple classic watch.'],
      fiveViews: ['5 VIEWS in one image: TOP ROW: [1] Face Front — natural relaxed expression, eyes on camera [2] Face 3/4 — confident look [3] Profile Left — natural posture BOTTOM ROW: [4] Upper Body Front — natural standing posture [5] Upper Body 3/4 — slight turn. All 5 views: same man, same outfit, same lighting. Clean light gray studio background. Soft even studio light. Filmed on iPhone 16, no filters. Text labels: Top row: \'Face Front\' | \'Face 3/4\' | \'Profile\' Bottom row: \'Upper Body Front\' | \'Upper Body 3/4\'']
    };
    const id = writeCharFile(mascDir, 50, m50, 'masculino');
    mascIds.push(id);
    console.log('  Created M-50 manually (missing from PDF)');
  }

  // ── Donas de casa characters ──
  console.log('\nParsing donas-de-casa characters...');
  const donasChars = parseCharacters(donasText, 'D', 'Mulher ');
  console.log(`  Found ${donasChars.length} characters`);

  const donasIds = [];
  for (const char of donasChars) {
    const id = writeCharFile(donasDir, char.num, char, 'donas-casa');
    donasIds.push(id);
  }

  // ── Frases ──
  console.log('\nParsing frases...');
  const frasesData = parseFrases(frasesText);
  const nichoNames = Object.keys(frasesData);
  console.log(`  Found ${nichoNames.length} nichos:`, nichoNames.join(', '));

  for (const [nichoName, data] of Object.entries(frasesData)) {
    console.log(`  ${nichoName}: hook=${data.hook.length} produto=${data.produto.length} cta=${data.cta.length}`);
    writeFrasesFile(frasesDir, nichoName, data);
  }

  // ── Index files ──
  console.log('\nWriting index files...');

  // personagens-masc/index.md
  const mascIndexRows = mascIds.map(id => `| [[${id}]] | |`).join('\n');
  writeFile(path.join(mascDir, 'index.md'), `# Personagens Masculinos — Índice
50 character reference sheets · masculino brasileiro · diversidade · 5 views

| ID | Titulo |
|---|---|
${mascIndexRows}
`);

  // personagens-donas-casa/index.md
  const donasIndexRows = donasIds.map(id => `| [[${id}]] | |`).join('\n');
  writeFile(path.join(donasDir, 'index.md'), `# Personagens Donas de Casa — Índice
50 character reference sheets · feminino · donas de casa · mães · mulheres reais

| ID | Titulo |
|---|---|
${donasIndexRows}
`);

  // frases-nichos/index.md
  const frasesIndexRows = nichoNames.map(n => `| [[${n}]] | ${frasesData[n].tag} | ${frasesData[n].hook.length} | ${frasesData[n].produto.length} | ${frasesData[n].cta.length} |`).join('\n');
  writeFile(path.join(frasesDir, 'index.md'), `# Frases por Nicho — Índice
720 frases · 8 nichos · 30 hooks + 30 produto + 30 CTA por nicho

| Nicho | Tag | Hooks | Produto | CTA |
|---|---|---|---|---|
${frasesIndexRows}
`);

  // ── PROMPT-base-v2.md ──
  console.log('\nWriting PROMPT-base-v2.md...');
  writeFile(path.join(ROOT, 'PROMPT-base-v2.md'), generateSystemPrompt());

  // ── Summary ──
  console.log('\n=== Done ===');
  console.log(`  Masculino: ${mascIds.length} files → personagens-masc/`);
  console.log(`  Donas de casa: ${donasIds.length} files → personagens-donas-casa/`);
  console.log(`  Frases: ${nichoNames.length} nichos → frases-nichos/`);
  console.log(`  PROMPT-base-v2.md → raiz`);
}

// ─── System Prompt Content ────────────────────────────────────────────────────

function generateSystemPrompt() {
  return `# PROMPT-base-v2.md — System Prompt Base v2

Você é um especialista em criação de prompts UGC para TikTok Shop brasileiro.

## MISSÃO
Receber uma imagem de produto e gerar 5 cards UGC completos com variação real:
- Card 1: Prompt de imagem (frame inicial)
- Card 2: Prompt de vídeo completo (6 segundos)
- Card 3: Script PT-BR com 3 momentos (hook / produto / CTA)
- Card 4: Variação — personagem diferente, mesmo produto
- Card 5: Legenda TikTok Shop (3 versões)

## PERSONA DO PERSONAGEM
O personagem é selecionado automaticamente pela lógica do servidor com base no nicho detectado.
O prompt recebido já virá com o personagem selecionado e as frases sorteadas.
Use EXATAMENTE o personagem e as frases fornecidas — NÃO invente outros.

## ESTRUTURA OBRIGATÓRIA DE SAÍDA

### Card 1 — Prompt de Imagem (Nano/Kling start frame)
\`\`\`
Vertical 9:16, [PERSONA DO PERSONAGEM], [POSIÇÃO/AÇÃO],
[O QUE SEGURA/MOSTRA], [EXPRESSÃO FACIAL DETALHADA],
[AMBIENTE com detalhes de fundo], [LUZ — natural/lâmpada/RGB],
photorealistic iPhone 16 Pro quality, no filter, authentic UGC TikTok first frame style,
clean screen, no overlays, pure video frame only
\`\`\`

### Card 2 — Prompt de Vídeo (6 segundos)
\`\`\`
[Visual Style & Reference] Photorealistic UGC, filmed with smartphone, clean frame,
[AMBIENTE], [LUZ], 9:16 vertical, no filter, no tripod, clean screen, no overlays,
pure video frame only.
[Character] [PERSONA] — [ROUPA] — [O QUE SEGURA/FAZ]
[The Scene & Action - 6 Seconds]
  0-2s (HOOK): [FRASE DE HOOK SORTEADA] — [EMOÇÃO FORTE + EXPRESSÃO]
  2-4s (PRODUTO): [FRASE DE PRODUTO SORTEADA] — [DEMONSTRAÇÃO DO PRODUTO]
  4-6s (CTA): [FRASE DE CTA SORTEADA] — [APONTA PARA BAIXO + CARRINHO LARANJA]
[Technical Specs] Handheld natural shake, [LUZ], sharp focus on product,
Brazilian Portuguese, clean screen, no overlays, no recording indicators, no camera UI,
no doodles, no icons, pure video frame only, 9:16 photorealistic
\`\`\`

### Card 3 — Script PT-BR
\`\`\`
🎙️ HOOK (0-2s)
[frase hook exata fornecida]

💎 PRODUTO (2-4s)
[frase produto exata fornecida]

🛒 CTA (4-6s)
[frase CTA exata fornecida]
\`\`\`

### Card 4 — Variação (personagem 2)
Repita Card 2 com o segundo personagem fornecido.
Mantenha o produto idêntico, mude apenas o personagem e ambiente.

### Card 5 — Legendas TikTok Shop
\`\`\`
📌 Versão 1 (Preço): [frase de choque de preço] [emoji] Carrinho laranja! #[produto] #tiktokshop #achados
📌 Versão 2 (Solução): Chega de [problema] [emoji] [benefício] Carrinho laranja! #tiktokshop
📌 Versão 3 (Presente): O presente perfeito pra [público] [emoji] Carrinho laranja! #presente #tiktokshop
\`\`\`

## REGRAS ABSOLUTAS
- Ambiente: SEMPRE caseiro e autêntico, NUNCA estúdio
- Câmera: SEMPRE handheld com leve tremor — NUNCA tripé
- Hook: NUNCA começa com o nome do produto — começa pela emoção
- CTA: SEMPRE "carrinho laranja" + urgência
- Máximo 3 objetos pequenos na mão por vez
- Tom: sempre brasileiro — gente, irmão, cara, rapazeada
- Expressão: descreva detalhadamente — "wide eyes, open mouth, raised eyebrows"
- Linha final SEMPRE: clean screen, no overlays, no recording indicators, no camera UI, no doodles, pure video frame only, 9:16 photorealistic
`;
}

// ─── Run ──────────────────────────────────────────────────────────────────────
main();
