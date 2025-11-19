// services/auth.js - SISTEMA BIZFLOW FASE 5 COMPLETA
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryWithMetrics, redis, logger } from '../core/server.js';

class AuthService {
  // ✅ LOGIN COM CACHE E MÉTRICAS
  async login(username, password) {
    try {
      logger.info('Tentativa de login:', { username });

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
        logger.warn('Usuário não encontrado:', username);
        throw new Error('Credenciais inválidas');
      }

      const user = userResult.rows[0];

      // Verificar senha
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        logger.warn('Senha inválida para usuário:', username);
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

      // Salvar sessão no cache Redis (1 hora)
      const cacheKey = `session:${sessionToken}`;
      await redis.setex(cacheKey, 3600, JSON.stringify(user));

      // Remover password hash da resposta
      const { password_hash, ...userWithoutPassword } = user;

      logger.info('Login realizado com sucesso:', { 
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
      logger.error('Erro no serviço de auth:', error);
      throw error;
    }
  }

  // ✅ VALIDAR TOKEN COM CACHE
  async validateToken(token) {
    try {
      if (!token) {
        throw new Error('Token não fornecido');
      }

      // Tentar buscar do cache primeiro
      const cacheKey = `session:${token}`;
      let userSession = await redis.get(cacheKey);
      
      if (userSession) {
        return JSON.parse(userSession);
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
      
      // Salvar no cache por 1 hora
      await redis.setex(cacheKey, 3600, JSON.stringify(user));
      
      return user;

    } catch (error) {
      logger.error('Erro na validação do token:', error);
      throw error;
    }
  }

  // ✅ LOGOUT COM LIMPEZA DE CACHE
  async logout(token) {
    try {
      if (!token) {
        return;
      }

      // Remover do cache
      await redis.del(`session:${token}`);
      
      // Invalidar sessão no banco
      await queryWithMetrics(
        'DELETE FROM user_sessions WHERE session_token = $1',
        [token],
        'delete',
        'user_sessions'
      );

      logger.info('Logout realizado:', { token: token.substring(0, 10) + '...' });

    } catch (error) {
      logger.error('Erro no logout:', error);
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

      logger.info('Senha atualizada com sucesso:', { userId });

      return { success: true, message: 'Senha atualizada com sucesso' };

    } catch (error) {
      logger.error('Erro ao atualizar senha:', error);
      throw error;
    }
  }

  // ✅ CRIAR USUÁRIO
  async createUser(userData) {
    try {
      const { username, email, password, full_name, role = 'user', empresa_id = 1 } = userData;

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

      logger.info('Usuário criado com sucesso:', { 
        userId: result.rows[0].id, 
        username: result.rows[0].username 
      });

      return result.rows[0];

    } catch (error) {
      logger.error('Erro ao criar usuário:', error);
      throw error;
    }
  }
}

export default new AuthService();
