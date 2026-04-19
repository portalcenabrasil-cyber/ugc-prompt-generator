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
const { createClient } = require('@supabase/supabase-js');

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
async function _saveGalleryItem(userId, result, image_base64, image_type, price, tipo) {
  if (!supabase || !result?.prompt_video) return null;
  const newItem = {
    id:           Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    user_id:      userId,
    created_at:   new Date().toISOString(),
    image:        image_base64 ? `data:${image_type};base64,${image_base64}` : null,
    prompt_video: result.prompt_video || null,
    legenda:      result.legenda      || null,
    nicho:        result.nicho        || null,
    emocao:       result.emocao       || null,
    tipo:         tipo                || null,
    price:        price               || null,
    cost:         result._usage       || null,
  };
  try {
    const { data, error } = await supabase.from('gallery').insert(newItem).select().single();
    if (error) { console.error('Gallery save error:', error.message); return null; }
    return data;
  } catch (e) { console.error('Gallery save exception:', e.message); return null; }
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

const SYSTEM_PROMPT = `Você é um especialista em criação de UGC (User Generated Content) autêntico para TikTok Shop e Instagram Reels no mercado brasileiro.

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

function buildUserMessage(tipo, promo, price, gender) {
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

  return `Analise a imagem do produto e gere conteúdo UGC para o mercado brasileiro.

CONFIGURAÇÕES:
- Tipo de vídeo: ${tipoLabels[tipo] || tipo}
- Promoção ativa: ${promoLabels[promo] || promo}
${precoInfo}
- Gênero do criador: ${genderLabels[gender] || gender}

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

// Parseia JSON tolerando newlines literais dentro de strings (Claude às vezes os gera)
function safeParseJSON(str) {
  try { return JSON.parse(str); } catch (_) {}
  // Percorre char a char e escapa chars de controle dentro de strings JSON
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (esc) { out += c; esc = false; continue; }
    if (c === '\\' && inStr) { out += c; esc = true; continue; }
    if (c === '"') { inStr = !inStr; out += c; continue; }
    if (inStr) {
      if      (c === '\n') { out += '\\n'; continue; }
      else if (c === '\r') { out += '\\r'; continue; }
      else if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  return JSON.parse(out);
}

async function callClaude(image_base64, image_type, tipo, promo, price, gender) {
  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
      await new Promise(r => setTimeout(r, delay));
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: image_type || 'image/jpeg', data: image_base64 }
            },
            {
              type: 'text',
              text: buildUserMessage(tipo, promo, price, gender)
            }
          ]
        }]
      })
    });

    const data = await response.json();

    // Retry on overload (529) or server errors (5xx)
    if (response.status === 529 || (response.status >= 500 && attempt < MAX_RETRIES - 1)) {
      lastError = new Error(data.error?.message || 'Servidor sobrecarregado. Tente novamente.');
      continue;
    }

    if (!response.ok) throw new Error(data.error?.message || 'Erro na API Claude');

    const rawText = data.content[0].text.trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta inesperada da API');

    const inputTokens  = data.usage?.input_tokens  || 0;
    const outputTokens = data.usage?.output_tokens || 0;

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
  const { data: user, error } = await supabase
    .from('users')
    .insert({ email: email.toLowerCase(), password_hash, name: name?.trim() || null, accepted_terms_at: new Date().toISOString() })
    .select('id, email, is_admin, name, prompts_count, tokens_used')
    .single();

  if (error) return res.status(500).json({ error: 'Erro ao criar conta' });

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
  if (existing) return res.json({ message: 'Admin já existe', id: existing.id });

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
  const { image_base64, image_type, tipo, promo, price, gender } = req.body;

  if (!image_base64) return res.status(400).json({ error: 'Imagem é obrigatória' });
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
    const result = await callClaude(image_base64, image_type, tipo, promo, price, gender);

    // Save to gallery server-side immediately
    const galleryItem = await _saveGalleryItem(req.user.id, result, image_base64, image_type, price, tipo);

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
  const { items, tipo, promo, gender, jobIds } = req.body;
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
        return await callClaude(image_base64, image_type, tipo, promo, price, gender);
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

      const galleryItem = await _saveGalleryItem(req.user.id, result, image_base64, image_type, price, tipo);
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
      const result = await callClaude(image_base64, image_type, tipo, promo, price, gender);
      if (result._usage) {
        batchPrompts++;
        batchTokens += (result._usage.input_tokens || 0) + (result._usage.output_tokens || 0);
      }
      const galleryItem = await _saveGalleryItem(req.user.id, result, image_base64, image_type, price, tipo);
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
    supabase.from('gallery').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id),
    supabase.from('gallery').select('*').eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
  ]);

  if (dataRes.error) return res.status(500).json({ error: dataRes.error.message });
  res.json({ items: dataRes.data || [], total: countRes.count || 0 });
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`UGC Prompt Generator rodando em http://localhost:${PORT}`);
});
