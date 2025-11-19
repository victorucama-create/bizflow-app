// services/auth.js - SISTEMA BIZFLOW FASE 5 COMPLETA HÍBRIDO
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import CacheService from './cache-service.js';
import BizFlowLogger from '../utils/logger.js';

// ✅ DETECÇÃO AUTOMÁTICA DE AMBIENTE
const IS_FRONTEND_MODE = typeof window !== 'undefined' || process.env.FRONTEND_MODE === 'true';
const IS_BROWSER = typeof window !== 'undefined';

// ✅ IMPORT DINÂMICO DO BACKEND (apenas se não for frontend)
let queryWithMetrics;
let pool;

if (!IS_FRONTEND_MODE) {
  import('../core/server.js').then(module => {
    queryWithMetrics = module.queryWithMetrics;
    pool = module.pool;
  }).catch(error => {
    BizFlowLogger.errorLog(error, { context: 'AuthService backend import' });
  });
}

// ✅ SISTEMA DE AUTENTICAÇÃO FRONTEND
class FrontendAuth {
  constructor() {
    this.users = [
      {
        id: 1,
        username: 'admin',
        email: 'admin@bizflow.com',
        password_hash: this.hashPassword('admin123'),
        full_name: 'Administrador do Sistema',
        role: 'admin',
        empresa_id: 1,
        is_active: true,
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        username: 'user',
        email: 'user@bizflow.com',
        password_hash: this.hashPassword('user123'),
        full_name: 'Usuário Demo',
        role: 'user',
        empresa_id: 1,
        is_active: true,
        created_at: new Date().toISOString()
      }
    ];
    this.sessions = new Map();
    this.init();
  }

  init() {
    // Carregar usuários do localStorage se existirem
    this.loadUsersFromStorage();
    BizFlowLogger.authLog('Sistema de autenticação frontend inicializado');
  }

  loadUsersFromStorage() {
    try {
      const storedUsers = localStorage.getItem('bizflow_users');
      if (storedUsers) {
        this.users = JSON.parse(storedUsers);
      }
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendAuth.loadUsersFromStorage' });
    }
  }

  saveUsersToStorage() {
    try {
      localStorage.setItem('bizflow_users', JSON.stringify(this.users));
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendAuth.saveUsersToStorage' });
    }
  }

  hashPassword(password) {
    // Simulação de hash para frontend (em produção usar Web Crypto API)
    return btoa(unescape(encodeURIComponent(password))).split('').reverse().join('');
  }

  verifyPassword(password, hash) {
    return this.hashPassword(password) === hash;
  }

