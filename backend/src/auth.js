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

let googlePublicKeys = null;
let googleKeysExpires = 0;

async function getGooglePublicKeys() {
  const now = Date.now();
  if (googlePublicKeys && now < googleKeysExpires) {
    return googlePublicKeys;
  }
  try {
    const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (!res.ok) throw new Error('Failed to fetch Google public keys');
    const keys = await res.json();
    
    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600000;
    
    googlePublicKeys = keys;
    googleKeysExpires = now + maxAge;
    return googlePublicKeys;
  } catch (err) {
    console.error('Error fetching Google public keys:', err);
    return googlePublicKeys || {};
  }
}

async function verifyFirebaseToken(token) {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.payload) return null;
    
    const kid = decoded.header.kid;
    const iss = decoded.payload.iss;
    const aud = decoded.payload.aud;
    
    const projectId = 'network-monitor-36186';
    if (iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (aud !== projectId) return null;
    
    const publicKeys = await getGooglePublicKeys();
    const cert = publicKeys[kid];
    if (!cert) return null;
    
    return jwt.verify(token, cert, { algorithms: ['RS256'] });
  } catch (err) {
    console.warn('Firebase token verification failed:', err);
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  
  try {
    // 1. Try local JWT verify first
    try {
      req.user = jwt.verify(token, config.jwtSecret);
      return next();
    } catch (localErr) {
      // 2. Fallback to verifying as a Firebase ID token
      const fbPayload = await verifyFirebaseToken(token);
      if (fbPayload && fbPayload.email) {
        const { rows } = await query(
          `SELECT u.id, u.email, u.full_name, r.name AS role, r.permissions
           FROM app_users u
           LEFT JOIN roles r ON r.id = u.role_id
           WHERE u.email = $1 AND u.active = true`,
          [fbPayload.email.toLowerCase()]
        );
        const user = rows[0];
        if (user) {
          req.user = {
            sub: user.id,
            email: user.email,
            role: user.role,
            permissions: user.permissions || []
          };
          return next();
        } else {
          // SEGURIDAD: Rechazar usuarios no registrados en la base de datos
          return res.status(401).json({ 
            error: 'Usuario no registrado en el sistema. Contacte al administrador.' 
          });
        }
      }
      throw new Error('Sesion invalida');
    }
  } catch (err) {
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
