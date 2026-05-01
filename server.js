require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Jimp = require('jimp');
const { createClient } = require('@supabase/supabase-js');

// ── Logging em arquivo para debug de batch ──
// Em produção serverless (Vercel Lambda), __dirname é read-only — usa /tmp.
// Em desenvolvimento local, usa logs/ na raiz do projeto.
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const LOGS_DIR  = IS_SERVERLESS ? '/tmp/ugc-logs' : path.join(__dirname, 'logs');
const BATCH_LOG = path.join(LOGS_DIR, 'batch-debug.log');
const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2 MB — trunca para evitar disco cheio
try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch { /* ignora se não puder criar */ }

function batchLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  try {
    // Rotação simples: se passou de 2 MB, recomeça do zero
    try {
      if (fs.statSync(BATCH_LOG).size > MAX_LOG_BYTES) fs.writeFileSync(BATCH_LOG, '');
    } catch { /* arquivo ainda não existe */ }
    fs.appendFileSync(BATCH_LOG, line);
  } catch { /* falha silenciosa — log em arquivo nunca trava o servidor */ }
}

// ── Supabase (inicializa só quando a URL for válida) ──
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function getSupabase() {
  if (!SUPABASE_URL.startsWith('http')) {
    throw new Error('Supabase não configurado. Adicione SUPABASE_URL e SUPABASE_SERVICE_KEY no .env');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}
const supabase = SUPABASE_URL.startsWith('http')
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-change-me';

// ── Email (opcional — configure EMAIL_USER + EMAIL_PASS no .env) ──
function getMailer() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

async function sendResetEmail(toEmail, resetLink) {
  const mailer = getMailer();
  if (!mailer) return false; // email não configurado, retorna false
  await mailer.sendMail({
    from: `"UGC·AI" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Redefinição de senha — UGC·AI',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#FF6B00">UGC·AI — Redefinir senha</h2>
        <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
        <a href="${resetLink}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:#FF6B00;color:white;text-decoration:none;border-radius:10px;font-weight:bold">Redefinir senha</a>
        <p style="color:#888;font-size:12px">Se você não solicitou isso, ignore este email.</p>
      </div>`
  });
  return true;
}

// ── Guard: rejeita se Supabase não estiver configurado ──
function requireSupabase(req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'Banco de dados não configurado. Adicione SUPABASE_URL e SUPABASE_SERVICE_KEY no .env e na Vercel.' });
  next();
}

// ── Auth Middleware ──
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autorizado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ── Server-side gallery save helper ──
async function _saveGalleryItem(userId, result, image_base64, image_type, price, tipo, style) {
  const isNanoVeo2      = style === 'nano-veo-2';
  const isRoupaFeminina = style === 'roupa-feminina-a' || style === 'roupa-feminina-b' || style === 'roupa-feminina-v2';
  const isBaseV2        = style === 'base-v2';
  if (!supabase || (!result?.prompt_video && !result?.character_sheet && !isNanoVeo2 && !isRoupaFeminina && !isBaseV2)) return null;

  // For serie/nano/nano-veo-2: assemble prompt_video from all cena fields
  let prompt_video = result.prompt_video || null;
  let legenda      = result.legenda      || null;
  let nicho        = result.nicho        || null;
  let emocao       = result.emocao       || null;

  if (isBaseV2) {
    const parts = [];
    if (result.card1_imagem)  parts.push(result.card1_imagem);
    if (result.card2_video)   parts.push(result.card2_video);
    if (result.card3_script) {
      const s = result.card3_script;
      const scriptText = [
        s.hook    ? `🎙️ HOOK\n${s.hook}`       : null,
        s.produto ? `💎 PRODUTO\n${s.produto}`  : null,
        s.cta     ? `🛒 CTA\n${s.cta}`          : null,
      ].filter(Boolean).join('\n\n');
      if (scriptText) parts.push(scriptText);
    }
    if (result.card4_variacao) parts.push(result.card4_variacao);
    if (result.card5_legendas) {
      const l = result.card5_legendas;
      const legendaText = [l.v1_preco, l.v2_solucao, l.v3_presente].filter(Boolean).join('\n');
      if (legendaText) parts.push(legendaText);
    }
    prompt_video = parts.join('\n\n---\n\n');
    legenda = '⚡ Base v2';
    nicho   = result._nicho || 'Base v2';
    emocao  = 'base-v2';
  } else if (isRoupaFeminina) {
    const parts = [];
    if (style === 'roupa-feminina-v2') {
      // v2: character_sheet vem de _character_sheet (lido do arquivo pelo servidor)
      const charSheet = result._character_sheet || result.character_sheet || '';
      if (charSheet) parts.push(charSheet);
      if (result.start_frame_prompt) parts.push(result.start_frame_prompt);
      if (result.prompt_kling_video) parts.push(result.prompt_kling_video);
      if (result.script) {
        const s = result.script;
        const scriptText = [
          s.hook      ? `🎙️ HOOK\n${s.hook}`           : null,
          s.beneficio ? `💎 BENEFÍCIO\n${s.beneficio}` : null,
          s.cta       ? `🛒 CTA\n${s.cta}`              : null
        ].filter(Boolean).join('\n\n');
        if (scriptText) parts.push(scriptText);
      }
      if (result.legenda_topo) parts.push(result.legenda_topo);
    } else {
      // roupa-feminina-a / roupa-feminina-b
      if (result.character_sheet)                       parts.push(result.character_sheet);
      if (result.start_frame_prompt)                    parts.push(result.start_frame_prompt);
      if (result.referencia_imagem?.descricao_completa) parts.push(result.referencia_imagem.descricao_completa);
      if (result.outfit_detectado)                      parts.push('OUTFIT: ' + result.outfit_detectado);
      if (result.script) {
        const s = result.script;
        const scriptText = [s.hook, s.beneficio, s.prova_social, s.cta].filter(Boolean).join('\n');
        if (scriptText) parts.push(scriptText);
      }
      if (result.cena_1_video_kling) parts.push(result.cena_1_video_kling);
      if (result.cena_2_video_kling) parts.push(result.cena_2_video_kling);
      if (result.cena_3_video_kling) parts.push(result.cena_3_video_kling);
      if (result.legenda_topo)       parts.push(result.legenda_topo);
    }
    prompt_video = parts.join('\n\n---\n\n');
    legenda = style === 'roupa-feminina-v2' ? '👗 Roupa Feminina v2'
            : style === 'roupa-feminina-a'  ? '👗 Roupa Feminina A'
            : '👗 Roupa Feminina + Modelo';
    nicho   = 'Roupa Feminina';
    emocao  = style;
  } else if (isNanoVeo2) {
    // Nano + Vídeos 2 — campos separados imagem/vídeo por cena
    const parts = [];
    if (result.character_sheet) parts.push(result.character_sheet);
    for (let i = 1; i <= 5; i++) {
      if (result[`cena_${i}_imagem`]) parts.push(result[`cena_${i}_imagem`]);
      if (result[`cena_${i}_video`])  parts.push(result[`cena_${i}_video`]);
    }
    if (result.ancora_fixa) parts.push(result.ancora_fixa);
    if (result.resumo)      parts.push(result.resumo);
    prompt_video = parts.join('\n\n---\n\n');
    legenda = '🧪 Nano + Vídeos 2';
    nicho   = 'Nano + Vídeos 2';
    emocao  = 'nano-veo-2';
  } else if (result.character_sheet) {
    const cenas = [result.cena_1, result.cena_2, result.cena_3, result.cena_4, result.cena_5].filter(Boolean);
    prompt_video = [result.character_sheet, ...cenas].join('\n\n---\n\n');
    const isNano = cenas.some(c => c && c.includes('NANO BANANA'));
    legenda = isNano ? '🎬 Edredom Nano + Vídeos' : '🛏️ Edredons Premium';
    nicho   = isNano ? 'Edredom Nano + Vídeos'   : 'Edredons Premium';
    emocao  = isNano ? 'nano'                      : 'serie';
  }

  // ── Crop automático + resize/compress — remove card e gera thumbnail leve ──
  let gallery_image_base64 = null;
  let gallery_image_type   = image_type || 'image/jpeg';
  if (image_base64) {
    const cropped = await cropImageBase64(image_base64, image_type || 'image/jpeg');
    gallery_image_base64 = cropped.base64;
    gallery_image_type   = cropped.mimeType;
  }

  const newItem = {
    id:           Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    user_id:      userId,
    created_at:   new Date().toISOString(),
    image:        gallery_image_base64 ? `data:${gallery_image_type};base64,${gallery_image_base64}` : null,
    prompt_video: prompt_video,
    legenda:      legenda,
    nicho:        nicho,
    emocao:       emocao,
    tipo:         tipo                || null,
    price:        price               || null,
    cost:         result._usage       || null,
  };
  try {
    const { data, error } = await supabase.from('gallery').insert(newItem).select().single();
    if (error) { console.error('Gallery save error:', error.message); return null; }
    return data;
  } catch (e) { console.error('[gallery] save exception:', e.message); return null; }
}

// ── Queue job status helper (graceful — silent if table doesn't exist) ──
async function _updateJobStatus(jobId, status, galleryId = null, errorMsg = null) {
  if (!supabase || !jobId) return;
  try {
    const upd = { status, updated_at: new Date().toISOString() };
    if (galleryId) upd.gallery_id = galleryId;
    if (errorMsg)  upd.error_msg  = errorMsg;
    await supabase.from('queue_jobs').update(upd).eq('id', jobId);
  } catch { /* queue_jobs table may not exist — silent fallback */ }
}