  async login(username, password) {
    try {
      BizFlowLogger.authLog('Tentativa de login frontend', { username });

      if (!username || !password) {
        throw new Error('Username e password são obrigatórios');
      }

      const user = this.users.find(u => 
        u.username === username && u.is_active
      );

      if (!user || !this.verifyPassword(password, user.password_hash)) {
        BizFlowLogger.authLog('Credenciais inválidas frontend', { username });
        throw new Error('Credenciais inválidas');
      }

      // Gerar token de sessão
      const sessionToken = this.generateSecureToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Salvar sessão
      this.sessions.set(sessionToken, {
        user_id: user.id,
        expires_at: expiresAt
      });

      // Salvar no localStorage também
      this.saveSessionToStorage(sessionToken, user.id, expiresAt);

      // Remover password hash da resposta
      const { password_hash, ...userWithoutPassword } = user;

      BizFlowLogger.authLog('Login frontend realizado com sucesso', {
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
      BizFlowLogger.errorLog(error, { context: 'FrontendAuth.login' });
      throw error;
    }
  }

  async validateToken(token) {
    try {
      if (!token) {
        throw new Error('Token não fornecido');
      }

      // Verificar na memória
      const session = this.sessions.get(token);
      if (session && new Date(session.expires_at) > new Date()) {
        const user = this.users.find(u => u.id === session.user_id);
        if (user && user.is_active) {
          BizFlowLogger.cacheLog('Sessão frontend validada na memória', true, { 
            token: token.substring(0, 10) + '...' 
          });
          return user;
        }
      }

      // Verificar no localStorage
      const storedSession = this.getSessionFromStorage(token);
      if (storedSession && new Date(storedSession.expires_at) > new Date()) {
        const user = this.users.find(u => u.id === storedSession.user_id);
        if (user && user.is_active) {
          // Restaurar na memória
          this.sessions.set(token, storedSession);
          BizFlowLogger.cacheLog('Sessão frontend validada do localStorage', true, {
            token: token.substring(0, 10) + '...'
          });
          return user;
        }
      }

      throw new Error('Sessão expirada ou inválida');

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendAuth.validateToken' });
      throw error;
    }
  }

  async logout(token) {
    try {
      if (!token) return;

      // Remover da memória
      this.sessions.delete(token);
      
      // Remover do localStorage
      this.removeSessionFromStorage(token);

      BizFlowLogger.authLog('Logout frontend realizado', { 
        token: token.substring(0, 10) + '...' 
      });

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendAuth.logout' });
      throw error;
    }
  }

  generateSecureToken() {
    return 'bizflow_frontend_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
  }

  saveSessionToStorage(token, userId, expiresAt) {
    try {
      const sessions = this.getStoredSessions();
      sessions[token] = { user_id: userId, expires_at: expiresAt.toISOString() };
      localStorage.setItem('bizflow_sessions', JSON.stringify(sessions));
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendAuth.saveSessionToStorage' });
    }
  }

  getSessionFromStorage(token) {
    try {
      const sessions = this.getStoredSessions();
      const session = sessions[token];
      if (session) {
        return {
          user_id: session.user_id,
          expires_at: new Date(session.expires_at)
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  removeSessionFromStorage(token) {
    try {
      const sessions = this.getStoredSessions();
      delete sessions[token];
      localStorage.setItem('bizflow_sessions', JSON.stringify(sessions));
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendAuth.removeSessionFromStorage' });
    }
  }

  getStoredSessions() {
    try {
      const sessions = localStorage.getItem('bizflow_sessions');
      return sessions ? JSON.parse(sessions) : {};
    } catch (error) {
      return {};
    }
  }

  async createUser(userData) {
    try {
      const { username, email, password, full_name, role = 'user', empresa_id = 1 } = userData;

      if (!username || !email || !password || !full_name) {
        throw new Error('Todos os campos obrigatórios devem ser preenchidos');
      }

      // Verificar se usuário já existe
      const existingUser = this.users.find(u => 
        u.username === username || u.email === email
      );

      if (existingUser) {
        throw new Error('Username ou email já cadastrado');
      }

      // Criar novo usuário
      const newUser = {
        id: Date.now(),
        username,
        email,
        password_hash: this.hashPassword(password),
        full_name,
        role,
        empresa_id,
        is_active: true,
        created_at: new Date().toISOString()
      };

      this.users.push(newUser);
      this.saveUsersToStorage();

      BizFlowLogger.authLog('Usuário frontend criado com sucesso', {
        userId: newUser.id,
        username: newUser.username
      });

      const { password_hash, ...userWithoutPassword } = newUser;
      return userWithoutPassword;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendAuth.createUser' });
      throw error;
    }
  }

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

  // Limpar sessões expiradas
  cleanupExpiredSessions() {
    const now = new Date();
    for (const [token, session] of this.sessions.entries()) {
      if (new Date(session.expires_at) <= now) {
        this.sessions.delete(token);
        this.removeSessionFromStorage(token);
      }
    }
  }
}

// ✅ SISTEMA DE AUTENTICAÇÃO BACKEND
class BackendAuth {
  async login(username, password) {
    try {
      BizFlowLogger.authLog('Tentativa de login backend', { username });

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
        BizFlowLogger.authLog('Usuário não encontrado backend', { username });
        throw new Error('Credenciais inválidas');
      }

      const user = userResult.rows[0];

      // Verificar senha
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        BizFlowLogger.authLog('Senha inválida backend', { username });
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

      BizFlowLogger.authLog('Login backend realizado com sucesso', { 
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
      BizFlowLogger.errorLog(error, { context: 'BackendAuth.login' });
      throw error;
    }
  }

  async validateToken(token) {
    try {
      if (!token) {
        throw new Error('Token não fornecido');
      }

      // ✅ TENTAR CACHE SERVICE PRIMEIRO
      const userSession = await CacheService.getSession(token);
      
      if (userSession) {
        BizFlowLogger.cacheLog('Sessão encontrada no cache backend', true, { 
          token: token.substring(0, 10) + '...' 
        });
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
      
      BizFlowLogger.authLog('Sessão backend validada e cacheadada', { 
        userId: user.id,
        username: user.username 
      });

      return user;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendAuth.validateToken' });
      throw error;
    }
  }

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

      BizFlowLogger.authLog('Logout backend realizado', { token: token.substring(0, 10) + '...' });

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendAuth.logout' });
      throw error;
    }
  }

  generateSecureToken() {
    return 'bizflow_backend_' + Date.now() + '_' + crypto.randomBytes(32).toString('hex');
  }

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

      BizFlowLogger.authLog('Senha atualizada com sucesso backend', { userId });

      return { 
        success: true, 
        message: 'Senha atualizada com sucesso. Todas as sessões foram invalidadas.' 
      };

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendAuth.updatePassword' });
      throw error;
    }
  }

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

      BizFlowLogger.authLog('Todas as sessões do usuário invalidadas backend', { userId });

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendAuth.invalidateUserSessions' });
      throw error;
    }
  }

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

      BizFlowLogger.authLog('Usuário backend criado com sucesso', { 
        userId: result.rows[0].id, 
        username: result.rows[0].username 
      });

      return result.rows[0];

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendAuth.createUser' });
      throw error;
    }
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    return {
      isValid,
      error: isValid ? null : 'Email inválido',
      normalized: isValid ? email.toLowerCase() : null
    };
  }
}

