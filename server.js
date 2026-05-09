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
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const flags                      = require('./lib/feature-flags');
const { requireAdmin }           = require('./lib/require-admin');
const tracker                    = require('./lib/tracker');
const { recordCost, calcCostUsd } = require('./lib/anthropic-cost');

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
  const isTryon         = style === 'tryon-haul';
  if (!supabase || (!result?.prompt_video && !result?.character_sheet && !isNanoVeo2 && !isRoupaFeminina && !isBaseV2 && !isTryon)) return null;

  // For serie/nano/nano-veo-2: assemble prompt_video from all cena fields
  let prompt_video = result.prompt_video || null;
  let legenda      = result.legenda      || null;
  let nicho        = result.nicho        || null;
  let emocao       = result.emocao       || null;

  if (isBaseV2) {
    const parts = [];
    if (result.character_sheet)             parts.push(result.character_sheet);
    if (result.start_frame_prompt)          parts.push(result.start_frame_prompt);
    if (result.prompt_video_1)              parts.push(result.prompt_video_1);
    if (result.prompt_video_2_continuacao)  parts.push(result.prompt_video_2_continuacao);
    if (result.legenda_topo) {
      const legendaText = Array.isArray(result.legenda_topo)
        ? result.legenda_topo.join('\n\n')
        : result.legenda_topo;
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
      if (result.legenda)     parts.push(result.legenda); // Legenda TikTok completa
    } else {
      // roupa-feminina-a / roupa-feminina-b
      if (result.character_sheet)                       parts.push(result.character_sheet);
      if (result.start_frame_prompt)                    parts.push(result.start_frame_prompt);
      if (result.referencia_imagem?.descricao_completa) parts.push(result.referencia_imagem.descricao_completa);
      if (result.outfit_detectado)                      parts.push('OUTFIT: ' + result.outfit_detectado);
      if (result.script) {
        const s = result.script;
        // Format igual ao script_formatado do frontend para consistência visual
        const scriptText = `🎯 HOOK (0–3s)\n${s.hook || ''}` +
          `\n\n💎 BENEFÍCIO (3–10s)\n${s.beneficio || ''}` +
          (s.prova_social ? `\n\n⭐ PROVA SOCIAL (10–18s)\n${s.prova_social}` : '') +
          `\n\n🛒 CTA (18–25s)\n${s.cta || ''}`;
        parts.push(scriptText);
      }
      if (result.cena_1_video_kling) parts.push(result.cena_1_video_kling);
      if (result.cena_2_video_kling) parts.push(result.cena_2_video_kling);
      if (result.cena_3_video_kling) parts.push(result.cena_3_video_kling);
      if (result.legenda_topo)       parts.push(result.legenda_topo);
      if (result.legenda)            parts.push(result.legenda); // Legenda TikTok completa
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
  } else if (isTryon) {
    // ── Constantes Kling — espelham as do index.html, NUNCA alterar os prompts ──
    const KLING_TAKES_SERVER = [
      { num:1, uso:'Abertura de vídeo / transição suave',
        prompt:`She slowly raises her right hand up to her hair near her ear and gently runs her fingers through her wavy locks, sliding them down toward her shoulder. As her hand falls back to her side, she gives a soft confident closed-mouth smile and tilts her head slightly. Subtle natural breathing throughout. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:2, uso:'Take com leve aproximação — igual ao do conjunto preto original',
        prompt:`She takes one slow small step forward toward the camera, body coming slightly closer in frame. As she steps, she gives a subtle confident smirk that grows into a soft smile. Her hair sways gently with the movement. She stops naturally and lets her arms relax at her sides. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:3, uso:'Mostrando o caimento do conjunto / meio do vídeo',
        prompt:`She gently places both hands flat on her toned stomach between the crop top and skirt, fingers softly spread, drawing attention to the outfit. She looks down briefly at her outfit, then lifts her gaze back up to the camera with a sweet closed-mouth smile. Slight natural body sway. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:4, uso:'Mostrar o caimento da saia / movimento do tecido',
        prompt:`She slowly rotates her body about 45 degrees to her right showing the side profile of the outfit, the flared skater skirt swings naturally with the movement showing its flow. She pauses in profile briefly, then turns back to face the camera with a soft smile. Hair flows naturally with the rotation. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:5, uso:'Pose confidence / mostrar caimento do quadril',
        prompt:`She slowly brings both hands up and places them confidently on her hips, framing the high waistband of the skirt. She gives a small playful side-to-side hip sway making the flared skirt swing softly. Soft confident smile, eyes locked on camera. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:6, uso:'Take com mais movimento / clip rico para múltiplos cortes',
        prompt:`She raises her right hand to gently touch her hair near her shoulder, then slowly slides her hand down across her body and rests it lightly on her stomach. As her hand settles, she breaks into a wide genuine smile with teeth showing, eyes warm and connected with the camera. Subtle weight shift to one leg. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:7, uso:'Detalhe casual / transição entre cores',
        prompt:`She brings her right hand up and casually adjusts the strap of her sports bra near her shoulder with two fingers, then lets her hand fall back to her side. Subtle confident closed-mouth smile, calm energy. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:8, uso:'Abertura candid / clip de personalidade',
        prompt:`She glances briefly off-camera to her right as if reacting to something, then turns her gaze back to the camera with a knowing soft smile. Hair shifts naturally with the head movement. Arms stay relaxed at her sides. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:9, uso:'Clip de finalização / momento autêntico',
        prompt:`She breaks into a sudden natural laugh, tilting her head back slightly, eyes crinkling, hair bouncing with the movement. The laugh softens back into a warm closed-mouth smile. Authentic candid energy. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
    ];
    const CTA_TAKES_SERVER = [
      { num:'CTA 1', uso:'Finalização pessoal e feminina — alto engajamento',
        prompt:`She raises both hands and points both index fingers downward toward the bottom of the frame twice in a light natural motion, a knowing soft smile on her face. After the second point, she lets her right hand rise and gently touches her hair near her shoulder, while her left arm relaxes at her side. Subtle head tilt, warm eyes on camera. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:'CTA 2', uso:'CTA com referência ao produto — chama atenção para o conjunto',
        prompt:`She gently bends both elbows close to her sides and points both index fingers downward toward the bottom of the frame twice in a small natural motion, arms staying low and relaxed near her waist, a soft smile growing on her face. After the second point, she lets her right hand rest lightly flat on her stomach while her left arm relaxes at her side. Warm eyes on camera, slight natural body sway. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
      { num:'CTA 3', uso:'CTA com pose confiante — encerramento elegante e limpo',
        prompt:`She gently bends both elbows close to her sides and points both index fingers downward toward the bottom of the frame twice in a small natural motion, arms staying low near her waist, a confident closed-mouth smile on her face. After the second point, she smoothly places her right hand on her hip while her left arm falls naturally to her side, settling into a relaxed pose. Eyes stay warm and connected with the camera. Static camera, vertical 9:16, photorealistic UGC, real skin texture, maintain facial consistency, no morphing.` },
    ];
    const TRYON_FACESWAP_SERVER = `Replace the face of the girl from Photo 2 onto the body and background of the girl in Photo 1. Keep the exact body position, outfit, hair, lighting, angle, and environment from Photo 1 completely unchanged. Only the face is replaced. The final result must look completely natural and seamless, with no visible editing marks.\n\nPreserve all facial details from Photo 2 — skin texture, pores, natural shadows, expression, and proportions. Match the lighting direction, color temperature, and shadow softness to the scene in Photo 1 so the face blends perfectly with the body.\n\nThe image must look like it was taken with an iPhone 16 front camera. Maintain realistic smartphone sharpness, natural skin tones, subtle dynamic range, and slight front-camera depth characteristics. Do not over-smooth the skin. Keep natural imperfections for authenticity.\n\nStyle: TikTok UGC influencer content.\nFraming: vertical 9:16.\nCamera: fixed, eye-level selfie angle, slightly below eye line.\nLighting: natural daylight, soft shadows, realistic exposure.\nOverall result must look like a normal influencer selfie video frame — completely realistic, unedited, and organic.`;

    const parts = [];
    if (result.char_sheet_prompt)  parts.push(result.char_sheet_prompt);
    if (result.start_frame_prompt) parts.push(result.start_frame_prompt);
    parts.push(`🏠 Ambiente: ${result.environment || ''}`);
    parts.push(`👤 Personagem: ${result.char_description || ''}`);
    parts.push(`👗 Outfit: ${result.outfit_detected || ''}`);
    parts.push(TRYON_FACESWAP_SERVER);
    // 9 Kling takes (estáticos — não dependem de seleção do usuário)
    KLING_TAKES_SERVER.forEach(t => {
      parts.push(`🎬 Take #${t.num} — ${t.uso}:\n${t.prompt}`);
    });
    // 3 CTAs (estáticos)
    CTA_TAKES_SERVER.forEach(t => {
      parts.push(`🛒 ${t.num} — ${t.uso}:\n${t.prompt}`);
    });
    prompt_video = parts.join('\n\n---\n\n');
    legenda = '🎬 Try-On Haul';
    nicho   = 'Try-On Haul';
    emocao  = 'tryon-haul';
    tipo    = null; // tryon não usa tipo de vídeo
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

// ── Multer (memória — buffer enviado direto ao Supabase Storage) ──
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

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
const PRICE_INPUT_PER_M  = 3.00;   // Claude Sonnet 4.6
const PRICE_OUTPUT_PER_M = 15.00;  // Claude Sonnet 4.6

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
  futebol:     { pools: ['masculino'],             frasesFile: 'futebol',     voz: 'masculina-trabalho',      cenarios: ['sala de estar com TV mostrando jogo ao fundo, sofá, luz quente', 'carro estacionado, assento do motorista, luz natural do dia'] },
  anime:       { pools: ['masculino','donas-casa'],frasesFile: 'anime',       voz: 'colecionador-empolgado',  cenarios: ['quarto com setup gamer, luzes RGB roxas ao fundo, prateleira com figuras', 'mesa de escritório, luz azul ambiente, mangás ao fundo'] },
  casa:        { pools: ['donas-casa'],            frasesFile: 'casa',        voz: 'mae-experiente',          cenarios: ['cozinha caseira com plantas, bancada de madeira, luz natural da janela', 'sala de estar organizada, sofá, prateleiras ao fundo, luz quente'] },
  beleza:      { pools: ['donas-casa'],            frasesFile: 'beleza',      voz: 'jovem-empolgada',         cenarios: ['banheiro clean, espelho, iluminação suave natural', 'carro estacionado, espelho retrovisor visível, luz natural'] },
  pet:         { pools: ['donas-casa','masculino'],frasesFile: 'pet',         voz: 'mae-experiente',          cenarios: ['sala com piso de madeira, pet visível ao fundo', 'varanda ou jardim, luz natural, verde ao fundo'] },
  ferramentas: { pools: ['masculino'],             frasesFile: 'ferramentas', voz: 'masculina-trabalho',      cenarios: ['garagem com carro ao fundo, bancada de ferramentas', 'quintal ou oficina caseira, luz de Edison bulb overhead'] },
  saude:       { pools: ['masculino','donas-casa'],frasesFile: 'saude',       voz: 'mae-experiente',          cenarios: ['quarto à noite, abajur quente ao fundo, travesseiro visível', 'sala de estar diurna, sofá, planta ao fundo, luz suave'] },
  viagem:      { pools: ['masculino','donas-casa'],frasesFile: 'viagem',      voz: 'aventureira',             cenarios: ['carro (carona), janela com paisagem ao fundo', 'quarto simples, mala visível ao fundo, luz natural'] },
  generico:    { pools: ['masculino','donas-casa'],frasesFile: 'casa',        voz: 'mae-experiente',          cenarios: ['sala de estar casual, sofá, iluminação quente', 'cozinha caseira, bancada, plantas ao fundo'] },
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

async function callClaudeBaseV2(image_base64, image_type, price, extras_v2) {
  const { nicho, char, cenario, frasesAncora } = extras_v2;

  const charContent = readCharacterContent(char);
  const systemPrompt = loadSystemPrompt('base-v2');

  const { hook: hooks, produto: prods, cta: ctas } = frasesAncora;
  const hooksStr  = hooks.slice(0, 30).map((h, i) => `${String(i+1).padStart(2,'0')} ${h}`).join('\n');
  const prodsStr  = prods.slice(0, 30).map((p, i) => `${String(i+1).padStart(2,'0')} ${p}`).join('\n');
  const ctasStr   = ctas.slice(0, 30).map((c, i)  => `${String(i+1).padStart(2,'0')} ${c}`).join('\n');

  const voz = (NICHOS_V2[nicho] || NICHOS_V2.generico).voz;

  const userText = `nicho: ${nicho}
voz_estilo: ${voz}

PERSONAGEM (mesmo para os 2 vídeos):
${charContent}

CENÁRIO (mesmo para os 2 vídeos, Vídeo 2 pode usar ângulo diferente):
${cenario}

${price ? `PREÇO DO PRODUTO: R$ ${price}` : ''}

ÂNCORA DE TOM — Banco do nicho ${nicho}
(APENAS para captar vocabulário e tom — NUNCA copie literalmente — escreva falas originais)

HOOKS exemplo (30 tons):
${hooksStr}

PRODUTOS exemplo (30 tons):
${prodsStr}

CTAS exemplo (30 tons):
${ctasStr}

INSTRUÇÕES:
- Analise o produto na imagem
- Gere VÍDEO 1 (8s): falas ORIGINAIS e ESPECÍFICAS ao produto detectado na imagem, voz_estilo aplicada
- Gere VÍDEO 2 CONTINUAÇÃO (8s): MESMO personagem físico, MESMO cenário (pode mudar ângulo), falas TOTALMENTE diferentes do Vídeo 1
- Vídeo 2: aprofunda o produto (outro benefício, prova social, preço, urgência, CTA complementar)
- Final do Vídeo 1: "The exact person from the reference image attached."
- Final do Vídeo 2: "The exact person from the reference image attached. Continuation of previous video."
- Gere 3 legendas variando ângulo (preço, solução, presente) — específicas ao produto
- 100% PT-BR autêntico. ZERO clichê de IA.

Retorne APENAS o JSON:
{
  "character_sheet": "...",
  "start_frame_prompt": "...",
  "prompt_video_1": "...",
  "prompt_video_2_continuacao": "...",
  "legenda_topo": ["versão preço...", "versão solução...", "versão presente..."]
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
        max_tokens: 14000,
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
      _nicho:  nicho,
      _char1:  char.id,
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

// ═══════════════════════════════════════════════════════════════════
// callClaudeTryon — analisa imagem e extrai dados da personagem + outfit
// IA roda APENAS UMA VEZ. Troca de cor é puramente client-side.
// modo='biblioteca': char vem de personagem_id; imagem = outfit apenas
// modo='custom': análise completa da imagem (char + outfit + ambiente)
// ═══════════════════════════════════════════════════════════════════
async function callClaudeTryon(image_base64, image_type, personagem_id = null, modo = 'custom') {
  const systemPrompt = fs.readFileSync(path.join(__dirname, 'PROMPT-tryon.md'), 'utf8');

  // Biblioteca mode: carrega character block do arquivo
  let character_block = null;
  if (modo === 'biblioteca' && personagem_id) {
    const charFile = findCharFile(personagem_id);
    if (charFile) {
      const charContent = fs.readFileSync(charFile, 'utf8');
      character_block = parseCharBlock(charContent); // "Bloco curto" — só corpo, sem outfit
    }
  }

  const userText = character_block
    ? `CHARACTER DATA (personagem pré-selecionada pelo usuário — use para preencher char_description, char_hair, char_skin, char_face, char_body, char_full_preserve. NÃO extraia personagem da imagem):\n\n${character_block}\n\nAnalise APENAS o outfit/roupa na imagem. Retorne o JSON completo com todos os campos.`
    : 'Analise esta imagem e retorne o JSON conforme o sistema instrui. Apenas o JSON, sem nenhum texto extra.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': (process.env.ANTHROPIC_API_KEY || '').trim(),
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
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
  if (!response.ok) throw new Error(data.error?.message || 'Erro na API Claude (tryon-haul)');

  const inputTokens  = data.usage?.input_tokens  || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  let raw = (data.content?.[0]?.text || '').trim();
  // Remove possíveis markdown wrappers caso o modelo adicione
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  // Extrair JSON do texto (por segurança)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('[tryon-haul] Resposta inesperada da API — JSON não encontrado');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[tryon-haul] Falha ao parsear JSON:', err.message, '| raw:', raw.slice(0, 300));
    throw new Error('Falha ao interpretar dados da personagem. Tente novamente.');
  }

  const required = ['char_description','char_hair','char_skin','char_face','char_full_preserve','environment','char_sheet_prompt','start_frame_prompt'];
  const missing = required.filter(k => !parsed[k]);
  if (missing.length) {
    console.error('[tryon-haul] Campos ausentes:', missing);
    throw new Error(`Dados incompletos retornados pela IA. Faltando: ${missing.join(', ')}`);
  }

  sessionTokens.input  += inputTokens;
  sessionTokens.output += outputTokens;

  const { inputCost, outputCost, totalCost } = calcCost(inputTokens, outputTokens);
  const sessionCost = calcCost(sessionTokens.input, sessionTokens.output);

  return {
    _tryon:             true,
    char_description:   parsed.char_description,
    char_hair:          parsed.char_hair,
    char_skin:          parsed.char_skin,
    char_face:          parsed.char_face,
    char_body:          parsed.char_body || '',
    char_full_preserve: parsed.char_full_preserve,
    outfit_detected:    parsed.outfit_detected || '',
    image_type:         parsed.image_type || 'character_sheet',
    environment:        parsed.environment,
    char_sheet_prompt:  parsed.char_sheet_prompt,
    start_frame_prompt: parsed.start_frame_prompt,
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
  res.json({ token, user: {
    id: user.id, email: user.email, is_admin: user.is_admin, name: user.name,
    prompts_count: user.prompts_count || 0, tokens_used: user.tokens_used || 0,
    plan: 'free', plan_active: false, generations_used: 0, generations_limit: 0,
  } });
});

app.post('/api/auth/login', requireSupabase, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  const { data: user } = await supabase
    .from('users')
    .select('id, email, password_hash, is_admin, name, prompts_count, tokens_used, plan, plan_active, generations_used, generations_limit')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos' });

  const token = jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: {
    id: user.id, email: user.email, is_admin: user.is_admin, name: user.name,
    prompts_count: user.prompts_count || 0, tokens_used: user.tokens_used || 0,
    plan: user.plan || 'free',
    plan_active: user.plan_active || false,
    generations_used: user.generations_used || 0,
    generations_limit: user.generations_limit || 0,
  } });
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

// ── EMAIL CHANGE ──

app.patch('/api/users/email', requireSupabase, requireAuth, async (req, res) => {
  const { new_email, password } = req.body;
  if (!new_email || !password) return res.status(400).json({ error: 'Novo email e senha obrigatórios' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) return res.status(400).json({ error: 'Email inválido' });

  // Verifica senha atual
  const { data: user } = await supabase
    .from('users').select('id, password_hash').eq('id', req.user.id).maybeSingle();
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

  // Verifica se novo email já está em uso
  const { data: taken } = await supabase
    .from('users').select('id').eq('email', new_email.toLowerCase()).maybeSingle();
  if (taken) return res.status(409).json({ error: 'Este email já está em uso' });

  // Gera token de confirmação
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

  await supabase.from('users').update({
    email_change_token:   token,
    email_change_new:     new_email.toLowerCase(),
    email_change_expires: expires,
  }).eq('id', user.id);

  const baseUrl   = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const confirmUrl = `${baseUrl}/api/users/confirm-email-change?token=${token}`;

  const mailer = getMailer();
  if (mailer) {
    await mailer.sendMail({
      from: `"UGC·AI" <${process.env.EMAIL_USER}>`,
      to: new_email.toLowerCase(),
      subject: 'Confirme seu novo email — UGC·AI',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#FF6B00">UGC·AI — Confirmar troca de email</h2>
          <p>Clique no botão abaixo para confirmar seu novo email. O link expira em <strong>1 hora</strong>.</p>
          <a href="${confirmUrl}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:#FF6B00;color:white;text-decoration:none;border-radius:10px;font-weight:bold">Confirmar novo email</a>
          <p style="color:#888;font-size:12px">Se você não solicitou isso, ignore este email.</p>
        </div>`
    });
    return res.json({ message: 'Link de confirmação enviado para o novo email.' });
  }

  // Dev sem email — retorna link direto
  res.json({ message: 'Email não configurado. Use o link abaixo.', confirm_link: confirmUrl });
});