const app = express();
app.use(cors());
app.use((req, res, next) => { res.setHeader('bypass-tunnel-reminder', 'true'); next(); });
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PROMPT_FILE = path.join(__dirname, 'PROMPT.md');
const SYSTEM_PROMPT_BASE = fs.existsSync(PROMPT_FILE)
  ? fs.readFileSync(PROMPT_FILE, 'utf8')
  : `Você é um especialista em criação de UGC (User Generated Content) autêntico para TikTok Shop e Instagram Reels no mercado brasileiro.

═══════════════════════════════════
REGRAS FIXAS — NUNCA VIOLAR
═══════════════════════════════════

PERSONAGEM — VARIAR A CADA GERAÇÃO:
- NUNCA usa camiseta de time, de banda ou com estampa. Sempre t-shirt básica lisa (preta, branca ou cinza)
- Visual despojado, pessoa comum brasileira, não modelo
- Escolha UM arquétipo de personalidade diferente a cada vez (não repita o mesmo arquétipo seguido):
  • O ENTUSIASTA: energia alta, gesticula muito, mal consegue conter a empolgação
  • O DESCONFIADO CONVERTIDO: começou cético, foi surpreendido, conta como foi vencido pelo produto
  • O PAI/MÃO PRÁTICO: cansado, sem tempo, achou a solução que precisava sem enrolação
  • O ACHADOR: aquele que sempre descobre produto bom antes de todo mundo e adora contar
  • O CALMO CONVINCENTE: fala devagar, olha nos olhos, tom de quem já testou e confia de verdade
  • O IMPULSIVO: comprou sem pensar muito, se surpreendeu positivamente, conta no susto
  • O AMIGO HONESTO: fala direto, sem firula, como quem tá poupando o amigo de erro
- A personalidade deve estar visível na POSTURA, EXPRESSÃO e no TOM DA FALA descrito no prompt

HOOK (0-2s):
- NUNCA começa mostrando o produto diretamente
- SEMPRE começa pela emoção, dor ou situação relatable
- A câmera JÁ ABRE no momento de emoção — sem introdução
- Frases curtas, diretas, máximo 10 palavras, use reticências para suspense

CTA (call-to-action) — VARIAR A CADA GERAÇÃO:
- SEMPRE termina com referência ao carrinho laranja (TikTok Shop)
- SEMPRE adiciona urgência — escolha UMA frase diferente a cada vez, nunca repita a mesma em gerações seguidas:
  • "...clica no carrinho laranja, tá acabando!"
  • "...pega no carrinho antes que some!"
  • "...vai no carrinho laranja agora, não deixa passar!"
  • "...clica embaixo antes que esgota, sério!"
  • "...corre no carrinho laranja, vai acabar hoje!"
  • "...aperta o carrinho agora, tô falando sério!"
  • "...entra no carrinho laranja que tá saindo tudo!"
  • "...clica no carinho embaixo, não diz que não avisei!"
  • "...pega logo no carrinho, acabando rápido!"
  • "...bate no carrinho laranja agora, úlimas unidades!"
- O tom e a frase do CTA devem combinar com o arquétipo escolhido para o personagem

CENA:
- Máximo 3 objetos na mão por vez (evita bug de geração)
- Câmera SEMPRE handheld com leve tremor natural — NUNCA tripé
- Ambiente SEMPRE caseiro e autêntico: sala, cozinha, quarto, varanda
- NUNCA fundo neutro, NUNCA estúdio, NUNCA luz de ring light óbvia
- Fundo sempre levemente desfocado (bokeh), nunca compete com o produto

TOM DE VOZ — deve refletir o arquétipo escolhido:
- Brasileiro autêntico: gente, irmão, cara, rapazeada, mano, olha só, bicho, véi
- Informal, direto, como se estivesse mandando zap pro amigo
- Sem rebuscamento, sem inglês desnecessário
- O vocabulário e ritmo da fala variam conforme a personalidade (o calmo fala pausado, o entusiasta atropela as palavras)

ESTRUTURA OBRIGATÓRIA DO PROMPT_VIDEO (6 SEGUNDOS — 3 MOMENTOS):
[Visual Style & Reference] — ambiente caseiro, luz, estética, 9:16 vertical, no filter, no tripod, clean screen, no overlays, pure video frame only
[Character] — pessoa (idade, cabelo, roupa: t-shirt básica lisa), o que segura, energia
[The Scene & Action - 6 Seconds]
  0-2s (HOOK): emoção forte + frase de impacto — câmera abre no momento de emoção, produto ainda não é foco
  2-4s (PRODUTO): apresentação do produto + benefício principal + frase curta
  4-6s (CTA): aponta para baixo + carrinho laranja + urgência
[Technical Specs] — Handheld natural shake, sharp focus on product, Brazilian Portuguese, clean screen, no overlays, no recording indicators, no camera UI, no doodles, no icons, pure video frame only, 9:16 photorealistic

LINHA OBRIGATÓRIA NO FINAL DO PROMPT_VIDEO:
clean screen, no overlays, no recording indicators, no camera UI, no doodles, no annotations, no timer, no icons, no graphics on screen, pure video frame only, 9:16 photorealistic

REGRAS DA LEGENDA:
- Máximo ~150 caracteres
- Tom conversacional e emocional, como uma amiga mandando mensagem
- Exatamente 1 emoji integrado ao texto (não no final separado)
- Mencione preço ou urgência de forma natural
- No máximo 5 hashtags no final
- Exemplo de tom: "Amiga pelo amor compra logo antes que acabe 😭 essas toalhas são super macias e perfeitas pras fotinhas do bebê, baratinho demais ✨ corre no link #fyp #viral #tiktokshop #decoracao #achadinhos"

═══════════════════════════════════
OUTPUT OBRIGATÓRIO
═══════════════════════════════════

Retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois:

{
  "prompt_video": "Prompt completo de 6 segundos com 3 momentos. Use exatamente as seções: [Visual Style & Reference] / [Character] / [The Scene & Action - 6 Seconds] com sub-seções 0-2s (HOOK) / 2-4s (PRODUTO) / 4-6s (CTA) / [Technical Specs]. Cada seção em parágrafo separado. Terminar com a linha obrigatória de clean screen.",
  "legenda": "Legenda única com ~150 caracteres máximo. Tom conversacional/emocional, 1 emoji integrado, preço ou urgência mencionados naturalmente, máximo 5 hashtags no final.",
  "nicho": "Nicho de mercado identificado (ex: beleza feminina, fitness masculino, casa e decoração, pet lovers, etc.)",
  "emocao": "Principal emoção que o produto evoca (ex: alívio, empolgação, nostalgia, confiança, pertencimento, etc.)"
}`;

// Keep SYSTEM_PROMPT as alias for compatibility
const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE;

// Loads the system prompt for a given style.
// style='base' → PROMPT.md (or hardcoded fallback)
// style='cinematografico' → PROMPT-cinematografico.md (or falls back to base)
function loadSystemPrompt(style) {
  if (style && style !== 'base') {
    // roupa-feminina-a e roupa-feminina-b usam o mesmo arquivo de sistema
    const styleKey = (style === 'roupa-feminina-a' || style === 'roupa-feminina-b') ? 'roupa-feminina'
                   : style === 'roupa-feminina-v2' ? 'roupa-feminina-v2'
                   : style;
    const styleFile = path.join(__dirname, `PROMPT-${styleKey}.md`);
    if (fs.existsSync(styleFile)) return fs.readFileSync(styleFile, 'utf8');
  }
  return SYSTEM_PROMPT_BASE;
}

function buildUserMessage(tipo, promo, price, gender, duracao) {
  const tipoLabels = {
    caseiro:  'Caseiro (ambiente doméstico, cotidiano real)',
    fabrica:  'Fábrica / Bastidores (mostra processo de produção)',
    pov:      'POV (ponto de vista em primeira pessoa)',
    unboxing: 'Unboxing (abrindo o produto pela primeira vez)'
  };
  const promoLabels = {
    relampago: 'Promoção Relâmpago (urgência máxima, tempo limitado)',
    pascoa:    'Páscoa (temática de presente e celebração)',
    off:       'Desconto OFF (foco no percentual de desconto)',
    sem_promo: 'Sem promoção (foco em valor percebido, não em preço)'
  };
  const genderLabels = {
    masculino: 'Masculino',
    feminino:  'Feminino',
    neutro:    'Neutro / qualquer um'
  };

  const precoInfo = price
    ? `- Preço do produto: R$ ${price} — use esse valor para criar ancoragem de preço e senso de urgência na legenda e no CTA`
    : `- Preço: não informado — gere normalmente sem mencionar valor`;

  const duracaoInfo = duracao
    ? `- Duração selecionada: ${duracao}s — use EXATAMENTE esta opção do Passo 4, sem variação`
    : '';

  return `Analise a imagem do produto e gere conteúdo UGC para o mercado brasileiro.

CONFIGURAÇÕES:
- Tipo de vídeo: ${tipoLabels[tipo] || tipo}
- Promoção ativa: ${promoLabels[promo] || promo}
${precoInfo}
- Gênero do criador: ${genderLabels[gender] || gender}
${duracaoInfo}

Retorne apenas o JSON, sem texto adicional.`;
}

// claude-haiku-4-5-20251001 pricing (per million tokens, USD)
const PRICE_INPUT_PER_M  = 0.80;
const PRICE_OUTPUT_PER_M = 4.00;

// Session accumulator (resets on server restart)
let sessionTokens = { input: 0, output: 0 };

