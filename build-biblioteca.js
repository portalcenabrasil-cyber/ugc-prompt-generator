/**
 * build-biblioteca.js — importa BIBLIOTECA PROMPTS → public/biblioteca-images/ + biblioteca/prompts.json
 * Executar uma vez: node build-biblioteca.js
 */
const fs = require('fs');
const path = require('path');

const SOURCE_BASE = 'C:/Users/phalm/Desktop/BIBLIOTECA PROMPTS';
const IMG_DEST_BASE = path.join(__dirname, 'public/biblioteca-images');
const JSON_DEST = path.join(__dirname, 'biblioteca/prompts.json');

const CATEGORIES = [
  { folder: 'INFLUENCER PODCAST',               slug: 'influencer-podcast', icone: '🎙️', label: 'Influencer Podcast' },
  { folder: 'MODELO HOT',                        slug: 'modelo-hot',         icone: '🔥', label: 'Modelo HOT' },
  { folder: 'PROMPTS COM IMAGENS INFLUENCER UGC',slug: 'influencer-ugc',     icone: '👤', label: 'Influencer UGC' },
  { folder: 'PROMPTS DE UGC ACADEMIA',           slug: 'academia',           icone: '💪', label: 'UGC Academia' },
  { folder: 'PROMPTS MULHER CORRIDA',            slug: 'corrida',            icone: '🏃‍♀️', label: 'Mulher Corrida' },
  { folder: 'UGC + PRODUTOS',                    slug: 'ugc-produtos',       icone: '🛒', label: 'UGC + Produtos' },
];

const IMAGE_EXTS = ['.jpeg', '.jpg', '.png', '.webp'];

const results = [];
let id = 1;
const report = { categories: {}, orphansNoTxt: [], orphansNoImg: [], total: 0 };

for (const cat of CATEGORIES) {
  const srcDir = path.join(SOURCE_BASE, cat.folder);
  const destDir = path.join(IMG_DEST_BASE, cat.slug);

  if (!fs.existsSync(srcDir)) { console.warn(`AVISO: pasta não encontrada: ${srcDir}`); continue; }

  const allFiles = fs.readdirSync(srcDir);
  const imgFiles = allFiles.filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()));
  const txtFiles = allFiles.filter(f => path.extname(f).toLowerCase() === '.txt');

  const imgMap = new Map();
  imgFiles.forEach(f => imgMap.set(path.basename(f, path.extname(f)).toLowerCase(), f));

  const txtMap = new Map();
  txtFiles.forEach(f => txtMap.set(path.basename(f, '.txt').toLowerCase(), f));

  let catCount = 0;
  report.categories[cat.folder] = { paired: 0, orphanImg: [], orphanTxt: [] };

  // Process pairs
  for (const [baseLower, imgFile] of imgMap.entries()) {
    if (txtMap.has(baseLower)) {
      const txtFile = txtMap.get(baseLower);
      const prompt = fs.readFileSync(path.join(srcDir, txtFile), 'utf8').trim();

      // Copy image
      const destFileName = imgFile;
      fs.copyFileSync(path.join(srcDir, imgFile), path.join(destDir, destFileName));

      results.push({
        id: String(id++),
        categoria: cat.label,
        categoria_original: cat.folder,
        categoria_slug: cat.slug,
        categoria_icone: cat.icone,
        imagem_path: `/biblioteca-images/${cat.slug}/${encodeURIComponent(destFileName)}`,
        nome_arquivo: path.basename(imgFile, path.extname(imgFile)),
        prompt: prompt,
        data_adicao: '2026-05-02'
      });
      catCount++;
      report.categories[cat.folder].paired++;
    } else {
      report.categories[cat.folder].orphanImg.push(imgFile);
      report.orphansNoTxt.push(`${cat.folder}/${imgFile}`);
    }
  }

  // Find orphan txt (no image)
  for (const [baseLower, txtFile] of txtMap.entries()) {
    if (!imgMap.has(baseLower)) {
      report.categories[cat.folder].orphanTxt.push(txtFile);
      report.orphansNoImg.push(`${cat.folder}/${txtFile}`);
    }
  }

  report.total += catCount;
  console.log(`✓ ${cat.folder}: ${catCount} pares importados`);
}

// Write JSON
fs.writeFileSync(JSON_DEST, JSON.stringify(results, null, 2), 'utf8');
console.log(`\n✅ prompts.json gerado com ${results.length} entradas`);
console.log('\n📊 RELATÓRIO:');
for (const [cat, info] of Object.entries(report.categories)) {
  console.log(`  ${cat}: ${info.paired} pareados`);
  if (info.orphanImg.length) console.log(`    ⚠️  Imagens sem .txt: ${info.orphanImg.join(', ')}`);
  if (info.orphanTxt.length) console.log(`    ⚠️  .txt sem imagem: ${info.orphanTxt.join(', ')}`);
}
console.log(`\nTOTAL: ${report.total} prompts importados`);
