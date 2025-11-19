// services/auth.js - SISTEMA BIZFLOW FASE 5 COMPLETA - VERSÃO COMPLETA
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryWithMetrics, logger } from '../core/server.js';
import CacheService from './cache-service.js';

class AuthService {
  // ✅ LOGIN COM CACHE SERVICE - COMPLETO
  async login(username, password) {
    try {
      logger.authLog('Tentativa de login', { username });

      // Validar inputs
      if (!username || !password) {
        throw new Error('Username e password são obrigatórios');
      }

      // Buscar usuário
      const userResult = await queryWithMetrics(
        `SELECT id, username, email, password_hash, full_name, role, empresa_id 
         FROM users 
         WHERE username = $1 AND is_active = true 
         LIMIT 1`,
        [username],
        'select',
        'users'
      );

      if (userResult.rows.length === 0) {
        logger.authLog('Usuário não encontrado', { username });
        throw new Error('Credenciais inválidas');
      }

      const user = userResult.rows[0];

      // Verificar senha
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        logger.authLog('Senha inválida', { username });
        throw new Error('Credenciais inválidas');
      }

      // Gerar token de sessão seguro
      const sessionToken = this.generateSecureToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Salvar sessão no banco
      await queryWithMetrics(
        `INSERT INTO user_sessions (user_id, session_token, expires_at) 
         VALUES ($1, $2, $3)`,
        [user.id, sessionToken, expiresAt],
        'insert',
        'user_sessions'
      );

      // ✅ USAR CACHE SERVICE PARA SESSÃO
      await CacheService.cacheSession(sessionToken, user);

      // Remover password hash da resposta
      const { password_hash, ...userWithoutPassword } = user;

      logger.authLog('Login realizado com sucesso', { 
        userId: user.id, 
        username: user.username,
        role: user.role 
      });

      return {
        user: userWithoutPassword,
        session_token: sessionToken,
        expires_at: expiresAt
      };

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.login' });
      throw error;
    }
  }

  // ✅ VALIDAR TOKEN COM CACHE SERVICE - COMPLETO
  async validateToken(token) {
    try {
      if (!token) {
        throw new Error('Token não fornecido');
      }

      // ✅ TENTAR CACHE SERVICE PRIMEIRO
      const userSession = await CacheService.getSession(token);
      
      if (userSession) {
        logger.cacheLog('Sessão encontrada no cache', true, { token: token.substring(0, 10) + '...' });
        return userSession;
      }

      // Buscar do banco se não encontrou no cache
      const sessionResult = await queryWithMetrics(
        `SELECT u.*, us.expires_at 
         FROM user_sessions us 
         JOIN users u ON us.user_id = u.id 
         WHERE us.session_token = $1 AND us.expires_at > NOW() AND u.is_active = true`,
        [token],
        'select',
        'user_sessions'
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Sessão expirada ou inválida');
      }

      const user = sessionResult.rows[0];
      
      // ✅ SALVAR NO CACHE SERVICE
      await CacheService.cacheSession(token, user);
      
      logger.authLog('Sessão validada e cacheadada', { 
        userId: user.id,
        username: user.username 
      });

      return user;

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.validateToken' });
      throw error;
    }
  }

  // ✅ LOGOUT COM CACHE SERVICE - COMPLETO
  async logout(token) {
    try {
      if (!token) {
        return;
      }

      // ✅ REMOVER DO CACHE SERVICE
      await CacheService.deleteSession(token);
      
      // Invalidar sessão no banco
      await queryWithMetrics(
        'DELETE FROM user_sessions WHERE session_token = $1',
        [token],
        'delete',
        'user_sessions'
      );

      logger.authLog('Logout realizado', { token: token.substring(0, 10) + '...' });

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.logout' });
      throw error;
    }
  }

  // ✅ GERAR TOKEN SEGURO
  generateSecureToken() {
    return 'bizflow_' + Date.now() + '_' + crypto.randomBytes(32).toString('hex');
  }

  // ✅ VERIFICAR PERMISSÕES
  hasPermission(user, requiredRole) {
    const roleHierarchy = {
      'user': 1,
      'manager': 2,
      'admin': 3
    };

    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
  }

  // ✅ ATUALIZAR SENHA - COMPLETO
  async updatePassword(userId, currentPassword, newPassword) {
    try {
      // Buscar usuário
      const userResult = await queryWithMetrics(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId],
        'select',
        'users'
      );

      if (userResult.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      const user = userResult.rows[0];

      // Verificar senha atual
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      
      if (!isValidPassword) {
        throw new Error('Senha atual incorreta');
      }

      // Validar nova senha
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.error);
      }

      // Hash da nova senha
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Atualizar senha
      await queryWithMetrics(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, userId],
        'update',
        'users'
      );

      // Invalidar todas as sessões do usuário
      await this.invalidateUserSessions(userId);

      logger.authLog('Senha atualizada com sucesso', { userId });

      return { 
        success: true, 
        message: 'Senha atualizada com sucesso. Todas as sessões foram invalidadas.' 
      };

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.updatePassword' });
      throw error;
    }
  }

  // ✅ VALIDAR FORÇA DA SENHA
  validatePasswordStrength(password) {
    const checks = {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };

    const isValid = Object.values(checks).every(Boolean);
    const missing = Object.keys(checks).filter(key => !checks[key]);

    return {
      isValid,
      error: isValid ? null : `Senha fraca. Requisitos: ${missing.join(', ')}`,
      checks
    };
  }

  // ✅ INVALIDAR TODAS AS SESSÕES DO USUÁRIO
  async invalidateUserSessions(userId) {
    try {
      // Buscar todos os tokens do usuário
      const sessionsResult = await queryWithMetrics(
        'SELECT session_token FROM user_sessions WHERE user_id = $1',
        [userId],
        'select',
        'user_sessions'
      );

      // Remover do cache
      for (const session of sessionsResult.rows) {
        await CacheService.deleteSession(session.session_token);
      }

      // Remover do banco
      await queryWithMetrics(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId],
        'delete',
        'user_sessions'
      );

      logger.authLog('Todas as sessões do usuário invalidadas', { userId });

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.invalidateUserSessions' });
      throw error;
    }
  }

  // ✅ CRIAR USUÁRIO - COMPLETO
  async createUser(userData) {
    try {
      const { username, email, password, full_name, role = 'user', empresa_id = 1 } = userData;

      // Validar dados
      if (!username || !email || !password || !full_name) {
        throw new Error('Todos os campos obrigatórios devem ser preenchidos');
      }

      // Validar email
      const emailValidation = this.validateEmail(email);
      if (!emailValidation.isValid) {
        throw new Error(emailValidation.error);
      }

      // Validar senha
      const passwordValidation = this.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.error);
      }

      // Verificar se usuário já existe
      const existingUser = await queryWithMetrics(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email],
        'select',
        'users'
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Username ou email já cadastrado');
      }

      // Hash da senha
      const passwordHash = await bcrypt.hash(password, 12);

      // Inserir usuário
      const result = await queryWithMetrics(
        `INSERT INTO users (empresa_id, username, email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, username, email, full_name, role, empresa_id, created_at`,
        [empresa_id, username, email, passwordHash, full_name, role],
        'insert',
        'users'
      );

      logger.authLog('Usuário criado com sucesso', { 
        userId: result.rows[0].id, 
        username: result.rows[0].username 
      });

      return result.rows[0];

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.createUser' });
      throw error;
    }
  }

  // ✅ VALIDAR EMAIL
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    return {
      isValid,
      error: isValid ? null : 'Email inválido',
      normalized: isValid ? email.toLowerCase() : null
    };
  }

  // ✅ RENOVAR SESSÃO
  async renewSession(token) {
    try {
      const user = await this.validateToken(token);
      
      if (!user) {
        throw new Error('Sessão inválida');
      }

      // Nova expiração
      const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Atualizar no banco
      await queryWithMetrics(
        'UPDATE user_sessions SET expires_at = $1, updated_at = CURRENT_TIMESTAMP WHERE session_token = $2',
        [newExpiresAt, token],
        'update',
        'user_sessions'
      );

      // Atualizar no cache
      await CacheService.cacheSession(token, user);

      logger.authLog('Sessão renovada', { 
        userId: user.id,
        username: user.username 
      });

      return {
        success: true,
        expires_at: newExpiresAt,
        message: 'Sessão renovada com sucesso'
      };

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.renewSession' });
      throw error;
    }
  }

  // ✅ LISTAR SESSÕES ATIVAS (APENAS ADMIN)
  async getActiveSessions(userId, requesterRole) {
    try {
      if (requesterRole !== 'admin') {
        throw new Error('Acesso negado. Apenas administradores podem ver sessões ativas.');
      }

      const sessions = await queryWithMetrics(
        `SELECT 
          us.session_token,
          us.expires_at,
          us.created_at,
          u.username,
          u.full_name,
          u.role
         FROM user_sessions us
         JOIN users u ON us.user_id = u.id
         WHERE us.expires_at > NOW()
         ORDER BY us.expires_at DESC`,
        [],
        'select',
        'user_sessions'
      );

      return sessions.rows.map(session => ({
        ...session,
        session_token: session.session_token.substring(0, 10) + '...' // Mask token
      }));

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.getActiveSessions' });
      throw error;
    }
  }
}

export default new AuthService();