function calcCost(inputTokens, outputTokens) {
  const inputCost  = (inputTokens  / 1_000_000) * PRICE_INPUT_PER_M;
  const outputCost = (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

// ── Detecção de card de marketplace ──
// Método 1: contraste de brilho (fundo colorido vs card claro)
// Método 2: densidade de bordas por linha (texto do card cria muitas transições)
async function detectCardBoundary(img) {
  const w = img.getWidth();
  const h = img.getHeight();
  const xStep = Math.max(1, Math.floor(w / 100));

  // Brilho médio de uma linha
  const rowBrightness = (y) => {
    let sum = 0, n = 0;
    for (let x = 0; x < w; x += xStep) {
      const { r, g, b } = Jimp.intToRGBA(img.getPixelColor(x, y));
      sum += (r + g + b) / 3; n++;
    }
    return sum / n;
  };

  // Densidade de bordas de uma linha (transições bruscas = texto/UI)
  const rowEdges = (y) => {
    let edges = 0, prev = null;
    for (let x = 0; x < w; x += xStep) {
      const { r, g, b } = Jimp.intToRGBA(img.getPixelColor(x, y));
      const brightness = (r + g + b) / 3;
      if (prev !== null && Math.abs(brightness - prev) > 25) edges++;
      prev = brightness;
    }
    return edges / (w / xStep); // proporção de transições (0–1)
  };

  // Brilho médio de zona
  const zoneAvg = (yFrom, yTo) => {
    let sum = 0, n = 0;
    for (let y = yFrom; y < yTo; y++) { sum += rowBrightness(y); n++; }
    return sum / n;
  };

  const cardRef  = zoneAvg(Math.floor(h * 0.88), h);
  const photoRef = zoneAvg(Math.floor(h * 0.40), Math.floor(h * 0.70));
  const diff = Math.abs(cardRef - photoRef);
  console.log(`[autoCrop] cardRef=${cardRef.toFixed(1)} photoRef=${photoRef.toFixed(1)} diff=${diff.toFixed(1)}`);

  // ── Método 1: contraste de brilho (para fundos coloridos) ──
  if (diff >= 22) {
    const threshold = (cardRef + photoRef) / 2;
    const cardIsBrighter = cardRef > photoRef;
    const REQUIRED = 20;
    let consecutive = 0, firstNonCard = null, cutY = null;

    for (let y = h - 1; y >= Math.floor(h * 0.50); y--) {
      const avg = rowBrightness(y);
      const isCard = cardIsBrighter ? avg >= threshold : avg <= threshold;
      if (!isCard) {
        if (!firstNonCard) firstNonCard = y;
        if (++consecutive >= REQUIRED) { cutY = firstNonCard; break; }
      } else { consecutive = 0; firstNonCard = null; }
    }

    // Só aceita se cortou mais de 10% — senão é falso positivo, cai no método 2
    if (cutY && cutY < h * 0.90) {
      console.log(`[autoCrop] método1 (brilho) borda y=${cutY} (${Math.round(cutY/h*100)}%)`);
      return cutY;
    }
    if (cutY) console.log(`[autoCrop] método1 retornou ${Math.round(cutY/h*100)}% — improvável, tentando método2`);
  }

  // ── Método 2: densidade de bordas (para fundos brancos / baixo contraste) ──
  // O card de marketplace tem texto que cria muitas transições por linha.
  // Foto com fundo branco limpo tem poucas transições. Procura cluster de texto no fundo.
  const EDGE_THRESHOLD = 0.12; // 12% das amostragens são bordas = linha com texto
  const WINDOW = 30;           // janela de busca (linhas)
  const MIN_TEXT_ROWS = 5;     // mínimo de linhas-texto no cluster

  // Calcula densidade de bordas para o terço inferior da imagem
  const searchFrom = Math.floor(h * 0.60);
  const edgeMap = [];
  for (let y = searchFrom; y < h; y++) {
    edgeMap.push({ y, e: rowEdges(y) });
  }

  // Desliza janela de cima para baixo: encontra o cluster de texto mais próximo do topo
  let topCluster = null;
  for (let i = 0; i <= edgeMap.length - WINDOW; i++) {
    const window = edgeMap.slice(i, i + WINDOW);
    const textRows = window.filter(r => r.e >= EDGE_THRESHOLD).length;
    if (textRows >= MIN_TEXT_ROWS) {
      topCluster = window[0].y; // y mais alto do cluster = borda do card
      break;
    }
  }

  if (topCluster) {
    console.log(`[autoCrop] método2 (bordas) cluster y=${topCluster} (${Math.round(topCluster/h*100)}%)`);
    return topCluster;
  }

  console.log('[autoCrop] sem card detectado — imagem mantida');
  return null;
}

// ── Crop automático do produto + resize/compress para thumbnail de galeria ──
// Retorna { base64, mimeType } — sempre JPEG ~600px para manter galeria leve.
async function cropImageBase64(base64, mimeType) {
  const THUMB_W    = 600;  // largura máxima do thumbnail
  const JPEG_QUAL  = 82;   // qualidade JPEG (0-100)

  try {
    const buffer = Buffer.from(base64, 'base64');
    const img = await Jimp.read(buffer);
    const w = img.getWidth();
    const h = img.getHeight();

    const cutY = await detectCardBoundary(img);
    if (cutY) {
      // Proteção: preserva no mínimo 60% da imagem
      const finalCutY = Math.max(Math.floor(h * 0.60), cutY);
      img.crop(0, 0, w, finalCutY);
      console.log(`[autoCrop] cortado em y=${finalCutY}/${h} (${Math.round(finalCutY/h*100)}%)`);
    } else {
      console.log('[autoCrop] nenhum card detectado — imagem original mantida');
    }

    // Redimensiona para no máximo THUMB_W de largura (mantém proporção)
    if (img.getWidth() > THUMB_W) {
      img.resize(THUMB_W, Jimp.AUTO);
    }

    // Comprime como JPEG para manter galeria leve
    img.quality(JPEG_QUAL);
    const out = await img.getBufferAsync(Jimp.MIME_JPEG);
    console.log(`[autoCrop] thumb ${img.getWidth()}x${img.getHeight()} ~${Math.round(out.length/1024)}KB`);
    return { base64: out.toString('base64'), mimeType: 'image/jpeg' };
  } catch (err) {
    console.warn('[autoCrop] falha, mantendo original:', err.message);
    return { base64, mimeType: mimeType || 'image/jpeg' };
  }
}

// Parseia JSON tolerando chars de controle e aspas sem escape dentro de strings (Claude às vezes os gera)
function safeParseJSON(str) {
  // Tentativa 1: JSON.parse direto
  try { return JSON.parse(str); } catch (_) {}

  // Tentativa 2: corrige chars de controle (0x00–0x1F) E aspas duplas sem escape dentro de valores.
  //
  // BUG ORIGINAL: quando inStr=true e aparecia '"', o código sempre alternava inStr para false,
  // tratando TODA aspas como fechamento de string. Isso fazia o parser dessincronizar quando Claude
  // gerava diálogos com aspas literais (ex: mais: "Gente!"), corrompendo o JSON e fazendo o
  // fallback para a tentativa 3, que capturava apenas o trecho antes da primeira aspas — causando
  // truncamento do prompt_video.
  //
  // FIX: lookahead — ao encontrar '"' dentro de string, verifica o próximo char significativo.
  // Se for char estrutural JSON (:  , } ] "), é fechamento legítimo. Caso contrário, é aspas
  // interior sem escape — escapa como \" e permanece dentro da string.
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
        // Dentro de string: lookahead para distinguir fechamento de aspas interior
        let j = i + 1;
        while (j < str.length && ' \t\r\n'.includes(str[j])) j++;
        const next = str[j] || '';
        if (next === ':' || next === ',' || next === '}' || next === ']' || next === '"') {
          // Char estrutural do JSON → fechamento legítimo da string
          inStr = false; out += c;
        } else {
          // Char não-estrutural → aspas interior sem escape → escapa e permanece na string
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

  // Tentativa 3: extração campo a campo por regex (fallback para JSON muito quebrado)
  const extractStr = (key) => {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"`, 's');
    const m = str.match(re);
    if (!m) return null;
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  };
  const extractNum = (key) => {
    const re = new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`);
    const m = str.match(re);
    return m ? parseFloat(m[1]) : null;
  };

  batchLog('[safeParseJSON] FALLBACK tentativa 3 — JSON muito quebrado, extração por regex');

  const result = {
    prompt_video: extractStr('prompt_video'),
    legenda:      extractStr('legenda'),
    nicho:        extractStr('nicho'),
    emocao:       extractStr('emocao'),
  };

  if (!result.prompt_video && !result.legenda) {
    throw new Error('Não foi possível extrair dados da resposta da API');
  }
  return result;
}

// ── Helpers para Roupa Feminina v2 ──

// Parseia o "Bloco curto" de um .md de personagem
function parseCharBlock(mdContent) {
  const match = mdContent.match(/##\s+Bloco curto[^\n]*\n+([^#]+)/i);
  if (!match) return null;
  return match[1].trim();
}

// Parseia o character sheet completo (tudo entre o título e o Bloco curto)
function parseCharSheet(mdContent) {
  const match = mdContent.match(/^#\s+Character Sheet[^\n]*\n+([\s\S]+?)(?=\n##\s)/m);
  if (!match) return null;
  return match[1].trim();
}

// Parseia frontmatter YAML simples + corpo de um .md de cenário
function parseCenarioMd(mdContent) {
  const frontmatter = {};
  const fmMatch = mdContent.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    fmMatch[1].split('\n').forEach(line => {
      const [k, ...v] = line.split(':');
      if (k && v.length) frontmatter[k.trim()] = v.join(':').trim().replace(/^"|"$/g, '');
    });
  }
  const bgMatch     = mdContent.match(/##\s+Background\n+([\s\S]+?)(?=\n##\s|$)/);
  const gestureMatch = mdContent.match(/##\s+Gesture\n+([\s\S]+?)(?=\n##\s|$)/);
  return {
    id:         frontmatter.id         || '',
    nome:       frontmatter.nome       || '',
    tipo:       frontmatter.tipo       || 'video',
    icone:      frontmatter.icone      || '',
    camera:     frontmatter.camera     || '',
    shot_frame: frontmatter.shot_frame || '',
    bg_desc:    bgMatch     ? bgMatch[1].trim()     : '',
    gesture_desc: gestureMatch ? gestureMatch[1].trim() : '',
  };
}

// Encontra o arquivo de personagem pelo ID (ex: "CH-01") — busca no diretório personagens/
function findCharFile(personagem_id) {
  const dir = path.join(__dirname, 'personagens');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const prefix = personagem_id.toUpperCase() + '-';
  const found = files.find(f => f.startsWith(prefix) && f.endsWith('.md'));
  return found ? path.join(dir, found) : null;
}

// Encontra o arquivo de cenário pelo ID (ex: "A" ou "B") — busca no diretório cenarios/
function findCenarioFile(cenario_id) {
  const dir = path.join(__dirname, 'cenarios');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const prefix = cenario_id.toUpperCase() + '-';
  const found = files.find(f => f.startsWith(prefix) && f.endsWith('.md'));
  return found ? path.join(dir, found) : null;
}

// ── Weighted random helper ──
function weightedRandom(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) { r -= item.weight; if (r <= 0) return item.val; }
  return items[items.length - 1].val;
}

// ── Gera seed aleatório de modelo para Roupa Feminina A ──
function generatePersonagemSeed() {
  return {
    pele: weightedRandom([
      { val: 'morena clara — warm medium-light brown skin with golden undertones', weight: 4 },
      { val: 'morena média — warm medium brown skin, golden brown complexion', weight: 3 },
      { val: 'pele clara quente — light skin with warm undertones, light ivory golden undertones', weight: 2 },
      { val: 'morena escura — warm dark brown skin', weight: 0.5 },
      { val: 'negra — deep rich brown skin with warm undertones', weight: 0.5 },
    ]),
    cabelo: weightedRandom([
      { val: 'straight dark brown shoulder-length bob, sleek natural movement, slight inward curve at ends', weight: 1 },
      { val: 'long straight dark brown hair falling past shoulders, natural shine', weight: 1 },
      { val: 'long wavy dark brown hair with subtle highlights, voluminous natural texture, lived-in', weight: 1 },
      { val: 'long wavy honey blonde hair with sun-kissed highlights, natural movement', weight: 1 },
      { val: 'straight golden blonde hair past shoulders, natural highlights, slight wave at ends', weight: 1 },
      { val: 'natural curly dark hair, loose spiral curls, voluminous authentic texture', weight: 1 },
      { val: 'natural wavy curly medium brown hair, loose curls, down', weight: 1 },
      { val: 'long straight black hair sleek shine', weight: 1 },
    ]),
    idade: weightedRandom([
      { val: 'mid 20s', weight: 5 },
      { val: 'early 20s', weight: 3 },
      { val: 'late 20s to early 30s', weight: 2 },
    ]),
    corpo: weightedRandom([
      { val: 'naturally full figure: full bust, defined waist, natural hips — authentic Brazilian body proportions', weight: 4 },
      { val: 'slim toned body, defined shoulders, flat stomach, athletic natural posture', weight: 3.5 },
      { val: 'athletic toned body, defined arms and shoulders, slim waist, fit natural posture', weight: 2.5 },
    ]),
    oculos: Math.random() > 0.7 ? 'round thick black frame glasses' : 'no glasses',
    joia: Math.random() > 0.3 ? weightedRandom([
      { val: 'delicate gold chain necklace', weight: 3 },
      { val: 'delicate gold hoop earrings', weight: 2 },
      { val: 'simple gold pendant necklace', weight: 1 },
    ]) : 'no jewelry',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Base v2 — Biblioteca de 150 personagens + 720 frases
// ─────────────────────────────────────────────────────────────────────────────

const NICHOS_V2 = {
  futebol:     { pools: ['masculino'],                            frasesFile: 'futebol'     },
  anime:       { pools: ['masculino', 'donas-casa'],              frasesFile: 'anime'       },
  casa:        { pools: ['donas-casa'],                           frasesFile: 'casa'        },
  beleza:      { pools: ['donas-casa'],                           frasesFile: 'beleza'      },
  pet:         { pools: ['donas-casa', 'masculino'],              frasesFile: 'pet'         },
  ferramentas: { pools: ['masculino'],                            frasesFile: 'ferramentas' },
  saude:       { pools: ['masculino', 'donas-casa'],              frasesFile: 'saude'       },
  viagem:      { pools: ['masculino', 'donas-casa'],              frasesFile: 'viagem'      },
  generico:    { pools: ['masculino', 'donas-casa'],              frasesFile: 'casa'        },
};

// Read all character IDs from a pool directory
function listPoolIds(pool) {
  const dirMap = {
    'masculino':  path.join(__dirname, 'personagens-masc'),
    'donas-casa': path.join(__dirname, 'personagens-donas-casa'),
    'curvy-fit':  path.join(__dirname, 'personagens'),
  };
  const dir = dirMap[pool];
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')
    .map(f => ({ pool, id: f.replace('.md', ''), file: path.join(dir, f) }));
}

// Read the full content of a character file (returns raw text)
function readCharacterContent(entry) {
  try { return fs.readFileSync(entry.file, 'utf8'); } catch { return ''; }
}

// Pick N distinct random items from an array (no repeats)
function pickRandom(arr, n, excludeIds = []) {
  const pool = arr.filter(x => !excludeIds.includes(x.id));
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// Load frases for a nicho — returns { hook: string[], produto: string[], cta: string[] }
const _frasesCache = {};
function loadFrasesNicho(nichoName) {
  if (_frasesCache[nichoName]) return _frasesCache[nichoName];
  const file = path.join(__dirname, 'frases-nichos', `${nichoName}.md`);
  if (!fs.existsSync(file)) return { hook: [], produto: [], cta: [] };
  const text = fs.readFileSync(file, 'utf8');

  const extract = (section) => {
    const match = text.match(new RegExp(`## ${section}[^\\n]*\\n([\\s\\S]+?)(?=\\n##|$)`, 'i'));
    if (!match) return [];
    return match[1].trim().split('\n')
      .filter(l => /^\d{2}/.test(l.trim()))
      .map(l => l.trim().replace(/^\d{2}\s*/, '').trim());
  };

  const result = {
    hook:    extract('Hook'),
    produto: extract('Produto'),
    cta:     extract('CTA'),
  };
  _frasesCache[nichoName] = result;
  return result;
}

// Pick one random phrase from each section, excluding history
function sortearFrases(nichoName, historyHooks = [], historyProds = [], historyCtas = []) {
  const { hook, produto, cta } = loadFrasesNicho(nichoName);
  const pick = (arr, excl) => {
    const avail = arr.filter(x => !excl.includes(x));
    const pool = avail.length > 0 ? avail : arr;
    return pool[Math.floor(Math.random() * pool.length)] || '';
  };
  return {
    hook:    pick(hook,    historyHooks),
    produto: pick(produto, historyProds),
    cta:     pick(cta,     historyCtas),
  };
}

async function callClaudeBaseV2(image_base64, image_type, price, extras_v2) {
  const { nicho, chars, frases } = extras_v2;

  const [char1, char2] = chars;
  const c1 = readCharacterContent(char1);
  const c2 = char2 ? readCharacterContent(char2) : null;

  const systemPrompt = loadSystemPrompt('base-v2');

  const userText = `Produto recebido. Gere 5 cards UGC completos para TikTok Shop brasileiro.

NICHO DETECTADO: ${nicho}

PERSONAGEM PRINCIPAL:
${c1}

PERSONAGEM VARIAÇÃO:
${c2 || '(usar outro ângulo do mesmo personagem)'}

FRASES SORTEADAS PARA ESTE NICHO (USE EXATAMENTE ESTAS):
- HOOK: ${frases.hook}
- PRODUTO: ${frases.produto}
- CTA: ${frases.cta}

${price ? `PREÇO DO PRODUTO: R$ ${price}` : ''}

Retorne apenas JSON com esta estrutura:
{
  "nicho_detectado": "${nicho}",
  "char1_id": "${char1.id}",
  "char2_id": "${char2 ? char2.id : ''}",
  "card1_imagem": "...",
  "card2_video": "...",
  "card3_script": { "hook": "...", "produto": "...", "cta": "..." },
  "card4_variacao": "...",
  "card5_legendas": { "v1_preco": "...", "v2_solucao": "...", "v3_presente": "..." }
}`;

  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': (process.env.ANTHROPIC_API_KEY || '').trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image_type || 'image/jpeg', data: image_base64 } },
            { type: 'text',  text: userText }
          ]
        }]
      })
    });

    const data = await response.json();
    if (response.status === 529 || (response.status >= 500 && attempt < MAX_RETRIES - 1)) {
      lastError = new Error(data.error?.message || 'Servidor sobrecarregado'); continue;
    }
    if (!response.ok) throw new Error(data.error?.message || 'Erro na API Claude');

    const stopReason = data.stop_reason || 'unknown';
    const inputTokens  = data.usage?.input_tokens  || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    batchLog(`[callClaudeBaseV2] attempt=${attempt} stop_reason=${stopReason} input=${inputTokens} output=${outputTokens}`);

    if (stopReason === 'max_tokens') {
      lastError = new Error('Resposta truncada (max_tokens)'); continue;
    }

    const rawText = data.content[0].text.trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta inesperada da API');

    sessionTokens.input  += inputTokens;
    sessionTokens.output += outputTokens;
    const { inputCost, outputCost, totalCost } = calcCost(inputTokens, outputTokens);
    const sessionCost = calcCost(sessionTokens.input, sessionTokens.output);

    return {
      ...safeParseJSON(jsonMatch[0]),
      _nicho:   nicho,
      _char1:   char1.id,
      _char2:   char2 ? char2.id : null,
      _frases:  frases,
      _usage: { input_tokens: inputTokens, output_tokens: outputTokens, input_cost: inputCost, output_cost: outputCost, total_cost: totalCost, session: { input_tokens: sessionTokens.input, output_tokens: sessionTokens.output, total_cost: sessionCost.totalCost } }
    };
  }
  throw lastError || new Error('Servidor sobrecarregado. Tente novamente.');
}

