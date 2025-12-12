/**
 * Controller de Autenticação
 * Registro, Login e gestão de sessão
 */

import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../middleware/auth.js';

const SALT_ROUNDS = 10;

const authController = {
  /**
   * POST /api/auth/register
   * Registra novo usuário
   * Body: { email, password, name? }
   */
  async register(req, res) {
    try {
      const { email, password, name } = req.body;

      // Validações
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email e senha são obrigatórios',
          code: 'MISSING_FIELDS'
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Senha deve ter pelo menos 6 caracteres',
          code: 'WEAK_PASSWORD'
        });
      }

      // Verifica se email já existe
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email já cadastrado',
          code: 'EMAIL_EXISTS'
        });
      }

      // Hash da senha
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Cria usuário
      const user = await User.create({
        email,
        password_hash: passwordHash,
        name: name || email.split('@')[0]
      });

      // Gera token
      const token = generateToken(user);

      return res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            created_at: user.created_at
          },
          token
        }
      });
    } catch (error) {
      console.error('Erro no registro:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao registrar usuário'
      });
    }
  },

  /**
   * POST /api/auth/login
   * Login de usuário
   * Body: { email, password }
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validações
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email e senha são obrigatórios',
          code: 'MISSING_FIELDS'
        });
      }

      // Busca usuário
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Email ou senha incorretos',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Verifica se tem password_hash (usuários antigos podem não ter)
      if (!user.password_hash) {
        return res.status(401).json({
          success: false,
          error: 'Conta sem senha definida. Use o registro para criar uma senha.',
          code: 'NO_PASSWORD'
        });
      }

      // Verifica senha
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Email ou senha incorretos',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Gera token
      const token = generateToken(user);

      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            created_at: user.created_at
          },
          token
        }
      });
    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao fazer login'
      });
    }
  },

  /**
   * GET /api/auth/me
   * Retorna dados do usuário autenticado
   * Requer: Authorization header
   */
  async me(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado',
          code: 'USER_NOT_FOUND'
        });
      }

      return res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at
        }
      });
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar dados do usuário'
      });
    }
  },

  /**
   * POST /api/auth/refresh
   * Renova o token JWT
   * Requer: Authorization header
   */
  async refresh(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado',
          code: 'USER_NOT_FOUND'
        });
      }

      const token = generateToken(user);

      return res.json({
        success: true,
        data: { token }
      });
    } catch (error) {
      console.error('Erro ao renovar token:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao renovar token'
      });
    }
  },

  /**
   * PUT /api/auth/password
   * Atualiza senha do usuário
   * Body: { currentPassword, newPassword }
   */
  async updatePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Senha atual e nova senha são obrigatórias',
          code: 'MISSING_FIELDS'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Nova senha deve ter pelo menos 6 caracteres',
          code: 'WEAK_PASSWORD'
        });
      }

      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }

      // Verifica senha atual
      if (user.password_hash) {
        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
          return res.status(401).json({
            success: false,
            error: 'Senha atual incorreta',
            code: 'WRONG_PASSWORD'
          });
        }
      }

      // Hash da nova senha
      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      
      // Atualiza no banco
      await User.updatePassword(user.id, passwordHash);

      return res.json({
        success: true,
        message: 'Senha atualizada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao atualizar senha:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar senha'
      });
    }
  }
};

export default authController;




