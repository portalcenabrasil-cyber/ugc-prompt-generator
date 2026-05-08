// lib/tracker.js
// Sub-fase 1.2 — Tracker de sessões e eventos.
// Fire-and-forget: todas as funções retornam imediatamente, nunca lançam exceção.
// Controlado por TRACKER_ENABLED (default true). Kill switch: TRACKER_ENABLED=false no Vercel.

const crypto = require('crypto');
const flags  = require('./feature-flags');

function hashValue(val) {
  if (!val) return null;
  return crypto.createHash('sha256').update(String(val)).digest('hex').slice(0, 16);
}

function detectDevice(ua = '') {
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'mobile';
  if (/tablet/i.test(ua))                      return 'tablet';
  return 'desktop';
}

// Insere nova row em `sessions`.
// Uma row por page-load — granularidade intencional para análise de jornada.
async function trackSession(supabase, { trk, user_id, page_url, referrer,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term, ip, user_agent }) {
  if (!flags.TRACKER_ENABLED || !supabase || !trk) return;
  try {
    await supabase.from('sessions').insert({
      trk,
      user_id:         user_id         || null,
      page_url:        page_url        || null,
      referrer:        referrer        || null,
      utm_source:      utm_source      || null,
      utm_medium:      utm_medium      || null,
      utm_campaign:    utm_campaign    || null,
      utm_content:     utm_content     || null,
      utm_term:        utm_term        || null,
      ip_hash:         hashValue(ip),
      user_agent_hash: hashValue(user_agent),
      device_type:     detectDevice(user_agent),
    });
  } catch { /* silencioso — nunca bloqueia request */ }
}

// Insere evento em `events`. session_id é referência soft (sem FK hard no schema).
async function trackEvent(supabase, { session_id, trk, user_id, event_name, page_url, properties }) {
  if (!flags.TRACKER_ENABLED || !supabase || !trk || !event_name) return;
  try {
    await supabase.from('events').insert({
      session_id: session_id || null,
      trk,
      user_id:    user_id    || null,
      event_name,
      page_url:   page_url   || null,
      properties: properties || null,
    });
  } catch { /* silencioso */ }
}

module.exports = { trackSession, trackEvent };