// Detect nicho from product image using Claude (fast, no system prompt)
async function detectarNicho(image_base64, image_type) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': (process.env.ANTHROPIC_API_KEY || '').trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image_type || 'image/jpeg', data: image_base64 } },
          { type: 'text',  text: 'Classifique este produto em exatamente um nicho. Responda APENAS com uma das palavras: futebol, anime, casa, beleza, pet, ferramentas, saude, viagem, generico' }
        ]
      }]
    })
  });
  const data = await response.json();
  if (!response.ok) return 'generico';
  const raw = (data.content?.[0]?.text || '').trim().toLowerCase();
  const valid = ['futebol','anime','casa','beleza','pet','ferramentas','saude','viagem','generico'];
  return valid.find(n => raw.includes(n)) || 'generico';
}

// ─────────────────────────────────────────────────────────────────────────────

async function callClaude(image_base64, image_type, tipo, promo, price, gender, style = 'base', duracao = null, image_base64_2 = null, image_type_2 = null, extras = null) {
  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
      await new Promise(r => setTimeout(r, delay));
    }

    const maxTokens = (style === 'nano-veo-2' || style === 'roupa-feminina-a' || style === 'roupa-feminina-b' || style === 'roupa-feminina-v2')
      ? 8192
      : (style === 'nano' ? 8192 : 4096);

    // Build user message content based on style
    let userContent;
    if (style === 'roupa-feminina-a') {
      const seed = generatePersonagemSeed();
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: image_type || 'image/jpeg', data: image_base64 } },
        { type: 'text',  text: `GERAR EM MODO A. USE OBRIGATORIAMENTE ESTAS CARACTERÍSTICAS DE MODELO (pré-sorteadas pelo servidor para garantir variação):
- Tom de pele: ${seed.pele}
- Cabelo: ${seed.cabelo}
- Idade aparente: ${seed.idade}
- Corpo: ${seed.corpo}
- Óculos: ${seed.oculos}
- Joia: ${seed.joia}

NÃO IGNORE essas características. NÃO substitua por "média estatística". Use EXATAMENTE essas no character_sheet, no start_frame_prompt e nas 3 cenas.

Analise a imagem da roupa e retorne o JSON completo com character_sheet + start_frame_prompt + personagem + cenario + script + cena_1_video_kling + cena_2_video_kling + cena_3_video_kling + legenda_topo. Retorne apenas o JSON, sem texto adicional.` }
      ];
    } else if (style === 'roupa-feminina-b') {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: image_type  || 'image/jpeg', data: image_base64 } },
        { type: 'image', source: { type: 'base64', media_type: image_type_2 || 'image/jpeg', data: image_base64_2 } },
        { type: 'text',  text: 'Modo B — usar modelo de referência da segunda imagem. A primeira imagem é a roupa do produto. A segunda imagem é a modelo de referência (character sheet 5 views). Extraia as características da modelo da segunda imagem e gere o JSON completo com referencia_imagem + start_frame_prompt + cenario + script + cena_1_video_kling + cena_2_video_kling + cena_3_video_kling + legenda_topo. Retorne apenas o JSON, sem texto adicional.' }
      ];
    } else if (style === 'roupa-feminina-v2') {
      const { character_block, cenario, modo } = extras || {};
      let userText;
      if (modo === 'ugc-da-137' && image_base64_2) {
        // Modo referência: extrai características da segunda imagem como character_block
        userText = `A primeira imagem é a roupa do produto. A segunda imagem é a modelo de referência.
Extraia as características da modelo da segunda imagem para usar como character_block.
cenario: ${JSON.stringify(cenario || {})}
Analisa a roupa da primeira imagem e retorna o JSON conforme schema com campos: outfit_detectado, start_frame_prompt, prompt_kling_video, script, legenda_topo.
Retorne apenas o JSON, sem texto adicional.`;
        userContent = [
          { type: 'image', source: { type: 'base64', media_type: image_type   || 'image/jpeg', data: image_base64   } },
          { type: 'image', source: { type: 'base64', media_type: image_type_2 || 'image/jpeg', data: image_base64_2 } },
          { type: 'text', text: userText }
        ];
      } else {
        userText = `Analisa a roupa nesta imagem.
character_block: ${character_block || ''}
cenario: ${JSON.stringify(cenario || {})}
Retorna o JSON conforme schema com campos: outfit_detectado, start_frame_prompt, prompt_kling_video, script, legenda_topo.
Retorne apenas o JSON, sem texto adicional.`;
        userContent = [
          { type: 'image', source: { type: 'base64', media_type: image_type || 'image/jpeg', data: image_base64 } },
          { type: 'text', text: userText }
        ];
      }
    } else {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: image_type || 'image/jpeg', data: image_base64 } },
        { type: 'text',  text: buildUserMessage(tipo, promo, price, gender, duracao) }
      ];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': (process.env.ANTHROPIC_API_KEY || '').trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: loadSystemPrompt(style),
        messages: [{ role: 'user', content: userContent }]
      })
    });

    const data = await response.json();

    // Retry on overload (529) or server errors (5xx)
    if (response.status === 529 || (response.status >= 500 && attempt < MAX_RETRIES - 1)) {
      lastError = new Error(data.error?.message || 'Servidor sobrecarregado. Tente novamente.');
      continue;
    }

    if (!response.ok) throw new Error(data.error?.message || 'Erro na API Claude');

    const stopReason   = data.stop_reason || 'unknown';
    const inputTokens  = data.usage?.input_tokens  || 0;
    const outputTokens = data.usage?.output_tokens || 0;

    batchLog(`[callClaude] style=${style} attempt=${attempt} stop_reason=${stopReason} input=${inputTokens} output=${outputTokens}`);

    if (stopReason === 'max_tokens') {
      batchLog(`[callClaude] TRUNCADO — stop_reason=max_tokens (output=${outputTokens}). Tentando retry...`);
      lastError = new Error('Resposta truncada pela IA (max_tokens atingido)');
      continue;
    }

    const rawText = data.content[0].text.trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta inesperada da API');

    sessionTokens.input  += inputTokens;
    sessionTokens.output += outputTokens;

    const { inputCost, outputCost, totalCost } = calcCost(inputTokens, outputTokens);
    const sessionCost = calcCost(sessionTokens.input, sessionTokens.output);

    return {
      ...safeParseJSON(jsonMatch[0]),
      _usage: {
        input_tokens:  inputTokens,
        output_tokens: outputTokens,
        input_cost:    inputCost,
        output_cost:   outputCost,
        total_cost:    totalCost,
        session: {
          input_tokens:  sessionTokens.input,
          output_tokens: sessionTokens.output,
          total_cost:    sessionCost.totalCost
        }
      }
    };
  }

  throw lastError || new Error('Servidor sobrecarregado. Tente novamente em alguns segundos.');
}

