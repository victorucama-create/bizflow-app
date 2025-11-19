// services/auth.js - ATUALIZADO PARA FASE 5 COMPLETA
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryWithMetrics, logger } from '../core/server.js';
import CacheService from './cache-service.js';

class AuthService {
  // ✅ LOGIN COM CACHE SERVICE
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

  // ✅ VALIDAR TOKEN COM CACHE SERVICE
  async validateToken(token) {
    try {
      if (!token) {
        throw new Error('Token não fornecido');
      }

      // ✅ TENTAR CACHE SERVICE PRIMEIRO
      const userSession = await CacheService.getSession(token);
      
      if (userSession) {
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
      
      return user;

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.validateToken' });
      throw error;
    }
  }

  // ✅ LOGOUT COM CACHE SERVICE
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

  // ✅ ATUALIZAR SENHA
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

      // Hash da nova senha
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Atualizar senha
      await queryWithMetrics(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, userId],
        'update',
        'users'
      );

      logger.authLog('Senha atualizada', { userId });

      return { success: true, message: 'Senha atualizada com sucesso' };

    } catch (error) {
      logger.errorLog(error, { context: 'AuthService.updatePassword' });
      throw error;
    }
  }
}

export default new AuthService();