app.get('/api/users/confirm-email-change', requireSupabase, async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token ausente.');

  const { data: user } = await supabase
    .from('users')
    .select('id, email_change_token, email_change_new, email_change_expires')
    .eq('email_change_token', token)
    .maybeSingle();

  if (!user) return res.status(400).send('Token inválido ou expirado.');
  if (new Date(user.email_change_expires) < new Date()) return res.status(400).send('Token expirado.');

  const { error } = await supabase.from('users').update({
    email:                user.email_change_new,
    email_change_token:   null,
    email_change_new:     null,
    email_change_expires: null,
  }).eq('id', user.id);

  if (error) return res.status(500).send('Erro ao atualizar email.');
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2 style="color:#FF6B00">Email atualizado com sucesso!</h2><p>Faça login novamente com o novo email.</p></body></html>');
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

// ── WEBHOOK KIWIFY v2 ──
// Rota nova — não toca no /api/webhook/kiwify original.
// Controlada por KIWIFY_WEBHOOK_ENABLED (default false).
// KIWIFY_WEBHOOK_SECRET: configurar no Vercel quando a Kiwify fornecer o segredo.
app.post('/api/webhook/kiwify-v2', requireSupabase, async (req, res) => {
  if (!flags.KIWIFY_WEBHOOK_ENABLED) return res.status(404).end();

  // ── Verificação de assinatura HMAC-SHA256 ──
  // Enquanto KIWIFY_WEBHOOK_SECRET não estiver configurado, a verificação é pulada.
  const KIWIFY_SECRET = process.env.KIWIFY_WEBHOOK_SECRET; // placeholder
  if (KIWIFY_SECRET) {
    const sig      = req.headers['x-kiwify-signature'] || '';
    const expected = crypto.createHmac('sha256', KIWIFY_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (sig !== expected) return res.status(401).json({ error: 'Assinatura inválida' });
  }

  try {
    const body   = req.body;
    const event  = body?.event;
    const status = body?.order_status;
    const email  = (body?.customer?.email || body?.Customer?.email)?.toLowerCase();

    if (!email) return res.status(400).json({ error: 'Email não encontrado no payload' });

    const orderId       = body?.order_id || body?.id || null;
    const amountCents   = body?.Charges?.[0]?.amount || body?.amount || 0;
    const amountBrl     = amountCents / 100;
    const paymentMethod = body?.Charges?.[0]?.payment_method || body?.payment_method || null;

    // ── Ativação de plano ──
    if (event === 'order.approved' || status === 'paid') {
      let config;
      if (body?.product?.name) {
        const productKey = body.product.name.toLowerCase().replace(/ê/g, 'e').replace(/[^a-z]/g, '');
        config = PLAN_CONFIG_BY_NAME[productKey];
      }
      if (!config) config = PLAN_CONFIG_BY_AMOUNT[amountCents];

      if (!config) {
        const productName = body?.product?.name || 'desconhecido';
        console.warn(`[kiwify-v2] Plano não mapeado: "${productName}" — email: ${email}`);
        return res.status(200).json({ message: `Plano "${productName}" não mapeado, ignorado` });
      }

      const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();

      if (existing) {
        await supabase.from('users')
          .update({ plan: config.plan, plan_active: true, generations_limit: config.generations_limit })
          .eq('email', email);
      } else {
        await supabase.from('users').insert({
          email,
          name:          body?.customer?.name || body?.Customer?.name || email,
          password_hash: 'PENDING_REGISTRATION',
          plan:          config.plan,
          plan_active:   true,
          generations_limit: config.generations_limit,
          generations_used:  0,
        });
      }

      // Registra venda — idempotente via kiwify_order_id unique (conflito = duplicata ignorada)
      if (orderId) {
        const { data: user } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
        await supabase.from('sales').upsert({
          kiwify_order_id: orderId,
          user_id:         user?.id       || null,
          email,
          name:            body?.customer?.name || body?.Customer?.name || null,
          plan:            config.plan,
          amount_brl:      amountBrl,
          net_brl:         amountBrl,
          payment_method:  paymentMethod,
          kiwify_event:    event || status,
          raw_payload:     body,
          paid_at:         body?.created_at || new Date().toISOString(),
        }, { onConflict: 'kiwify_order_id', ignoreDuplicates: true });
      }

      console.log(`[kiwify-v2] Plano ${config.plan} ativado para ${email} (${existing ? 'atualizado' : 'pré-criado'})`);
      return res.json({ message: `Plano ${config.plan} ativado`, plan: config.plan, email, created: !existing });

    // ── Cancelamento ──
    } else if (event === 'subscription.cancelled' || status === 'refunded' || status === 'chargedback') {
      await supabase.from('users').update({ plan_active: false }).eq('email', email);
      console.log(`[kiwify-v2] Plano desativado para ${email} (${event || status})`);
      return res.json({ message: 'Plano desativado', email });

    } else {
      return res.status(200).json({ message: `Evento "${event || status || 'desconhecido'}" ignorado` });
    }
  } catch (err) {
    console.error('[kiwify-v2] Erro:', err.message);
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

  // ── Base v2 — detecta nicho, sorteia 1 personagem + cenário, carrega banco de frases ──
  let extrasV2 = null;
  if (style === 'base-v2') {
    const { history_chars = [] } = req.body;
    const nicho = await detectarNicho(image_base64, image_type);
    const nichoConfig = NICHOS_V2[nicho] || NICHOS_V2.generico;

    // Sortear 1 personagem (anti-repetição por history)
    const allChars = nichoConfig.pools.flatMap(pool => listPoolIds(pool));
    const [char]   = pickRandom(allChars, 1, history_chars);

    // Sortear 1 cenário
    const cenarios = nichoConfig.cenarios || ['sala de estar casual, sofá, iluminação quente'];
    const cenario  = cenarios[Math.floor(Math.random() * cenarios.length)];

    // Carregar banco completo de frases como âncora de tom (não literal)
    const frasesAncora = loadFrasesNicho(nichoConfig.frasesFile);

    extrasV2 = { nicho, char, cenario, frasesAncora };
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
    } else if (style === 'tryon-haul') {
      const tryonPersonagemId = req.body.personagem_id || null;
      const tryonModo         = req.body.modo || 'custom';
      result = await callClaudeTryon(image_base64, image_type, tryonPersonagemId, tryonModo);
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

    await recordCost(supabase, { user_id: req.user.id, endpoint: '/api/generate', style, model: 'claude-sonnet-4-6', input_tokens: result._usage?.input_tokens, output_tokens: result._usage?.output_tokens });
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
  let batchPrompts      = 0;
  let batchTokens       = 0;
  let batchInputTokens  = 0;
  let batchOutputTokens = 0;

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
        batchInputTokens  += result._usage.input_tokens  || 0;
        batchOutputTokens += result._usage.output_tokens || 0;
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
        batchInputTokens  += result._usage.input_tokens  || 0;
        batchOutputTokens += result._usage.output_tokens || 0;
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

  await recordCost(supabase, { user_id: req.user.id, endpoint: '/api/generate-batch', style, model: 'claude-sonnet-4-6', input_tokens: batchInputTokens, output_tokens: batchOutputTokens });
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

app.patch('/api/gallery/:id', requireSupabase, requireAuth, async (req, res) => {
  const { prompt_video } = req.body;
  if (!prompt_video) return res.status(400).json({ error: 'prompt_video is required' });

  const { data, error } = await supabase
    .from('gallery')
    .update({ prompt_video })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

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

// ── BIBLIOTECA CUSTOM (leitura pública, escrita/deleção protegida por senha admin) ──
const BIBLIOTECA_ADMIN_KEY = process.env.BIBLIOTECA_ADMIN_KEY || 'ugc2026';

function requireBibliotecaAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== BIBLIOTECA_ADMIN_KEY) {
    return res.status(401).json({ error: 'Admin key inválida' });
  }
  next();
}

// Lista — metadados + imagem_url (sem imagem_base64 — JSON leve)
app.get('/api/biblioteca/custom', requireSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from('biblioteca_custom')
    .select('id, created_at, categoria_slug, categoria, categoria_icone, nome_arquivo, prompt, imagem_url')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  // Deduplicação por id (segurança contra registros duplicados no banco)
  const seen = new Set();
  const deduped = (data || []).filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
  res.json(deduped);
});

// Imagem — redirect para Supabase Storage (novos) ou serve base64 legado
app.get('/api/biblioteca/custom/:id/image', requireSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from('biblioteca_custom')
    .select('imagem_base64, imagem_mime, imagem_url')
    .eq('id', req.params.id)
    .single();
  if (error || (!data?.imagem_base64 && !data?.imagem_url)) return res.status(404).send('Not found');

  // Registros novos: redirect para URL pública do Supabase Storage
  if (data.imagem_url) {
    return res.redirect(302, data.imagem_url);
  }

  // Registros legados: serve base64 como buffer
  const buf = Buffer.from(data.imagem_base64, 'base64');
  res.setHeader('Content-Type', data.imagem_mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.send(buf);
});

app.post('/api/biblioteca/custom', requireSupabase, requireBibliotecaAdmin, upload.single('imagem'), async (req, res) => {
  const item = req.body;
  if (!item?.prompt) return res.status(400).json({ error: 'Campo prompt obrigatório' });

  // Checa duplicata por nome_arquivo + categoria_slug
  if (item.nome_arquivo) {
    const { data: dup } = await supabase
      .from('biblioteca_custom')
      .select('id')
      .eq('nome_arquivo', item.nome_arquivo)
      .eq('categoria_slug', item.categoria_slug || 'ugc-produtos')
      .maybeSingle();
    if (dup) return res.status(409).json({ error: 'Prompt duplicado' });
  }

  let imagem_url   = null;
  let imagem_base64 = item.imagem_base64 || null; // caminho legado (migração localStorage)
  let imagem_mime  = item.imagem_mime   || null;

  // Novo caminho: FormData com arquivo em alta resolução
  if (req.file) {
    try {
      const mime     = req.file.mimetype;
      const ext      = mime.split('/')[1] || 'jpg';
      const filePath = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('biblioteca-imgs')
        .upload(filePath, req.file.buffer, { contentType: mime, upsert: false });

      if (uploadError) {
        console.error('[biblioteca POST] Storage upload error:', uploadError.message);
      } else {
        const { data: urlData } = supabase.storage.from('biblioteca-imgs').getPublicUrl(filePath);
        imagem_url    = urlData.publicUrl;
        imagem_base64 = null; // não duplicar base64 quando temos URL
        imagem_mime   = null;
      }
    } catch (e) {
      console.error('[biblioteca POST] erro no upload da imagem:', e.message);
    }
  }

  const newItem = {
    id:              Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    created_at:      new Date().toISOString(),
    categoria_slug:  item.categoria_slug  || 'ugc-produtos',
    categoria:       item.categoria       || '',
    categoria_icone: item.categoria_icone || '',
    nome_arquivo:    item.nome_arquivo    || 'Novo Prompt',
    prompt:          item.prompt,
    imagem_base64,
    imagem_mime,
    imagem_url,
  };

  const { data, error } = await supabase.from('biblioteca_custom').insert(newItem).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/biblioteca/custom/:id', requireSupabase, requireBibliotecaAdmin, async (req, res) => {
  // Busca imagem_url antes de deletar para limpar o Storage
  const { data: record } = await supabase
    .from('biblioteca_custom')
    .select('imagem_url')
    .eq('id', req.params.id)
    .single();

  const { error } = await supabase
    .from('biblioteca_custom')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  // Deleta imagem do Supabase Storage (se existir)
  if (record?.imagem_url) {
    try {
      const url = new URL(record.imagem_url);
      const marker = '/object/public/biblioteca-imgs/';
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        const filePath = url.pathname.slice(idx + marker.length);
        await supabase.storage.from('biblioteca-imgs').remove([filePath]);
      }
    } catch (e) {
      console.error('[biblioteca DELETE] erro ao deletar imagem do Storage:', e.message);
    }
  }

  res.json({ ok: true });
});

// Migração: base64 antigos → Supabase Storage (roda uma vez pelo admin)
app.post('/api/biblioteca/admin/migrate-images', requireSupabase, requireBibliotecaAdmin, async (req, res) => {
  const { data: records, error } = await supabase
    .from('biblioteca_custom')
    .select('id, imagem_base64, imagem_mime')
    .not('imagem_base64', 'is', null);

  if (error) return res.status(500).json({ error: error.message });
  if (!records || records.length === 0) return res.json({ migrated: 0, message: 'Nenhum registro com imagem_base64 encontrado' });

  let migrated = 0;
  const errors = [];

  for (const record of records) {
    try {
      const buf  = Buffer.from(record.imagem_base64, 'base64');
      const mime = record.imagem_mime || 'image/jpeg';
      const ext  = mime.split('/')[1] || 'jpg';
      const filePath = `migrated-${record.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('biblioteca-imgs')
        .upload(filePath, buf, { contentType: mime, upsert: true });

      if (uploadError) { errors.push({ id: record.id, error: uploadError.message }); continue; }

      const { data: urlData } = supabase.storage.from('biblioteca-imgs').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('biblioteca_custom')
        .update({ imagem_url: urlData.publicUrl, imagem_base64: null, imagem_mime: null })
        .eq('id', record.id);

      if (updateError) { errors.push({ id: record.id, error: updateError.message }); }
      else { migrated++; }
    } catch (e) { errors.push({ id: record.id, error: e.message }); }
  }

  res.json({ migrated, total: records.length, errors });
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

// ── BIBLIOTECA DE PROMPTS ──
app.get('/biblioteca', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'biblioteca.html'));
});

app.get('/biblioteca/prompts.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'biblioteca', 'prompts.json'));
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

// ── HEALTH CHECK ──
// Público — sem feature flag. Usado pelo CI/CD para validar deploys.
// Testa Anthropic (1 token, modelo mais barato) e Supabase (1 row read).
app.get('/api/health', async (req, res) => {
  const checks = { server: 'ok', anthropic: 'unknown', supabase: 'unknown' };

  await Promise.allSettled([
    (async () => {
      try {
        const r = await Promise.race([
          fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': (process.env.ANTHROPIC_API_KEY || '').trim(),
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'ping' }],
            }),
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
        ]);
        checks.anthropic = r.ok ? 'ok' : 'fail';
      } catch { checks.anthropic = 'fail'; }
    })(),

    (async () => {
      try {
        if (!supabase) { checks.supabase = 'unconfigured'; return; }
        const { error } = await supabase.from('users').select('id').limit(1);
        checks.supabase = error ? 'fail' : 'ok';
      } catch { checks.supabase = 'fail'; }
    })(),
  ]);

  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json({ checks, ts: Date.now() });
});

// ── ADMIN ENDPOINTS ──
app.use('/api/admin', require('./routes/admin')(supabase));

// ── ADMIN SPA ──
// Serve public/admin/index.html para qualquer rota /admin/* (SPA routing)
// Cache-Control: no-cache garante que o browser sempre busca o HTML atualizado
// (os assets JS/CSS têm hash no nome e podem ser cacheados indefinidamente)
const adminHtml = path.join(__dirname, 'public/admin/index.html');
const adminNoCacheOpts = { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } };
app.get('/admin',   (req, res) => res.sendFile(adminHtml, adminNoCacheOpts));
app.get('/admin/*', (req, res) => res.sendFile(adminHtml, adminNoCacheOpts));

// ── TRACKER ──
// POST /tracker — recebe PageView e eventos customizados do frontend.
// Fire-and-forget: responde 204 imediatamente, grava em background.
app.post('/tracker', (req, res) => {
  res.status(204).end();
  if (!flags.TRACKER_ENABLED) return;

  const {
    trk, session_id, event_name, page_url, referrer,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    user_id, properties,
  } = req.body || {};

  const ip         = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
  const user_agent = req.headers['user-agent'];

  tracker.trackSession(supabase, { trk, user_id, page_url, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ip, user_agent });
  tracker.trackEvent(supabase, { session_id, trk, user_id, event_name: event_name || 'PageView', page_url, properties });
});

// POST /checkout-session — usuário iniciou fluxo de checkout.
// Registra evento 'Checkout' com o plano escolhido.
app.post('/checkout-session', (req, res) => {
  res.status(204).end();
  if (!flags.TRACKER_ENABLED) return;

  const { trk, session_id, user_id, plan, page_url } = req.body || {};

  tracker.trackEvent(supabase, {
    session_id,
    trk,
    user_id,
    event_name: 'Checkout',
    page_url,
    properties: { plan: plan || null },
  });
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