// ── AUTH ROUTES ──

app.post('/api/auth/register', requireSupabase, async (req, res) => {
  const { email, password, name, accepted_terms } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter mínimo 6 caracteres' });
  if (!accepted_terms) return res.status(400).json({ error: 'Você precisa aceitar os Termos de Uso para continuar.' });

  const { data: existing } = await supabase
    .from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
  if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

  const password_hash = await bcrypt.hash(password, 12);

  // Insere o usuário (sem depender de colunas opcionais)
  const { data: user, error } = await supabase
    .from('users')
    .insert({ email: email.toLowerCase(), password_hash, name: name?.trim() || null })
    .select('id, email, is_admin, name, prompts_count, tokens_used')
    .single();

  if (error) return res.status(500).json({ error: 'Erro ao criar conta' });

  // Tenta salvar o timestamp de aceite dos termos (ignora silenciosamente se a coluna não existir)
  supabase.from('users')
    .update({ accepted_terms_at: new Date().toISOString() })
    .eq('id', user.id)
    .then(() => {})
    .catch(() => {});

  const token = jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, is_admin: user.is_admin, name: user.name, prompts_count: user.prompts_count || 0, tokens_used: user.tokens_used || 0 } });
});

app.post('/api/auth/login', requireSupabase, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  const { data: user } = await supabase
    .from('users')
    .select('id, email, password_hash, is_admin, name, prompts_count, tokens_used')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos' });

  const token = jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, is_admin: user.is_admin, name: user.name, prompts_count: user.prompts_count || 0, tokens_used: user.tokens_used || 0 } });
});

app.get('/api/auth/me', requireSupabase, requireAuth, async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('id, email, is_admin, name, prompts_count, tokens_used, plan, plan_active, generations_used, generations_limit')
    .eq('id', req.user.id)
    .maybeSingle();
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
  res.json({ user: {
    id: user.id, email: user.email, is_admin: user.is_admin, name: user.name,
    prompts_count: user.prompts_count || 0, tokens_used: user.tokens_used || 0,
    plan: user.plan || 'free',
    plan_active: user.plan_active || false,
    generations_used: user.generations_used || 0,
    generations_limit: user.generations_limit || 0,
  }});
});

// One-time admin setup — protected by ADMIN_SETUP_SECRET
app.post('/api/auth/setup-admin', requireSupabase, async (req, res) => {
  const { secret } = req.body;
  if (!secret || secret !== process.env.ADMIN_SETUP_SECRET)
    return res.status(403).json({ error: 'Proibido' });

  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password)
    return res.status(400).json({ error: 'ADMIN_EMAIL e ADMIN_PASSWORD não configurados no .env' });

  const { data: existing } = await supabase
    .from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();

  if (existing) {
    // Garante que is_admin = true mesmo se o usuário já existia
    const password_hash = await bcrypt.hash(password, 12);
    const { error: updErr } = await supabase
      .from('users')
      .update({ is_admin: true, password_hash })
      .eq('id', existing.id);
    if (updErr) return res.status(500).json({ error: updErr.message });
    return res.json({ message: 'Admin atualizado com sucesso', id: existing.id });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const { data: user, error } = await supabase
    .from('users')
    .insert({ email: email.toLowerCase(), password_hash, is_admin: true })
    .select('id, email').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Admin criado com sucesso', id: user.id });
});

// One-time gallery migration from gallery.json → Supabase (admin account)
app.post('/api/auth/migrate-gallery', requireSupabase, async (req, res) => {
  const { secret } = req.body;
  if (!secret || secret !== process.env.ADMIN_SETUP_SECRET)
    return res.status(403).json({ error: 'Proibido' });

  const GALLERY_FILE = path.join(__dirname, 'gallery.json');
  if (!fs.existsSync(GALLERY_FILE)) return res.json({ message: 'gallery.json não encontrado', migrated: 0 });

  let items;
  try { items = JSON.parse(fs.readFileSync(GALLERY_FILE, 'utf8')); }
  catch { return res.status(500).json({ error: 'Erro ao ler gallery.json' }); }

  if (!items.length) return res.json({ message: 'gallery.json está vazio', migrated: 0 });

  const { data: admin } = await supabase
    .from('users').select('id').eq('email', process.env.ADMIN_EMAIL.toLowerCase()).maybeSingle();
  if (!admin)
    return res.status(404).json({ error: 'Admin não encontrado. Rode /api/auth/setup-admin primeiro.' });

  const rows = items.map(it => ({
    id:           it.id,
    user_id:      admin.id,
    created_at:   it.created_at,
    image:        it.image        || null,
    prompt_video: it.prompt_video || null,
    legenda:      it.legenda      || null,
    nicho:        it.nicho        || null,
    emocao:       it.emocao       || null,
    tipo:         it.tipo         || null,
    price:        it.price        || null,
    cost:         it.cost         || null,
  }));

  const { error } = await supabase.from('gallery').upsert(rows, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: `${rows.length} itens migrados com sucesso` });
});

