// lib/require-admin.js
// Middleware para rotas do painel admin.
// Verifica: 1) flag ADMIN_ENABLED  2) JWT válido  3) is_admin = true no token

const jwt    = require('jsonwebtoken');
const flags  = require('./feature-flags');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-change-me';

function requireAdmin(req, res, next) {
  if (!flags.ADMIN_ENABLED) return res.status(404).end();

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const user = jwt.verify(auth.slice(7), JWT_SECRET);
    if (!user.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = { requireAdmin };
