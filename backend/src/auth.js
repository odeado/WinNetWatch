import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

export async function login(email, password) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.password_hash, u.full_name, r.name AS role, r.permissions
     FROM app_users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1 AND u.active = true`,
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return null;
  }
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, permissions: user.permissions || [] },
    config.jwtSecret,
    { expiresIn: '10h' }
  );
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      permissions: user.permissions || []
    }
  };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesion invalida' });
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = req.user?.permissions || [];
    if (permissions.includes('*') || permissions.includes(permission)) return next();
    return res.status(403).json({ error: 'Permiso insuficiente' });
  };
}