// ── PROFILE ──

app.patch('/api/users/profile', requireSupabase, requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Apelido obrigatório' });
  const { data, error } = await supabase
    .from('users')
    .update({ name: name.trim() })
    .eq('id', req.user.id)
    .select('id, email, is_admin, name, prompts_count, tokens_used')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: { id: data.id, email: data.email, is_admin: data.is_admin, name: data.name, prompts_count: data.prompts_count || 0, tokens_used: data.tokens_used || 0 } });
});

// ── FORGOT / RESET PASSWORD ──

app.post('/api/auth/forgot-password', requireSupabase, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório' });

  const { data: user } = await supabase
    .from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();

  // Sempre retornar 200 para não revelar se o email existe
  if (!user) return res.json({ message: 'Se o email existir, você receberá um link.' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

  await supabase.from('users').update({ reset_token: token, reset_expires: expires }).eq('id', user.id);

  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const resetLink = `${baseUrl}/?reset=${token}`;

  const sent = await sendResetEmail(email.toLowerCase(), resetLink);

  if (!sent) {
    // Email não configurado — retorna o link diretamente (útil em dev/admin)
    return res.json({ message: 'Email não configurado. Use o link abaixo.', reset_link: resetLink });
  }
  res.json({ message: 'Link enviado para seu email.' });
});

app.post('/api/auth/reset-password', requireSupabase, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token e nova senha obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter mínimo 6 caracteres' });

  const { data: user } = await supabase
    .from('users')
    .select('id, reset_token, reset_expires')
    .eq('reset_token', token)
    .maybeSingle();

  if (!user) return res.status(400).json({ error: 'Token inválido ou expirado' });
  if (new Date(user.reset_expires) < new Date()) return res.status(400).json({ error: 'Token expirado' });

  const password_hash = await bcrypt.hash(password, 12);
  await supabase.from('users').update({ password_hash, reset_token: null, reset_expires: null }).eq('id', user.id);

  res.json({ message: 'Senha atualizada com sucesso' });
});

// ── KIWIFY WEBHOOK ──

// Mapeamento por nome do produto (Kiwify v2 format: event + product.name)
const PLAN_CONFIG_BY_NAME = {
  'starter': { plan: 'starter', generations_limit: 200 },
  'pro':     { plan: 'pro',     generations_limit: 500 },
  'agencia': { plan: 'agencia', generations_limit: 1200 },
};

// Mapeamento legado por valor em centavos (Kiwify v1 format)
const PLAN_CONFIG_BY_AMOUNT = {
  6990:  { plan: 'starter', generations_limit: 200 },   // R$69,90
  12790: { plan: 'pro',     generations_limit: 500 },   // R$127,90
  24790: { plan: 'agencia', generations_limit: 1200 },  // R$247,90
};

