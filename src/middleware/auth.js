/**
 * Middleware de Autenticação JWT
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-aqui-mude-em-producao';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Gera um token JWT para o usuário
 */
export function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      name: user.name 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verifica e decodifica um token JWT
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Middleware que exige autenticação
 * Adiciona req.user com dados do usuário
 */
export function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token não fornecido',
        code: 'NO_TOKEN'
      });
    }

    // Formato: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token mal formatado',
        code: 'MALFORMED_TOKEN'
      });
    }

    const token = parts[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token inválido ou expirado',
        code: 'INVALID_TOKEN'
      });
    }

    // Adiciona dados do usuário ao request
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Erro no middleware de auth:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erro interno de autenticação' 
    });
  }
}

/**
 * Middleware opcional de autenticação
 * Adiciona req.user se token válido, mas não bloqueia
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const decoded = verifyToken(parts[1]);
        if (decoded) {
          req.user = decoded;
        }
      }
    }
    
    next();
  } catch (error) {
    next();
  }
}

export default {
  generateToken,
  verifyToken,
  requireAuth,
  optionalAuth,
  JWT_SECRET,
  JWT_EXPIRES_IN
};