// ✅ SERVIÇO DE AUTENTICAÇÃO HÍBRIDO PRINCIPAL
class HybridAuthService {
  constructor() {
    this.frontendAuth = new FrontendAuth();
    this.backendAuth = new BackendAuth();
    this.mode = IS_FRONTEND_MODE ? 'frontend' : 'backend';
  }

  async login(username, password) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendAuth.login(username, password);
    } else {
      return await this.backendAuth.login(username, password);
    }
  }

  async validateToken(token) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendAuth.validateToken(token);
    } else {
      return await this.backendAuth.validateToken(token);
    }
  }

  async logout(token) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendAuth.logout(token);
    } else {
      return await this.backendAuth.logout(token);
    }
  }

  hasPermission(user, requiredRole) {
    if (IS_FRONTEND_MODE) {
      return this.frontendAuth.hasPermission(user, requiredRole);
    } else {
      return this.backendAuth.hasPermission(user, requiredRole);
    }
  }

  async updatePassword(userId, currentPassword, newPassword) {
    if (IS_FRONTEND_MODE) {
      throw new Error('Alteração de senha não disponível em modo frontend');
    } else {
      return await this.backendAuth.updatePassword(userId, currentPassword, newPassword);
    }
  }

  async createUser(userData) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendAuth.createUser(userData);
    } else {
      return await this.backendAuth.createUser(userData);
    }
  }

  validatePasswordStrength(password) {
    if (IS_FRONTEND_MODE) {
      // Versão simplificada para frontend
      return {
        isValid: password.length >= 6,
        error: password.length >= 6 ? null : 'Senha deve ter pelo menos 6 caracteres',
        checks: { minLength: password.length >= 6 }
      };
    } else {
      return this.backendAuth.validatePasswordStrength(password);
    }
  }

  validateEmail(email) {
    if (IS_FRONTEND_MODE) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValid = emailRegex.test(email);
      
      return {
        isValid,
        error: isValid ? null : 'Email inválido'
      };
    } else {
      return this.backendAuth.validateEmail(email);
    }
  }

  // ✅ MÉTODOS ESPECÍFICOS DO FRONTEND
  cleanupFrontendSessions() {
    if (IS_FRONTEND_MODE) {
      this.frontendAuth.cleanupExpiredSessions();
    }
  }

  getFrontendUsers() {
    if (IS_FRONTEND_MODE) {
      return this.frontendAuth.users.map(user => {
        const { password_hash, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
    }
    return [];
  }

  // ✅ OBTER MODO ATUAL
  getCurrentMode() {
    return this.mode;
  }

  // ✅ VERIFICAR SE É FRONTEND
  isFrontendMode() {
    return IS_FRONTEND_MODE;
  }
}

// ✅ EXPORTAR INSTÂNCIA ÚNICA
const authService = new HybridAuthService();
export default authService;

// ✅ EXPORTAR PARA USO NO BROWSER
if (IS_BROWSER) {
  window.BizFlowAuth = authService;
}