app.post('/api/webhook/kiwify', requireSupabase, async (req, res) => {
  try {
    const body = req.body;

    // Suporta Kiwify v2 (event + customer) e v1 (order_status + Customer)
    const event  = body?.event;
    const status = body?.order_status;
    const email  = (body?.customer?.email || body?.Customer?.email)?.toLowerCase();

    if (!email) return res.status(400).json({ error: 'Email não encontrado no payload' });

    // ── Ativação de plano ──
    // v2: event === 'order.approved'  |  v1: order_status === 'paid'
    if (event === 'order.approved' || status === 'paid') {
      let config;

      // v2: identifica pelo nome do produto
      if (body?.product?.name) {
        const productKey = body.product.name.toLowerCase().replace(/ê/g, 'e').replace(/[^a-z]/g, '');
        config = PLAN_CONFIG_BY_NAME[productKey];
      }

      // v1 (ou fallback): identifica pelo valor em centavos
      if (!config) {
        const amountCents = body?.Charges?.[0]?.amount || body?.amount || 0;
        config = PLAN_CONFIG_BY_AMOUNT[amountCents];
      }

      if (!config) {
        const productName = body?.product?.name || 'desconhecido';
        console.warn(`[kiwify] Plano não mapeado: "${productName}" — email: ${email}`);
        return res.status(200).json({ message: `Plano "${productName}" não mapeado, ignorado` });
      }

      // Tenta atualizar usuário existente primeiro
      const { data: existing, error: selectErr } = await supabase.from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (selectErr) return res.status(500).json({ error: selectErr.message });

      if (existing) {
        // Usuário já existe — apenas atualiza o plano
        const { error: updateErr } = await supabase.from('users')
          .update({ plan: config.plan, plan_active: true, generations_limit: config.generations_limit })
          .eq('email', email);
        if (updateErr) return res.status(500).json({ error: updateErr.message });
      } else {
        // Usuário ainda não registrou — pré-cria com plano ativo (senha temporária)
        const { error: insertErr } = await supabase.from('users')
          .insert({
            email,
            name: body?.customer?.name || body?.Customer?.name || email,
            password_hash: 'PENDING_REGISTRATION',
            plan: config.plan,
            plan_active: true,
            generations_limit: config.generations_limit,
            generations_used: 0,
          });
        if (insertErr) return res.status(500).json({ error: insertErr.message });
      }

      console.log(`[kiwify] Plano ${config.plan} ativado para ${email} (${existing ? 'atualizado' : 'pré-criado'})`);
      return res.json({ message: `Plano ${config.plan} ativado`, plan: config.plan, email, created: !existing });

    // ── Cancelamento ──
    // v2: event === 'subscription.cancelled'  |  v1: order_status === 'refunded'/'chargedback'
    } else if (event === 'subscription.cancelled' || status === 'refunded' || status === 'chargedback') {
      const { error } = await supabase.from('users')
        .update({ plan_active: false })
        .eq('email', email);

      if (error) return res.status(500).json({ error: error.message });
      const reason = event || status;
      console.log(`[kiwify] Plano desativado para ${email} (${reason})`);
      return res.json({ message: 'Plano desativado', email });

    } else {
      const ignored = event || status || 'desconhecido';
      return res.status(200).json({ message: `Evento "${ignored}" ignorado` });
    }
  } catch (err) {
    console.error('[kiwify] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GENERATE (Protected) ──

app.post('/api/generate', requireAuth, async (req, res) => {
  const { image_base64, image_type, image_base64_2, image_type_2, tipo, promo, price, gender, style = 'base' } = req.body;
  const duracao = (style === 'serie' || style === 'nano' || style === 'nano-veo-2') ? (req.body.duracao || null) : null;

  if (!image_base64) return res.status(400).json({ error: 'Imagem é obrigatória' });
  if (style === 'roupa-feminina-b' && !image_base64_2) return res.status(400).json({ error: 'Roupa Feminina + Modelo requer duas imagens.' });

  // ── Roupa Feminina v2 — prepara extras ──
  let extras = null;
  if (style === 'roupa-feminina-v2') {
    const { personagem_id, cenario_id, modo } = req.body;
    let character_block = null;
    let character_sheet = null;

    if (modo !== 'ugc-da-137') {
      if (!personagem_id) return res.status(400).json({ error: 'personagem_id é obrigatório no modo biblioteca.' });
      const charFile = findCharFile(personagem_id);
      if (!charFile) return res.status(400).json({ error: `Personagem "${personagem_id}" não encontrado.` });
      const charContent = fs.readFileSync(charFile, 'utf8');
      character_block = parseCharBlock(charContent);
      character_sheet = parseCharSheet(charContent);
    } else if (!image_base64_2) {
      return res.status(400).json({ error: 'Modo UGC da 137 requer imagem da modelo de referência.' });
    }

    if (!cenario_id) return res.status(400).json({ error: 'cenario_id é obrigatório.' });
    const cenFile = findCenarioFile(cenario_id);
    if (!cenFile) return res.status(400).json({ error: `Cenário "${cenario_id}" não encontrado.` });
    const cenContent = fs.readFileSync(cenFile, 'utf8');
    const cenario = parseCenarioMd(cenContent);

    extras = { character_block, character_sheet, cenario, modo: modo || 'biblioteca' };
  }

  // ── Base v2 — detecta nicho, sorteia personagens e frases ──
  let extrasV2 = null;
  if (style === 'base-v2') {
    const { history_hooks = [], history_prods = [], history_ctas = [], history_chars = [] } = req.body;
    const nicho = await detectarNicho(image_base64, image_type);
    const nichoConfig = NICHOS_V2[nicho] || NICHOS_V2.generico;

    // Build character pool from all relevant pools
    const allChars = nichoConfig.pools.flatMap(pool => listPoolIds(pool));
    const selected = pickRandom(allChars, 2, history_chars);
    const frases   = sortearFrases(nichoConfig.frasesFile, history_hooks, history_prods, history_ctas);

    extrasV2 = { nicho, chars: selected, frases };
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'coloque_sua_chave_aqui') {
    return res.status(500).json({ error: 'Configure sua ANTHROPIC_API_KEY no arquivo .env' });
  }

  // ── Verificação de plano ──
  if (supabase && !req.user.is_admin) {
    const { data: u } = await supabase
      .from('users')
      .select('plan_active, generations_used, generations_limit, plan')
      .eq('id', req.user.id)
      .maybeSingle();

    if (!u?.plan_active) {
      return res.status(403).json({ error: 'no_plan', message: 'Você não tem um plano ativo.' });
    }
    if ((u.generations_used || 0) >= (u.generations_limit || 0)) {
      return res.status(403).json({ error: 'limit_reached', message: 'Você usou todas as suas gerações deste mês.' });
    }
  }

  try {
    let result;
    if (style === 'base-v2') {
      result = await callClaudeBaseV2(image_base64, image_type, price, extrasV2);
    } else {
      result = await callClaude(image_base64, image_type, tipo, promo, price, gender, style, duracao, image_base64_2, image_type_2, extras);
    }

    // For v2, inject character_sheet from file into result so frontend can display it
    if (style === 'roupa-feminina-v2' && extras?.character_sheet) {
      result._character_sheet = extras.character_sheet;
    }

    // Save to gallery server-side immediately
    const galleryItem = await _saveGalleryItem(req.user.id, result, image_base64, image_type, price, tipo, style);

    // Update user stats (fire-and-forget)
    if (supabase) {
      const totalTok = result._usage ? (result._usage.input_tokens || 0) + (result._usage.output_tokens || 0) : 0;
      supabase.from('users').select('prompts_count, tokens_used, generations_used').eq('id', req.user.id).maybeSingle()
        .then(({ data }) => {
          if (data) supabase.from('users').update({
            prompts_count:    (data.prompts_count    || 0) + 1,
            tokens_used:      (data.tokens_used      || 0) + totalTok,
            generations_used: (data.generations_used || 0) + 1,
          }).eq('id', req.user.id).then(() => {});
        });
    }

    res.json({ ...result, _gallery: galleryItem });
  } catch (err) {
    console.error('Erro interno:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-batch', requireAuth, async (req, res) => {
  const { items, tipo, promo, gender, jobIds, style = 'base' } = req.body;
  const duracao = (style === 'serie' || style === 'nano' || style === 'nano-veo-2') ? (req.body.duracao || null) : null;
  // jobIds: optional string[] from /api/queue/submit, one per item

  if (!items || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Nenhum item enviado' });
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'coloque_sua_chave_aqui')
    return res.status(500).json({ error: 'Configure sua ANTHROPIC_API_KEY no arquivo .env' });

  // ── Verificação de plano ──
  if (supabase && !req.user.is_admin) {
    const { data: u } = await supabase
      .from('users')
      .select('plan_active, generations_used, generations_limit')
      .eq('id', req.user.id)
      .maybeSingle();

    if (!u?.plan_active) {
      return res.status(403).json({ error: 'no_plan', message: 'Você não tem um plano ativo.' });
    }
    const remaining = (u.generations_limit || 0) - (u.generations_used || 0);
    if (remaining <= 0) {
      return res.status(403).json({ error: 'limit_reached', message: 'Você usou todas as suas gerações deste mês.' });
    }
    // Limita o lote ao que ainda resta
    if (items.length > remaining) items.splice(remaining);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const WORKERS      = 3;
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY  = 3000;
  const queue        = Array.from({ length: items.length }, (_, i) => i);
  const retryQueue   = []; // items that exhausted main attempts — get one final try
  let batchPrompts   = 0;
  let batchTokens    = 0;

  // Try Claude up to MAX_ATTEMPTS times with delay between — silent retries, no SSE events
  async function tryCallClaude(image_base64, image_type, price) {
    let lastErr;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await callClaude(image_base64, image_type, tipo, promo, price, gender, style, duracao);
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_ATTEMPTS - 1) await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
    throw lastErr;
  }

  async function processItem(index) {
    const { image_base64, image_type, price } = items[index];
    const jobId = Array.isArray(jobIds) ? (jobIds[index] ?? null) : null;

    await _updateJobStatus(jobId, 'generating');
    res.write(`data: ${JSON.stringify({ type: 'progress', index, total: items.length })}\n\n`);

    try {
      const result = await tryCallClaude(image_base64, image_type, price);

      if (result._usage) {
        batchPrompts++;
        batchTokens += (result._usage.input_tokens || 0) + (result._usage.output_tokens || 0);
      }

      const pv = result?.prompt_video || '';
      const pvOk = pv.includes('pure video frame only') || pv.includes('9:16 photorealistic') || pv.length > 1200;
      batchLog(`[processItem] index=${index} pv.length=${pv.length} ${pvOk ? 'OK' : 'POSSIVEL_TRUNCAMENTO'} | tail: "${pv.slice(-100).replace(/\n/g, '↵')}"`);

      const galleryItem = await _saveGalleryItem(req.user.id, result, image_base64, image_type, price, tipo, style);
      batchLog(`[processItem] index=${index} saved gallery_id=${galleryItem?.id || 'null'}`);
      await _updateJobStatus(jobId, 'done', galleryItem?.id ?? null);
      res.write(`data: ${JSON.stringify({ type: 'result', index, data: result, gallery: galleryItem })}\n\n`);

    } catch {
      // All attempts failed — move to final retry queue, tell frontend to show as "aguardando"
      retryQueue.push(index);
      res.write(`data: ${JSON.stringify({ type: 'retry_pending', index })}\n\n`);
    }
  }

  // Worker pool: WORKERS concurrent workers pulling from shared queue
  async function worker() {
    while (true) {
      const index = queue.shift();
      if (index === undefined) break;
      await processItem(index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(WORKERS, items.length) }, worker));

  // Final retry: one last attempt for each item that failed — sequential, after all others done
  for (const index of retryQueue) {
    const { image_base64, image_type, price } = items[index];
    const jobId = Array.isArray(jobIds) ? (jobIds[index] ?? null) : null;
    try {
      const result = await callClaude(image_base64, image_type, tipo, promo, price, gender, style, duracao);
      if (result._usage) {
        batchPrompts++;
        batchTokens += (result._usage.input_tokens || 0) + (result._usage.output_tokens || 0);
      }
      const pvR = result?.prompt_video || '';
      const pvROk = pvR.includes('pure video frame only') || pvR.includes('9:16 photorealistic') || pvR.length > 1200;
      batchLog(`[finalRetry] index=${index} pv.length=${pvR.length} ${pvROk ? 'OK' : 'POSSIVEL_TRUNCAMENTO'} | tail: "${pvR.slice(-100).replace(/\n/g, '↵')}"`);
      const galleryItem = await _saveGalleryItem(req.user.id, result, image_base64, image_type, price, tipo, style);
      await _updateJobStatus(jobId, 'done', galleryItem?.id ?? null);
      res.write(`data: ${JSON.stringify({ type: 'result', index, data: result, gallery: galleryItem })}\n\n`);
    } catch (err) {
      await _updateJobStatus(jobId, 'error', null, err.message);
      // Silent failure — card fades out, no error shown to user
      res.write(`data: ${JSON.stringify({ type: 'silent_error', index })}\n\n`);
    }
  }

  // Update user stats (fire-and-forget)
  if (supabase && batchPrompts > 0) {
    supabase.from('users').select('prompts_count, tokens_used, generations_used').eq('id', req.user.id).maybeSingle()
      .then(({ data }) => {
        if (data) supabase.from('users').update({
          prompts_count:    (data.prompts_count    || 0) + batchPrompts,
          tokens_used:      (data.tokens_used      || 0) + batchTokens,
          generations_used: (data.generations_used || 0) + batchPrompts,
        }).eq('id', req.user.id).then(() => {});
      });
  }

  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
});

// ── DEBUG — leitura do log de batch (somente admin) ──
app.get('/api/debug/last-batch', requireAuth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Apenas admin' });
  try {
    const content = fs.existsSync(BATCH_LOG) ? fs.readFileSync(BATCH_LOG, 'utf8') : '(log vazio)';
    // Devolve as últimas 500 linhas para não sobrecarregar
    const lines = content.split('\n');
    const tail  = lines.slice(-500).join('\n');
    res.type('text/plain').send(tail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── QUEUE (Job tracking — requires queue_jobs table in Supabase) ──
// SQL to create table:
// CREATE TABLE queue_jobs (
//   id text PRIMARY KEY, batch_id text, user_id text, position int,
//   name text, status text DEFAULT 'waiting', gallery_id text, error_msg text,
//   created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
// );

app.post('/api/queue/submit', requireAuth, async (req, res) => {
  const { items } = req.body; // [{ name }]
  if (!items?.length) return res.status(400).json({ error: 'Nenhum item' });

  const batchId = `b${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const jobs = items.map((it, i) => ({
    id:         `${batchId}-${i}`,
    batch_id:   batchId,
    user_id:    req.user.id,
    position:   i,
    name:       it.name || `Produto ${i + 1}`,
    status:     'waiting',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  if (supabase) {
    try { await supabase.from('queue_jobs').insert(jobs); }
    catch { /* table may not exist — continue without persistence */ }
  }

  res.json({ batchId, jobs: jobs.map(j => ({ id: j.id, position: j.position })) });
});

app.get('/api/queue/batch/:batchId', requireAuth, async (req, res) => {
  if (!supabase) return res.json([]);
  try {
    const { data } = await supabase
      .from('queue_jobs')
      .select('id, position, status, gallery_id, error_msg, name')
      .eq('batch_id', req.params.batchId)
      .eq('user_id', req.user.id)
      .order('position');
    res.json(data || []);
  } catch { res.json([]); }
});

// ── GALLERY (Protected — Supabase, isolado por usuário) ──

app.get('/api/gallery', requireSupabase, requireAuth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);

  const [countRes, dataRes] = await Promise.all([
    supabase.from('gallery').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id),
    supabase.from('gallery').select('*').eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
  ]);

  if (dataRes.error) return res.status(500).json({ error: dataRes.error.message });
  // Return null total when count query fails so frontend can distinguish empty vs unknown
  const total = (countRes.error || countRes.count == null) ? null : countRes.count;
  res.json({ items: dataRes.data || [], total });
});

app.post('/api/gallery', requireSupabase, requireAuth, async (req, res) => {
  const item = req.body;
  if (!item) return res.status(400).json({ error: 'Item vazio' });

  const newItem = {
    id:           Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    user_id:      req.user.id,
    created_at:   new Date().toISOString(),
    image:        item.image        || null,
    prompt_video: item.prompt_video || null,
    legenda:      item.legenda      || null,
    nicho:        item.nicho        || null,
    emocao:       item.emocao       || null,
    tipo:         item.tipo         || null,
    price:        item.price        || null,
    cost:         item.cost         || null,
  };

  const { data, error } = await supabase.from('gallery').insert(newItem).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/gallery/:id', requireSupabase, requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('gallery')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id); // garante que o item pertence ao usuário

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── STATS (Protected — agrega dados da galeria por data) ──

app.get('/api/stats', requireSupabase, requireAuth, async (req, res) => {
  const { from, to } = req.query;

  let query = supabase
    .from('gallery')
    .select('created_at, cost')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (from) query = query.gte('created_at', from + 'T00:00:00.000Z');
  if (to)   query = query.lte('created_at', to   + 'T23:59:59.999Z');

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const daily = {};
  let total_cost_usd = 0;
  let total_tokens   = 0;

  for (const item of data) {
    const date = item.created_at.slice(0, 10); // YYYY-MM-DD
    const cost  = item.cost?.total_cost    || 0;
    const inp   = item.cost?.input_tokens  || 0;
    const out   = item.cost?.output_tokens || 0;

    total_cost_usd += cost;
    total_tokens   += inp + out;

    if (!daily[date]) daily[date] = { date, prompts: 0, cost_usd: 0, tokens: 0 };
    daily[date].prompts++;
    daily[date].cost_usd += cost;
    daily[date].tokens   += inp + out;
  }

  res.json({
    total_prompts:  data.length,
    total_cost_usd,
    total_tokens,
    daily: Object.values(daily),
  });
});

// ── Câmbio ao vivo USD→BRL (cache 1h) ──
let _exchangeCache = { rate: 5.70, fetchedAt: 0 };

async function getLiveRate() {
  const AGE = Date.now() - _exchangeCache.fetchedAt;
  if (AGE < 60 * 60 * 1000) return _exchangeCache.rate; // cache válido por 1h
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { timeout: 5000 });
    if (!r.ok) throw new Error('status ' + r.status);
    const d = await r.json();
    const rate = parseFloat(d?.USDBRL?.bid);
    if (!isNaN(rate) && rate > 1) {
      _exchangeCache = { rate: +rate.toFixed(4), fetchedAt: Date.now() };
    }
  } catch (e) {
    console.warn('[exchange] fallback para cache:', e.message);
  }
  return _exchangeCache.rate;
}

// ── Roupa Feminina v2 — lista de personagens (público para o frontend) ──
app.get('/api/personagens', requireAuth, (req, res) => {
  const dir = path.join(__dirname, 'personagens');
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter(f => f.match(/^CH-\d+-.+\.md$/));
  const list = files.map(filename => {
    const content = fs.readFileSync(path.join(dir, filename), 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const fm = {};
    if (fmMatch) {
      fmMatch[1].split('\n').forEach(line => {
        const [k, ...v] = line.split(':');
        if (k && v.length) fm[k.trim()] = v.join(':').trim().replace(/^"|"$/g, '');
      });
    }
    return {
      id:        fm.id        || '',
      nome:      fm.nome      || '',
      categoria: fm.categoria || 'morena',
      idade:     fm.idade     || '',
    };
  }).filter(c => c.id).sort((a, b) => a.id.localeCompare(b.id));
  res.json(list);
});

app.get('/api/exchange-rate', async (req, res) => {
  const rate = await getLiveRate();
  res.json({ usd_brl: rate, source: 'awesomeapi', cached_at: new Date(_exchangeCache.fetchedAt).toISOString() });
});

// ── FAL AI Balance estimado (admin only) ──
// Calcula: FAL_INITIAL_BALANCE - total gasto em toda a galeria
app.get('/api/fal/balance', requireSupabase, requireAuth, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  const initial = parseFloat(process.env.FAL_INITIAL_BALANCE || '0');
  if (!initial) return res.status(503).json({ error: 'FAL_INITIAL_BALANCE não configurada no .env' });

  // Soma todos os custos da galeria (todos os usuários)
  const { data, error } = await supabase.from('gallery').select('cost');
  if (error) return res.status(500).json({ error: error.message });

  const rate = await getLiveRate();
  const total_spent = data.reduce((sum, item) => sum + (item.cost?.total_cost || 0), 0);
  const balance_usd = Math.max(0, initial - total_spent);
  const balance_brl = +(balance_usd * rate).toFixed(2);

  res.json({
    balance_usd:   +balance_usd.toFixed(4),
    balance_brl,
    initial_usd:   initial,
    total_spent_usd: +total_spent.toFixed(4),
    usd_brl_rate:  rate,
    estimated: true,
  });
});

// ── TERMOS DE USO (oculto, acessível só por link direto) ──
app.get('/termos', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Termos de Uso — UGC·AI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg: #0d0d0d; --surface: #161616; --border: rgba(255,255,255,0.08); --text: #e8e8e8; --text-dim: rgba(255,255,255,0.5); --orange: #FF6B00; }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif; line-height: 1.7; padding: 0 16px 80px; }
    .wrap { max-width: 720px; margin: 0 auto; padding-top: 64px; }
    .logo { font-family: 'DM Mono', monospace; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: var(--orange); margin-bottom: 48px; display: block; text-decoration: none; }
    h1 { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
    .meta { font-size: 12px; color: var(--text-dim); margin-bottom: 48px; }
    h2 { font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--orange); margin: 40px 0 12px; }
    p { font-size: 15px; color: rgba(255,255,255,0.82); margin-bottom: 12px; }
    a { color: var(--orange); text-underline-offset: 3px; }
    hr { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
    .back { display: inline-flex; align-items: center; gap: 6px; margin-top: 56px; font-size: 12px; color: var(--text-dim); text-decoration: none; transition: color 0.15s; }
    .back:hover { color: var(--text); }
  </style>
</head>
<body>
  <div class="wrap">
    <a class="logo" href="/">UGC·AI</a>
    <h1>Termos de Uso</h1>
    <p class="meta">Última atualização: Abril de 2025 &nbsp;·&nbsp; UGC Prompt Generator (ugcai.com.br)</p>

    <p>Ao criar uma conta e utilizar a plataforma UGC·AI, você concorda com os termos descritos abaixo. Leia com atenção antes de prosseguir.</p>

    <hr>

    <h2>1. Sobre o Serviço</h2>
    <p>O UGC·AI é uma plataforma de geração de prompts de vídeo UGC (User Generated Content) com inteligência artificial, desenvolvida para criadores de conteúdo e lojistas do TikTok Shop Brasil.</p>
    <p>O acesso às funcionalidades da plataforma está condicionado à contratação de um plano pago ativo. Usuários sem plano ativo podem criar conta, mas não poderão gerar prompts.</p>

    <h2>2. Planos e Pagamento</h2>
    <p>Os planos disponíveis (Starter, Pro e Agência) são cobrados mensalmente por meio da plataforma Kiwify. O valor e as condições de cada plano estão descritos na página de vendas.</p>
    <p>Reservamo-nos o direito de alterar preços e condições dos planos com aviso prévio de 30 (trinta) dias corridos. Assinantes ativos serão notificados por e-mail.</p>

    <h2>3. Política de Reembolso</h2>
    <p>O usuário tem direito a reembolso integral em até <strong>7 (sete) dias corridos</strong> contados da data da compra, desde que não tenha utilizado 10 (dez) ou mais gerações de prompts na plataforma.</p>
    <p><strong>A partir da 10ª geração realizada, o serviço é considerado consumido e não há direito a reembolso</strong>, independentemente do prazo de 7 dias ainda estar em vigor.</p>
    <p>Para solicitar reembolso dentro das condições acima, entre em contato pelo e-mail <a href="mailto:portalcenabrasil@gmail.com">portalcenabrasil@gmail.com</a>.</p>

    <h2>4. Cancelamento</h2>
    <p>O usuário pode cancelar sua assinatura a qualquer momento diretamente pela plataforma Kiwify, sem necessidade de entrar em contato com o suporte. O acesso permanece ativo até o fim do período já pago.</p>
    <p>Não há reembolso proporcional por dias não utilizados após o cancelamento.</p>

    <h2>5. Uso Permitido</h2>
    <p>O acesso à plataforma é estritamente pessoal e intransferível — exclusivo do titular da conta. É proibido compartilhar credenciais de acesso, revender, sublicenciar ou redistribuir os outputs gerados pela plataforma como serviço próprio.</p>

    <h2>6. Propriedade Intelectual dos Outputs</h2>
    <p>Os prompts e textos gerados pela plataforma a partir das imagens e configurações do usuário são de uso livre pelo próprio usuário, podendo ser utilizados em vídeos, publicações e materiais de marketing sem necessidade de atribuição ao UGC·AI.</p>
    <p>O código-fonte, design, marca e demais ativos da plataforma pertencem exclusivamente à UGC·AI e não podem ser reproduzidos ou copiados.</p>

    <h2>7. Limitação de Responsabilidade</h2>
    <p>O UGC·AI fornece uma ferramenta de assistência criativa baseada em inteligência artificial. Não garantimos resultados específicos de vendas, visualizações ou performance dos conteúdos produzidos a partir dos prompts gerados.</p>
    <p>A plataforma é fornecida "como está" (as-is), sem garantias de disponibilidade ininterrupta.</p>

    <h2>8. Privacidade</h2>
    <p>Os dados pessoais coletados (e-mail, nome e imagens enviadas para análise) são utilizados exclusivamente para a prestação do serviço. Nenhum dado pessoal é vendido ou compartilhado com terceiros para fins comerciais.</p>
    <p>As imagens enviadas para geração de prompts são processadas em tempo real e não são armazenadas permanentemente em nossos servidores.</p>

    <h2>9. Contato</h2>
    <p>Para dúvidas, solicitações de reembolso ou suporte, entre em contato pelo e-mail: <a href="mailto:portalcenabrasil@gmail.com">portalcenabrasil@gmail.com</a></p>

    <hr>
    <p style="font-size:13px;color:var(--text-dim);">Ao continuar utilizando a plataforma após alterações nestes Termos, você concorda com as novas condições.</p>

    <a class="back" href="/">← Voltar para o app</a>
  </div>
</body>
</html>`);
});

// Lê index.html no startup. Em serverless (Vercel) o sistema de arquivos é
// read-only exceto /tmp — mas os arquivos bundlados via includeFiles são
// acessíveis via __dirname em modo leitura. readFileSync no startup é mais
// confiável que sendFile em ambientes Lambda (evita ENOENT em runtime).
const INDEX_HTML_PATH = path.join(__dirname, 'public', 'index.html');
let INDEX_HTML = '';
try {
  INDEX_HTML = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
} catch (e) {
  console.error('[startup] ERRO ao ler index.html:', e.message);
}

app.get('*', (req, res) => {
  if (INDEX_HTML) {
    res.type('html').send(INDEX_HTML);
  } else {
    // Fallback: tenta sendFile se readFileSync falhou no startup
    res.sendFile(INDEX_HTML_PATH);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`UGC Prompt Generator rodando em http://localhost:${PORT}`);
});
