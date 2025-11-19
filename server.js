// server.js - SISTEMA BIZFLOW FASE 5 COMPLETA - PRODUÇÃO & FRONTEND MODE
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import client from 'prom-client';
import dotenv from 'dotenv';

// ✅ CONFIGURAÇÃO ES6 MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ CONFIGURAR VARIÁVEIS DE AMBIENTE
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: process.env.NODE_ENV === 'production' ? 
      ['https://bizflow-app-xvcw.onrender.com'] : '*',
    methods: ["GET", "POST"]
  }
});

// ✅ CONFIGURAÇÃO FASE 5 COMPLETA
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
const IS_FRONTEND_MODE = process.env.FRONTEND_MODE === 'true' || !process.env.DATABASE_URL;

// ================= SISTEMA HÍBRIDO - BACKEND & FRONTEND =================
class HybridSystem {
  constructor() {
    this.mode = IS_FRONTEND_MODE ? 'frontend' : 'backend';
    this.frontend = IS_FRONTEND_MODE ? new FrontendServer() : null;
  }

  async handleRequest(method, endpoint, data = null, user = null) {
    if (this.mode === 'frontend') {
      return await this.frontend.handleRequest(method, endpoint, data);
    }
    // Backend mode - as rotas Express tratam automaticamente
    return { mode: 'backend', handledBy: 'express' };
  }

  getStatus() {
    return {
      mode: this.mode,
      features: {
        cache: true,
        metrics: this.mode === 'backend',
        websocket: true,
        realtime: true,
        storage: this.mode === 'frontend' ? 'localStorage' : 'postgresql'
      }
    };
  }
}

// ================= CACHE SERVICE HÍBRIDO =================
class HybridCacheService {
  constructor() {
    this.redisEnabled = false;
    this.memoryCache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  async init() {
    console.log(`🔴 Cache Service: ${IS_FRONTEND_MODE ? 'Memory (Frontend)' : 'Memory (Backend)'}`);
    return { success: true, type: 'memory' };
  }

  async get(key) {
    const item = this.memoryCache.get(key);
    if (item && item.expires > Date.now()) {
      this.hits++;
      return item.value;
    }
    this.misses++;
    return null;
  }

  async set(key, value, duration = 300) {
    this.memoryCache.set(key, {
      value,
      expires: Date.now() + (duration * 1000)
    });
    return true;
  }

  async delete(key) {
    return this.memoryCache.delete(key);
  }

  async flush() {
    this.memoryCache.clear();
    this.hits = 0;
    this.misses = 0;
    return true;
  }

  async status() {
    const hitRatio = this.hits + this.misses > 0 ? 
      (this.hits / (this.hits + this.misses) * 100).toFixed(1) : 0;

    return {
      type: 'memory',
      connected: true,
      total_keys: this.memoryCache.size,
      hits: this.hits,
      misses: this.misses,
      hit_ratio: hitRatio + '%',
      mode: IS_FRONTEND_MODE ? 'frontend' : 'backend'
    };
  }
}

// ================= LOGGER UNIFICADO =================
class BizFlowLogger {
  static businessLog(message, metadata = {}) {
    const timestamp = new Date().toISOString();
    console.log(`📊 [${timestamp}] ${message}`, metadata);
  }

  static errorLog(error, context = {}) {
    const timestamp = new Date().toISOString();
    console.error(`❌ [${timestamp}] ERROR:`, error.message, { ...context, stack: error.stack });
  }

  static authLog(message, metadata = {}) {
    const timestamp = new Date().toISOString();
    console.log(`🔐 [${timestamp}] ${message}`, metadata);
  }
}

// ================= VALIDATORS & HELPERS =================
class BizFlowValidators {
  static sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/[<>]/g, '');
  }

  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validatePassword(password) {
    return password && password.length >= 6;
  }
}

class BizFlowHelpers {
  static generateRandomCode(length = 8) {
    return Math.random().toString(36).substr(2, length).toUpperCase();
  }

  static formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  static formatDate(date) {
    return new Date(date).toLocaleDateString('pt-BR');
  }
}

// ================= SERVICES UNIFICADOS =================
class AuthService {
  static async login(username, password) {
    if (IS_FRONTEND_MODE) {
      const frontendAuth = new FrontendAuth();
      return await frontendAuth.login({ username, password });
    }

    // Backend implementation
    const userResult = await queryWithMetrics(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
      [username],
      'select',
      'users'
    );

    if (userResult.rows.length === 0) {
      throw new Error('Credenciais inválidas');
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      throw new Error('Credenciais inválidas');
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await queryWithMetrics(
      'INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, sessionToken, expiresAt],
      'insert',
      'user_sessions'
    );

    const { password_hash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      session_token: sessionToken,
      expires_at: expiresAt
    };
  }

  static async validateToken(token) {
    if (IS_FRONTEND_MODE) {
      const frontendAuth = new FrontendAuth();
      return frontendAuth.validateToken(token);
    }

    const sessionResult = await queryWithMetrics(
      `SELECT us.*, u.* 
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

    const { password_hash, ...user } = sessionResult.rows[0];
    return user;
  }

  static async logout(token) {
    if (IS_FRONTEND_MODE) {
      const frontendAuth = new FrontendAuth();
      return frontendAuth.logout(token);
    }

    await queryWithMetrics(
      'DELETE FROM user_sessions WHERE session_token = $1',
      [token],
      'delete',
      'user_sessions'
    );
  }

  static async updatePassword(userId, currentPassword, newPassword) {
    if (IS_FRONTEND_MODE) {
      throw new Error('Funcionalidade não disponível em modo frontend');
    }

    const userResult = await queryWithMetrics(
      'SELECT * FROM users WHERE id = $1',
      [userId],
      'select',
      'users'
    );

    if (userResult.rows.length === 0) {
      throw new Error('Usuário não encontrado');
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

    if (!validPassword) {
      throw new Error('Senha atual incorreta');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await queryWithMetrics(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId],
      'update',
      'users'
    );

    return { success: true, message: 'Senha atualizada com sucesso' };
  }
}

class NotificationService {
  static async getNotifications(empresa_id, user_id, limit = 20, offset = 0) {
    if (IS_FRONTEND_MODE) {
      const frontendServer = new FrontendServer();
      return frontendServer.getNotifications();
    }

    const result = await queryWithMetrics(
      `SELECT * FROM notifications 
       WHERE (empresa_id = $1 OR empresa_id IS NULL) 
       AND (user_id = $2 OR user_id IS NULL)
       ORDER BY created_at DESC 
       LIMIT $3 OFFSET $4`,
      [empresa_id, user_id, limit, offset],
      'select',
      'notifications'
    );

    return result.rows;
  }

  static async markAsRead(notificationId, userId) {
    if (IS_FRONTEND_MODE) {
      const storage = new FrontendStorage();
      const notifications = storage.get('notifications') || [];
      const notification = notifications.find(n => n.id == notificationId);
      if (notification) {
        notification.is_read = true;
        storage.set('notifications', notifications);
      }
      return notification;
    }

    const result = await queryWithMetrics(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND (user_id = $2 OR user_id IS NULL) RETURNING *',
      [notificationId, userId],
      'update',
      'notifications'
    );

    return result.rows[0];
  }

  static async markAllAsRead(empresa_id, userId) {
    if (IS_FRONTEND_MODE) {
      const storage = new FrontendStorage();
      const notifications = storage.get('notifications') || [];
      notifications.forEach(n => n.is_read = true);
      storage.set('notifications', notifications);
      return { updated: notifications.length };
    }

    const result = await queryWithMetrics(
      'UPDATE notifications SET is_read = true WHERE (empresa_id = $1 OR empresa_id IS NULL) AND (user_id = $2 OR user_id IS NULL) AND is_read = false RETURNING *',
      [empresa_id, userId],
      'update',
      'notifications'
    );

    return { updated: result.rowCount };
  }

  static async getUnreadCount(empresa_id, userId) {
    if (IS_FRONTEND_MODE) {
      const frontendServer = new FrontendServer();
      return frontendServer.getUnreadNotifications().length;
    }

    const result = await queryWithMetrics(
      'SELECT COUNT(*) FROM notifications WHERE (empresa_id = $1 OR empresa_id IS NULL) AND (user_id = $2 OR user_id IS NULL) AND is_read = false',
      [empresa_id, userId],
      'select',
      'notifications'
    );

    return parseInt(result.rows[0].count);
  }
}

class ReportsService {
  static async getSalesReport(empresa_id, periodo = '7') {
    if (IS_FRONTEND_MODE) {
      const frontendReports = new FrontendReports();
      return frontendReports.getSalesReport({ periodo });
    }

    const dias = parseInt(periodo);
    const dataInicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const result = await queryWithMetrics(
      `SELECT 
        DATE(sale_date) as data,
        COUNT(*) as total_vendas,
        SUM(total_amount) as total_valor,
        AVG(total_amount) as valor_medio,
        payment_method
       FROM sales 
       WHERE empresa_id = $1 AND sale_date >= $2
       GROUP BY DATE(sale_date), payment_method
       ORDER BY data DESC`,
      [empresa_id, dataInicio],
      'select',
      'sales'
    );

    return {
      periodo: `${dias} dias`,
      data_inicio: dataInicio.toISOString().split('T')[0],
      data_fim: new Date().toISOString().split('T')[0],
      detalhes: result.rows,
      estatisticas: await this.getSalesStats(empresa_id, dataInicio)
    };
  }

  static async getSalesStats(empresa_id, dataInicio) {
    const result = await queryWithMetrics(
      `SELECT 
        COUNT(*) as total_vendas_periodo,
        SUM(total_amount) as total_faturado,
        AVG(total_amount) as ticket_medio,
        MAX(total_amount) as maior_venda,
        MIN(total_amount) as menor_venda,
        COUNT(DISTINCT DATE(sale_date)) as dias_com_venda
       FROM sales 
       WHERE empresa_id = $1 AND sale_date >= $2`,
      [empresa_id, dataInicio],
      'select',
      'sales'
    );

    return result.rows[0];
  }

  static async getStockReport(empresa_id) {
    if (IS_FRONTEND_MODE) {
      const frontendReports = new FrontendReports();
      return frontendReports.getStockReport();
    }

    const result = await queryWithMetrics(
      `SELECT 
        name as produto,
        stock_quantity as quantidade,
        min_stock as estoque_minimo,
        price as preco,
        category as categoria,
        CASE 
          WHEN stock_quantity = 0 THEN 'SEM ESTOQUE'
          WHEN stock_quantity <= min_stock THEN 'CRÍTICO'
          ELSE 'NORMAL'
        END as status_estoque,
        (price * stock_quantity) as valor_total_estoque
       FROM products 
       WHERE empresa_id = $1 AND is_active = true
       ORDER BY status_estoque, name`,
      [empresa_id],
      'select',
      'products'
    );

    const stats = await this.getStockStats(empresa_id);

    return {
      produtos: result.rows,
      estatisticas: stats
    };
  }

  static async getStockStats(empresa_id) {
    const result = await queryWithMetrics(
      `SELECT 
        COUNT(*) as total_produtos,
        SUM(stock_quantity) as total_itens_estoque,
        SUM(price * stock_quantity) as valor_total_estoque,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as produtos_sem_estoque,
        COUNT(CASE WHEN stock_quantity > 0 AND stock_quantity <= min_stock THEN 1 END) as produtos_estoque_baixo
       FROM products 
       WHERE empresa_id = $1 AND is_active = true`,
      [empresa_id],
      'select',
      'products'
    );

    const stats = result.rows[0];
    stats.produtos_estoque_adequado = stats.total_produtos - stats.produtos_sem_estoque - stats.produtos_estoque_baixo;
    stats.preco_medio = stats.total_itens_estoque > 0 ? stats.valor_total_estoque / stats.total_itens_estoque : 0;

    return stats;
  }

  static async getFinancialReport(empresa_id, mes = null, ano = null) {
    if (IS_FRONTEND_MODE) {
      const frontendReports = new FrontendReports();
      return frontendReports.getFinancialReport({ mes, ano });
    }

    const currentDate = new Date();
    const targetMonth = mes || currentDate.getMonth() + 1;
    const targetYear = ano || currentDate.getFullYear();

    const result = await queryWithMetrics(
      `SELECT 
        type,
        status,
        COUNT(*) as total_contas,
        SUM(amount) as total_valor
       FROM financial_accounts 
       WHERE empresa_id = $1 
         AND EXTRACT(MONTH FROM due_date) = $2 
         AND EXTRACT(YEAR FROM due_date) = $3
       GROUP BY type, status
       ORDER BY type, status`,
      [empresa_id, targetMonth, targetYear],
      'select',
      'financial_accounts'
    );

    const salesResult = await queryWithMetrics(
      `SELECT 
        COUNT(*) as total_vendas,
        SUM(total_items) as total_vendas_quantidade,
        AVG(total_amount) as ticket_medio
       FROM sales 
       WHERE empresa_id = $1 
         AND EXTRACT(MONTH FROM sale_date) = $2 
         AND EXTRACT(YEAR FROM sale_date) = $3`,
      [empresa_id, targetMonth, targetYear],
      'select',
      'sales'
    );

    return {
      periodo: `${targetMonth}/${targetYear}`,
      financeiro: result.rows,
      vendas: salesResult.rows[0] || { total_vendas: 0, total_vendas_quantidade: 0, ticket_medio: 0 }
    };
  }

  static async getTopProductsReport(empresa_id, limite = 10) {
    if (IS_FRONTEND_MODE) {
      const frontendReports = new FrontendReports();
      return frontendReports.getTopProducts({ limite });
    }

    const result = await queryWithMetrics(
      `SELECT 
        product_name as produto,
        SUM(quantity) as total_vendido,
        SUM(total_price) as total_faturado,
        COUNT(*) as vezes_vendido,
        AVG(total_price) as media_por_venda
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE s.empresa_id = $1
       GROUP BY product_name
       ORDER BY total_vendido DESC
       LIMIT $2`,
      [empresa_id, limite],
      'select',
      'sale_items'
    );

    return result.rows;
  }

  static async getSystemPerformanceReport() {
    if (IS_FRONTEND_MODE) {
      return {
        system: 'frontend_mode',
        message: 'Relatório de performance não disponível em modo frontend'
      };
    }

    const [
      dbStats,
      tableSizes,
      connectionStats
    ] = await Promise.all([
      queryWithMetrics(
        `SELECT 
          schemaname,
          relname,
          n_live_tup,
          n_dead_tup
         FROM pg_stat_user_tables 
         WHERE schemaname = 'public'`,
        [],
        'select',
        'pg_stat_user_tables'
      ),
      queryWithMetrics(
        `SELECT 
          table_name,
          pg_size_pretty(pg_total_relation_size(table_name)) as size
         FROM information_schema.tables 
         WHERE table_schema = 'public'`,
        [],
        'select',
        'information_schema'
      ),
      queryWithMetrics(
        `SELECT 
          COUNT(*) as total_connections,
          COUNT(CASE WHEN state = 'active' THEN 1 END) as active_connections
         FROM pg_stat_activity`,
        [],
        'select',
        'pg_stat_activity'
      )
    ]);

    return {
      database: {
        connections: connectionStats.rows[0],
        table_stats: dbStats.rows,
        table_sizes: tableSizes.rows
      },
      timestamp: new Date().toISOString()
    };
  }
}

// ================= FRONTEND CLASSES (Para modo híbrido) =================
class FrontendServer {
  constructor() {
    this.storage = new FrontendStorage();
    this.cache = new FrontendCache();
    this.auth = new FrontendAuth();
    this.reports = new FrontendReports();
    this.init();
  }

  init() {
    console.log('🚀 BizFlow Server FASE 5 COMPLETA - Frontend Mode Ativo');
    this.setupMockEndpoints();
    this.loadDemoData();
  }

  setupMockEndpoints() {
    this.endpoints = {
      'GET:/health': () => this.healthCheck(),
      'GET:/api/status': () => this.getSystemStatus(),
      'POST:/api/auth/login': (data) => this.auth.login(data),
      'GET:/api/dashboard': () => this.getDashboardData(),
      'GET:/api/empresas': () => this.storage.get('empresas'),
      'POST:/api/empresas': (data) => this.storage.add('empresas', data),
      'GET:/api/produtos': () => this.storage.get('produtos'),
      'POST:/api/produtos': (data) => this.storage.add('produtos', data),
      'GET:/api/vendas': () => this.storage.get('vendas'),
      'POST:/api/vendas': (data) => this.processSale(data),
      'GET:/api/financeiro': () => this.storage.get('contas'),
      'POST:/api/financeiro': (data) => this.storage.add('contas', data),
      'GET:/api/notifications': () => this.getNotifications(),
      'GET:/api/relatorios/vendas': (params) => this.reports.getSalesReport(params),
      'GET:/api/relatorios/estoque': () => this.reports.getStockReport(),
      'GET:/api/relatorios/financeiro': (params) => this.reports.getFinancialReport(params),
      'GET:/api/relatorios/produtos-mais-vendidos': (params) => this.reports.getTopProducts(params),
      'GET:/api/cache/status': () => this.cache.getStatus(),
      'DELETE:/api/cache/clear': () => this.cache.clear()
    };
  }

  async handleRequest(method, endpoint, data = null) {
    await this.simulateNetworkDelay();
    
    const key = `${method}:${endpoint}`;
    const handler = this.endpoints[key];
    
    if (!handler) {
      return {
        success: false,
        error: 'Endpoint não encontrado',
        status: 404
      };
    }

    try {
      const result = await handler(data);
      return {
        success: true,
        data: result,
        status: 200,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: 500
      };
    }
  }

  async simulateNetworkDelay() {
    return new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100));
  }

  healthCheck() {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: '5.5.0',
      environment: 'frontend',
      phase: 'FASE 5 COMPLETA - Frontend Mode',
      performance: {
        response_time_ms: Math.random() * 50 + 20,
        memory_usage: 'Frontend Optimized'
      },
      health_checks: {
        database: { status: 'healthy', type: 'localStorage' },
        cache: { status: 'healthy', type: 'memory' }
      },
      uptime: Math.floor(performance.now() / 1000) + 's'
    };
  }

  getSystemStatus() {
    const empresas = this.storage.get('empresas') || [];
    const produtos = this.storage.get('produtos') || [];
    const vendas = this.storage.get('vendas') || [];
    
    return {
      system: {
        status: 'operational',
        version: '5.5.0',
        environment: 'frontend',
        uptime: Math.floor(performance.now() / 1000) + 's'
      },
      database: {
        status: 'connected',
        type: 'localStorage',
        stats: {
          empresas: empresas.length,
          produtos: produtos.length,
          vendas: vendas.length
        }
      },
      cache: this.cache.getStatus(),
      business: {
        total_empresas: empresas.length,
        total_usuarios: 1,
        total_produtos: produtos.length,
        total_vendas: vendas.length,
        total_faturado: vendas.reduce((sum, v) => sum + (v.total_amount || 0), 0)
      }
    };
  }

  getDashboardData() {
    const empresas = this.storage.get('empresas') || [];
    const produtos = this.storage.get('produtos') || [];
    const vendas = this.storage.get('vendas') || [];
    const contas = this.storage.get('contas') || [];

    const receitas = contas.filter(c => c.type === 'receita').reduce((sum, c) => sum + (c.amount || 0), 0);
    const despesas = contas.filter(c => c.type === 'despesa').reduce((sum, c) => sum + (c.amount || 0), 0);

    return {
      total_empresas: empresas.length,
      total_produtos: produtos.length,
      total_vendas: vendas.length,
      total_usuarios: 1,
      faturamento_total: vendas.reduce((sum, v) => sum + (v.total_amount || 0), 0),
      total_contas: contas.length,
      total_receitas: receitas,
      total_despesas: despesas,
      notificacoes_nao_lidas: this.getUnreadNotifications().length
    };
  }

  async processSale(saleData) {
    const produtos = this.storage.get('produtos') || [];
    const produto = produtos.find(p => p.id === saleData.product_id);
    
    if (!produto) {
      throw new Error('Produto não encontrado');
    }

    if (produto.stock_quantity < saleData.quantity) {
      throw new Error('Estoque insuficiente');
    }

    // Atualizar estoque
    produto.stock_quantity -= saleData.quantity;
    this.storage.update('produtos', produto);

    // Adicionar venda
    const venda = {
      ...saleData,
      id: Date.now(),
      sale_date: new Date().toISOString(),
      sale_code: 'V' + Date.now()
    };

    this.storage.add('vendas', venda);
    return venda;
  }

  getNotifications() {
    return this.storage.get('notifications') || [];
  }

  getUnreadNotifications() {
    const notifications = this.storage.get('notifications') || [];
    return notifications.filter(n => !n.is_read);
  }

  loadDemoData() {
    if (!this.storage.get('empresas') || this.storage.get('empresas').length === 0) {
      const demoData = {
        empresas: [
          {
            id: 1,
            nome: 'Empresa Principal',
            cnpj: '00.000.000/0001-00',
            email: 'contato@empresa.com',
            telefone: '(11) 9999-9999',
            is_active: true,
            created_at: new Date().toISOString()
          }
        ],
        produtos: [
          {
            id: 1,
            name: 'Smartphone Android',
            description: 'Smartphone Android 128GB',
            price: 899.90,
            stock_quantity: 15,
            min_stock: 5,
            category: 'Eletrônicos',
            is_active: true,
            created_at: new Date().toISOString()
          },
          {
            id: 2,
            name: 'Notebook i5',
            description: 'Notebook Core i5 8GB RAM',
            price: 1899.90,
            stock_quantity: 8,
            min_stock: 3,
            category: 'Eletrônicos',
            is_active: true,
            created_at: new Date().toISOString()
          },
          {
            id: 3,
            name: 'Café Premium',
            description: 'Café em grãos 500g',
            price: 24.90,
            stock_quantity: 50,
            min_stock: 10,
            category: 'Alimentação',
            is_active: true,
            created_at: new Date().toISOString()
          }
        ],
        vendas: [
          {
            id: 1,
            sale_code: 'V001',
            product_id: 1,
            product_name: 'Smartphone Android',
            quantity: 1,
            unit_price: 899.90,
            total_amount: 899.90,
            payment_method: 'cartão',
            sale_date: new Date(Date.now() - 86400000).toISOString()
          },
          {
            id: 2,
            sale_code: 'V002',
            product_id: 2,
            product_name: 'Notebook i5',
            quantity: 1,
            unit_price: 1899.90,
            total_amount: 1899.90,
            payment_method: 'dinheiro',
            sale_date: new Date(Date.now() - 172800000).toISOString()
          }
        ],
        contas: [
          {
            id: 1,
            name: 'Venda Cliente A',
            type: 'receita',
            amount: 1500.00,
            due_date: '2024-01-20',
            status: 'recebido',
            created_at: new Date().toISOString()
          },
          {
            id: 2,
            name: 'Aluguel',
            type: 'despesa',
            amount: 1200.00,
            due_date: '2024-01-15',
            status: 'pago',
            created_at: new Date().toISOString()
          }
        ],
        notifications: [
          {
            id: 1,
            title: 'Sistema Iniciado',
            message: 'Sistema BizFlow FASE 5 COMPLETA carregado com sucesso!',
            type: 'success',
            is_read: false,
            created_at: new Date().toISOString()
          },
          {
            id: 2,
            title: 'Bem-vindo',
            message: 'Bem-vindo ao sistema BizFlow FASE 5 COMPLETA',
            type: 'info',
            is_read: false,
            created_at: new Date().toISOString()
          }
        ]
      };

      Object.entries(demoData).forEach(([key, value]) => {
        this.storage.set(key, value);
      });

      console.log('📊 Dados demo carregados com sucesso!');
    }
  }
}

class FrontendStorage {
  constructor() {
    this.prefix = 'bizflow_';
  }

  get(key) {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const data = localStorage.getItem(this.prefix + key);
    return data ? JSON.parse(data) : null;
  }

  set(key, value) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  add(key, item) {
    const data = this.get(key) || [];
    item.id = Date.now();
    item.created_at = new Date().toISOString();
    data.push(item);
    this.set(key, data);
    return item;
  }

  update(key, updatedItem) {
    const data = this.get(key) || [];
    const index = data.findIndex(item => item.id === updatedItem.id);
    if (index !== -1) {
      data[index] = { ...data[index], ...updatedItem, updated_at: new Date().toISOString() };
      this.set(key, data);
    }
  }

  delete(key, id) {
    const data = this.get(key) || [];
    const filtered = data.filter(item => item.id !== id);
    this.set(key, filtered);
  }
}

class FrontendCache {
  constructor() {
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  set(key, value, ttl = 300000) {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (item && item.expires > Date.now()) {
      this.hits++;
      return item.value;
    }
    this.misses++;
    return null;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStatus() {
    const hitRatio = this.hits + this.misses > 0 ? 
      (this.hits / (this.hits + this.misses) * 100).toFixed(1) : 0;
    
    return {
      type: 'memory',
      connected: true,
      total_keys: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hit_ratio: hitRatio + '%'
    };
  }
}

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
        is_active: true
      }
    ];
    this.sessions = new Map();
  }

  hashPassword(password) {
    // Simulação simples de hash
    return btoa(unescape(encodeURIComponent(password))).split('').reverse().join('');
  }

  verifyPassword(password, hash) {
    return this.hashPassword(password) === hash;
  }

  async login(credentials) {
    const { username, password } = credentials;
    const user = this.users.find(u => u.username === username && u.is_active);

    if (!user || !this.verifyPassword(password, user.password_hash)) {
      throw new Error('Credenciais inválidas');
    }

    const sessionToken = 'bizflow_' + Date.now() + '_' + Math.random().toString(36).substr(2);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    this.sessions.set(sessionToken, {
      user_id: user.id,
      expires_at: expiresAt
    });

    const { password_hash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      session_token: sessionToken,
      expires_at: expiresAt
    };
  }

  validateToken(token) {
    const session = this.sessions.get(token);
    if (!session || new Date(session.expires_at) < new Date()) {
      throw new Error('Sessão expirada ou inválida');
    }
    return this.users.find(u => u.id === session.user_id);
  }

  logout(token) {
    this.sessions.delete(token);
  }
}

class FrontendReports {
  constructor() {
    this.storage = new FrontendStorage();
  }

  getSalesReport(params = {}) {
    const vendas = this.storage.get('vendas') || [];
    const periodo = params.periodo || '7';
    const dias = parseInt(periodo);

    const vendasPeriodo = vendas.filter(v => {
      const vendaDate = new Date(v.sale_date);
      const limiteDate = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
      return vendaDate >= limiteDate;
    });

    const totalVendas = vendasPeriodo.length;
    const totalFaturado = vendasPeriodo.reduce((sum, v) => sum + (v.total_amount || 0), 0);
    const ticketMedio = totalVendas > 0 ? totalFaturado / totalVendas : 0;

    const metodosPagamento = {};
    vendasPeriodo.forEach(venda => {
      if (!metodosPagamento[venda.payment_method]) {
        metodosPagamento[venda.payment_method] = { quantidade: 0, total: 0 };
      }
      metodosPagamento[venda.payment_method].quantidade++;
      metodosPagamento[venda.payment_method].total += venda.total_amount || 0;
    });

    return {
      periodo: `${dias} dias`,
      data_inicio: new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      data_fim: new Date().toISOString().split('T')[0],
      detalhes: vendasPeriodo.map(v => ({
        data: v.sale_date.split('T')[0],
        total_vendas: 1,
        total_valor: v.total_amount,
        valor_medio: v.total_amount,
        payment_method: v.payment_method
      })),
      estatisticas: {
        total_vendas_periodo: totalVendas,
        total_faturado: totalFaturado,
        ticket_medio: ticketMedio,
        maior_venda: Math.max(...vendasPeriodo.map(v => v.total_amount || 0)),
        menor_venda: Math.min(...vendasPeriodo.map(v => v.total_amount || 0)),
        dias_com_venda: new Set(vendasPeriodo.map(v => v.sale_date.split('T')[0])).size
      },
      metodos_pagamento: Object.entries(metodosPagamento).map(([metodo, dados]) => ({
        payment_method: metodo,
        quantidade: dados.quantidade,
        total: dados.total,
        percentual: ((dados.quantidade / totalVendas) * 100).toFixed(1)
      }))
    };
  }

  getStockReport() {
    const produtos = this.storage.get('produtos') || [];
    const produtosAtivos = produtos.filter(p => p.is_active);

    const totalProdutos = produtosAtivos.length;
    const totalItens = produtosAtivos.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);
    const valorTotal = produtosAtivos.reduce((sum, p) => sum + (p.price * (p.stock_quantity || 0)), 0);
    const produtosEstoqueBaixo = produtosAtivos.filter(p => (p.stock_quantity || 0) <= (p.min_stock || 0)).length;
    const produtosSemEstoque = produtosAtivos.filter(p => (p.stock_quantity || 0) === 0).length;

    return {
      produtos: produtosAtivos.map(p => ({
        produto: p.name,
        quantidade: p.stock_quantity || 0,
        estoque_minimo: p.min_stock || 5,
        preco: p.price,
        categoria: p.category,
        status_estoque: p.stock_quantity === 0 ? 'SEM ESTOQUE' : 
                        p.stock_quantity <= p.min_stock ? 'CRÍTICO' : 'NORMAL',
        valor_total_estoque: (p.price * (p.stock_quantity || 0))
      })),
      estatisticas: {
        total_produtos: totalProdutos,
        total_itens_estoque: totalItens,
        valor_total_estoque: valorTotal,
        preco_medio: totalProdutos > 0 ? valorTotal / totalItens : 0,
        produtos_sem_estoque: produtosSemEstoque,
        produtos_estoque_baixo: produtosEstoqueBaixo,
        produtos_estoque_adequado: totalProdutos - produtosSemEstoque - produtosEstoqueBaixo
      }
    };
  }

  getFinancialReport(params = {}) {
    const contas = this.storage.get('contas') || [];
    const vendas = this.storage.get('vendas') || [];
    
    const mes = params.mes || new Date().getMonth() + 1;
    const ano = params.ano || new Date().getFullYear();

    const contasPeriodo = contas.filter(c => {
      if (!c.due_date) return false;
      const contaDate = new Date(c.due_date);
      return contaDate.getMonth() + 1 === mes && contaDate.getFullYear() === ano;
    });

    const vendasPeriodo = vendas.filter(v => {
      const vendaDate = new Date(v.sale_date);
      return vendaDate.getMonth() + 1 === mes && vendaDate.getFullYear() === ano;
    });

    const receitas = contasPeriodo.filter(c => c.type === 'receita');
    const despesas = contasPeriodo.filter(c => c.type === 'despesa');

    return {
      periodo: `${mes}/${ano}`,
      financeiro: [
        {
          tipo: 'receita',
          status: 'recebido',
          total_contas: receitas.filter(r => r.status === 'recebido').length,
          total_valor: receitas.filter(r => r.status === 'recebido').reduce((sum, r) => sum + (r.amount || 0), 0)
        },
        {
          tipo: 'receita',
          status: 'pendente',
          total_contas: receitas.filter(r => r.status === 'pendente').length,
          total_valor: receitas.filter(r => r.status === 'pendente').reduce((sum, r) => sum + (r.amount || 0), 0)
        },
        {
          tipo: 'despesa',
          status: 'pago',
          total_contas: despesas.filter(d => d.status === 'pago').length,
          total_valor: despesas.filter(d => d.status === 'pago').reduce((sum, d) => sum + (d.amount || 0), 0)
        },
        {
          tipo: 'despesa',
          status: 'pendente',
          total_contas: despesas.filter(d => d.status === 'pendente').length,
          total_valor: despesas.filter(d => d.status === 'pendente').reduce((sum, d) => sum + (d.amount || 0), 0)
        }
      ],
      vendas: {
        total_vendas: vendasPeriodo.length,
        total_vendas_quantidade: vendasPeriodo.reduce((sum, v) => sum + (v.quantity || 0), 0),
        ticket_medio: vendasPeriodo.length > 0 ? 
          vendasPeriodo.reduce((sum, v) => sum + (v.total_amount || 0), 0) / vendasPeriodo.length : 0
      }
    };
  }

  getTopProducts(params = {}) {
    const vendas = this.storage.get('vendas') || [];
    const limite = parseInt(params.limite) || 10;
    const periodo = params.periodo || '30';
    const dias = parseInt(periodo);

    const vendasPeriodo = vendas.filter(v => {
      const vendaDate = new Date(v.sale_date);
      const limiteDate = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
      return vendaDate >= limiteDate;
    });

    const produtosVendidos = {};
    vendasPeriodo.forEach(venda => {
      if (!produtosVendidos[venda.product_name]) {
        produtosVendidos[venda.product_name] = {
          total_vendido: 0,
          total_faturado: 0,
          vezes_vendido: 0
        };
      }
      produtosVendidos[venda.product_name].total_vendido += venda.quantity || 1;
      produtosVendidos[venda.product_name].total_faturado += venda.total_amount || 0;
      produtosVendidos[venda.product_name].vezes_vendido += 1;
    });

    const ranking = Object.entries(produtosVendidos)
      .map(([produto, dados]) => ({
        produto,
        total_vendido: dados.total_vendido,
        total_faturado: dados.total_faturado,
        vezes_vendido: dados.vezes_vendido,
        media_por_venda: dados.total_faturado / dados.vezes_vendido
      }))
      .sort((a, b) => b.total_vendido - a.total_vendido)
      .slice(0, limite);

    return ranking;
  }
}

// ================= CONFIGURAÇÃO DO SISTEMA HÍBRIDO =================
const hybridSystem = new HybridSystem();
const CacheService = new HybridCacheService();

// ================= MONITORAMENTO PROMETHEUS (Apenas Backend) =================
if (!IS_FRONTEND_MODE) {
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics({ timeout: 5000 });

  const httpRequestDurationMicroseconds = new client.Histogram({
    name: 'http_request_duration_ms',
    help: 'Duração das requisições HTTP em ms',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000]
  });

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total de requisições HTTP',
    labelNames: ['method', 'route', 'status']
  });

  const activeConnectionsGauge = new client.Gauge({
    name: 'active_connections',
    help: 'Número de conexões ativas'
  });

  const databaseQueryDuration = new client.Histogram({
    name: 'database_query_duration_ms',
    help: 'Duração das queries do banco em ms',
    labelNames: ['operation', 'table'],
    buckets: [0.1, 1, 5, 10, 25, 50, 100, 250, 500, 1000]
  });
}

// ================= CONFIGURAÇÃO POSTGRESQL (Apenas Backend) =================
let pool;
let queryWithMetrics;

if (!IS_FRONTEND_MODE) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  queryWithMetrics = async (queryText, params = [], operation = 'query', table = 'unknown') => {
    const start = Date.now();
    try {
      const result = await pool.query(queryText, params);
      const duration = Date.now() - start;
      if (!IS_FRONTEND_MODE) {
        databaseQueryDuration.labels(operation, table).observe(duration);
      }
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      if (!IS_FRONTEND_MODE) {
        databaseQueryDuration.labels('error', table).observe(duration);
      }
      throw error;
    }
  };
} else {
  // Mock para frontend mode
  queryWithMetrics = async (queryText, params = [], operation = 'query', table = 'unknown') => {
    return { rows: [], rowCount: 0 };
  };
  pool = {
    query: () => Promise.resolve({ rows: [], rowCount: 0 }),
    end: () => Promise.resolve()
  };
}

// ================= RATE LIMITING =================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: async (req) => {
    if (req.user?.role === 'admin') return 5000;
    if (req.user) return 1000;
    return 500;
  },
  message: {
    success: false,
    error: 'Muitas requisições deste IP - tente novamente mais tarde'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === '/metrics' || req.path === '/health';
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Muitas tentativas de login - tente novamente em 15 minutos'
  },
  skipSuccessfulRequests: true
});

// ================= MIDDLEWARES =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 
    ['https://bizflow-app-xvcw.onrender.com'] : '*',
  credentials: true
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression({
  level: 6,
  threshold: 0
}));
app.use(morgan('combined', { 
  stream: { write: message => BizFlowLogger.businessLog(message.trim()) } 
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ APLICAR RATE LIMITING
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// ================= MIDDLEWARES PERSONALIZADOS =================
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token de autenticação não fornecido' 
      });
    }

    const user = await AuthService.validateToken(token);
    req.user = user;
    next();
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'authentication middleware' });
    res.status(401).json({ 
      success: false, 
      error: error.message 
    });
  }
}

async function empresaContext(req, res, next) {
  try {
    let empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || req.body.empresa_id;
    
    if (!empresaId && req.user) {
      empresaId = req.user.empresa_id;
    }
    
    if (!empresaId) {
      // Usar cache para empresa padrão
      const cacheKey = 'empresa:default';
      let defaultEmpresa = await CacheService.get(cacheKey);
      
      if (defaultEmpresa) {
        empresaId = defaultEmpresa.id;
      } else {
        if (!IS_FRONTEND_MODE) {
          const empresaResult = await queryWithMetrics(
            'SELECT id FROM empresas WHERE is_active = true ORDER BY id LIMIT 1',
            [],
            'select',
            'empresas'
          );
          empresaId = empresaResult.rows.length > 0 ? empresaResult.rows[0].id : 1;
          await CacheService.set(cacheKey, { id: empresaId }, 300);
        } else {
          empresaId = 1;
        }
      }
    }
    
    req.empresa_id = parseInt(empresaId);
    next();
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'empresa context middleware' });
    req.empresa_id = 1;
    next();
  }
}

function validateRequiredFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Campos obrigatórios faltando: ${missing.join(', ')}`
      });
    }
    next();
  };
}

function sanitizeInput(fields) {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = BizFlowValidators.sanitizeString(req.body[field]);
      }
    });
    next();
  };
}

// ================= MIDDLEWARE DE CACHE =================
const cacheMiddleware = (duration = 300, keyPrefix = 'cache') => {
  return async (req, res, next) => {
    if (req.method !== 'GET' || req.query.nocache) {
      return next();
    }

    const cacheKey = `${keyPrefix}:${req.originalUrl}`;
    
    try {
      const cachedData = await CacheService.get(cacheKey);
      if (cachedData) {
        return res.json(cachedData);
      }

      const originalJson = res.json;
      res.json = function(data) {
        if (data.success !== false) {
          CacheService.set(cacheKey, data, duration)
            .catch(err => BizFlowLogger.errorLog(err, { context: 'cache save' }));
        }
        originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache middleware' });
      next();
    }
  };
};

// ================= ROTAS PRINCIPAIS =================

// Health Check
app.get('/health', async (req, res) => {
  if (IS_FRONTEND_MODE) {
    const result = await hybridSystem.frontend.healthCheck();
    return res.json(result);
  }

  const startTime = Date.now();
  const healthChecks = {};
  
  try {
    healthChecks.database = await testDatabaseConnection();
    healthChecks.cache = await CacheService.status();
    
    const [dbMetrics, systemMetrics] = await Promise.all([
      queryWithMetrics(
        `SELECT 
          COUNT(*) as total_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
        FROM pg_stat_activity`,
        [],
        'select',
        'pg_stat_activity'
      ),
      queryWithMetrics(
        `SELECT 
          (SELECT COUNT(*) FROM empresas WHERE is_active = true) as total_empresas,
          (SELECT COUNT(*) FROM users WHERE is_active = true) as total_usuarios,
          (SELECT COUNT(*) FROM products WHERE is_active = true) as total_produtos`,
        [],
        'select',
        'system_metrics'
      )
    ]);

    const responseTime = Date.now() - startTime;
    const memoryUsage = process.memoryUsage();
    const allHealthy = Object.values(healthChecks).every(check => 
      check.status === 'healthy' || check.connected
    );
    const status = allHealthy ? 200 : 503;

    res.status(status).json({ 
      status: allHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      version: '5.5.0',
      environment: process.env.NODE_ENV || 'development',
      phase: 'FASE 5 COMPLETA - Sistema Híbrido',
      mode: IS_FRONTEND_MODE ? 'frontend' : 'backend',
      performance: {
        response_time_ms: responseTime,
        memory_usage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
        },
        database_connections: !IS_FRONTEND_MODE ? {
          total: parseInt(dbMetrics.rows[0].total_connections),
          active: parseInt(dbMetrics.rows[0].active_connections)
        } : { type: 'localStorage' }
      },
      health_checks: healthChecks,
      metrics: !IS_FRONTEND_MODE ? systemMetrics.rows[0] : { mode: 'frontend' },
      uptime: Math.round(process.uptime()) + 's'
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'health check' });
    res.status(503).json({ 
      status: 'ERROR', 
      error: error.message,
      timestamp: new Date().toISOString(),
      health_checks: healthChecks,
      mode: IS_FRONTEND_MODE ? 'frontend' : 'backend'
    });
  }
});

async function testDatabaseConnection() {
  if (IS_FRONTEND_MODE) {
    return { status: 'healthy', type: 'localStorage' };
  }
  
  try {
    await pool.query('SELECT 1');
    return { status: 'healthy', latency: 'ok' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

// Status do Sistema
app.get('/api/status', cacheMiddleware(60, 'status'), async (req, res) => {
  if (IS_FRONTEND_MODE) {
    const result = await hybridSystem.frontend.getSystemStatus();
    return res.json({
      success: true,
      data: result
    });
  }

  const startTime = Date.now();
  
  try {
    const [dbMetrics, businessMetrics, systemInfo, cacheStatus] = await Promise.all([
      queryWithMetrics(
        `SELECT 
          COUNT(*) as total_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity`,
        [],
        'select',
        'pg_stat_activity'
      ),
      queryWithMetrics(
        `SELECT 
          (SELECT COUNT(*) FROM empresas WHERE is_active = true) as total_empresas,
          (SELECT COUNT(*) FROM users WHERE is_active = true) as total_usuarios,
          (SELECT COUNT(*) FROM products WHERE is_active = true) as total_produtos,
          (SELECT COUNT(*) FROM sales) as total_vendas,
          (SELECT COALESCE(SUM(total_amount), 0) FROM sales) as total_faturado,
          (SELECT COUNT(*) FROM financial_accounts) as total_contas`,
        [],
        'select',
        'business_metrics'
      ),
      queryWithMetrics(
        `SELECT 
          version() as postgres_version,
          current_database() as database_name,
          current_user as current_user`,
        [],
        'select',
        'system_info'
      ),
      CacheService.status()
    ]);

    const responseTime = Date.now() - startTime;
    const memoryUsage = process.memoryUsage();

    res.json({
      success: true,
      data: {
        system: {
          status: 'operational',
          version: '5.5.0',
          environment: process.env.NODE_ENV || 'development',
          mode: 'backend',
          uptime: Math.round(process.uptime()) + 's',
          memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
          },
          node_version: process.version
        },
        database: {
          status: 'connected',
          response_time: responseTime,
          connections: {
            total: parseInt(dbMetrics.rows[0].total_connections),
            active: parseInt(dbMetrics.rows[0].active_connections),
            idle: parseInt(dbMetrics.rows[0].idle_connections)
          },
          info: {
            version: systemInfo.rows[0].postgres_version,
            name: systemInfo.rows[0].database_name,
            user: systemInfo.rows[0].current_user
          }
        },
        cache: cacheStatus,
        business: businessMetrics.rows[0],
        performance: {
          total_response_time: responseTime,
          endpoints: {
            health: '/health',
            metrics: '/metrics',
            websocket: '/socket.io'
          }
        }
      }
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'status check' });
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar status do sistema',
      details: error.message
    });
  }
});

// Endpoint de métricas Prometheus (Apenas Backend)
if (!IS_FRONTEND_MODE) {
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', client.register.contentType);
      const metrics = await client.register.metrics();
      res.end(metrics);
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'metrics endpoint' });
      res.status(500).end();
    }
  });

  // Middleware de métricas
  app.use((req, res, next) => {
    const start = Date.now();
    const route = req.route?.path || req.path;

    res.on('finish', () => {
      const duration = Date.now() - start;
      httpRequestDurationMicroseconds
        .labels(req.method, route, res.statusCode)
        .observe(duration);
      
      httpRequestsTotal
        .labels(req.method, route, res.statusCode.toString())
        .inc();
    });

    next();
  });
}

// ================= ROTAS DE AUTENTICAÇÃO =================
app.post('/api/auth/login', 
  authLimiter,
  sanitizeInput(['username', 'password']),
  validateRequiredFields(['username', 'password']),
  async (req, res) => {
    try {
      const { username, password } = req.body;
      
      const result = await AuthService.login(username, password);
      
      res.json({
        success: true,
        message: 'Login realizado com sucesso!',
        data: result
      });

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'login route' });
      res.status(401).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    await AuthService.logout(token);
    
    res.json({
      success: true,
      message: 'Logout realizado com sucesso!'
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'logout route' });
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

app.post('/api/auth/change-password', 
  requireAuth,
  validateRequiredFields(['currentPassword', 'newPassword']),
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      const result = await AuthService.updatePassword(
        req.user.id, 
        currentPassword, 
        newPassword
      );
      
      res.json(result);
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'change password' });
      res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
);

// ================= ROTAS DE DADOS =================
app.get('/api/dashboard', requireAuth, empresaContext, cacheMiddleware(300, 'dashboard'), async (req, res) => {
  try {
    if (IS_FRONTEND_MODE) {
      const result = await hybridSystem.frontend.getDashboardData();
      return res.json({
        success: true,
        data: result
      });
    }

    const [
      empresasResult,
      produtosResult,
      vendasResult,
      usuariosResult,
      financeiroResult,
      notificacoesResult
    ] = await Promise.all([
      queryWithMetrics('SELECT COUNT(*) as total FROM empresas WHERE is_active = true', [], 'select', 'empresas'),
      queryWithMetrics('SELECT COUNT(*) as total FROM products WHERE empresa_id = $1 AND is_active = true', [req.empresa_id], 'select', 'products'),
      queryWithMetrics('SELECT COUNT(*) as total, COALESCE(SUM(total_amount), 0) as total_vendas FROM sales WHERE empresa_id = $1', [req.empresa_id], 'select', 'sales'),
      queryWithMetrics('SELECT COUNT(*) as total FROM users WHERE empresa_id = $1 AND is_active = true', [req.empresa_id], 'select', 'users'),
      queryWithMetrics(`SELECT 
        COUNT(*) as total_contas,
        SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) as total_receitas,
        SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) as total_despesas
        FROM financial_accounts WHERE empresa_id = $1`, [req.empresa_id], 'select', 'financial_accounts'),
      NotificationService.getUnreadCount(req.empresa_id, req.user.id)
    ]);

    res.json({
      success: true,
      data: {
        total_empresas: parseInt(empresasResult.rows[0].total),
        total_produtos: parseInt(produtosResult.rows[0].total),
        total_vendas: parseInt(vendasResult.rows[0].total),
        total_usuarios: parseInt(usuariosResult.rows[0].total),
        faturamento_total: parseFloat(vendasResult.rows[0].total_vendas),
        total_contas: parseInt(financeiroResult.rows[0].total_contas),
        total_receitas: parseFloat(financeiroResult.rows[0].total_receitas || 0),
        total_despesas: parseFloat(financeiroResult.rows[0].total_despesas || 0),
        notificacoes_nao_lidas: notificacoesResult
      }
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'dashboard' });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Rotas para produtos, vendas, empresas (mantidas do original)
app.get('/api/produtos', requireAuth, empresaContext, cacheMiddleware(120, 'produtos'), async (req, res) => {
  try {
    if (IS_FRONTEND_MODE) {
      const result = await hybridSystem.frontend.storage.get('produtos');
      return res.json({
        success: true,
        data: result || []
      });
    }

    const result = await queryWithMetrics(
      'SELECT * FROM products WHERE empresa_id = $1 AND is_active = true ORDER BY name',
      [req.empresa_id],
      'select',
      'products'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'get produtos' });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/vendas', requireAuth, empresaContext, cacheMiddleware(180, 'vendas'), async (req, res) => {
  try {
    if (IS_FRONTEND_MODE) {
      const result = await hybridSystem.frontend.storage.get('vendas');
      return res.json({
        success: true,
        data: result || []
      });
    }

    const result = await queryWithMetrics(
      `SELECT s.*, 
              COUNT(si.id) as items_count
       FROM sales s
       LEFT JOIN sale_items si ON s.id = si.sale_id
       WHERE s.empresa_id = $1
       GROUP BY s.id
       ORDER BY s.sale_date DESC 
       LIMIT 50`,
      [req.empresa_id],
      'select',
      'sales'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'get vendas' });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/empresas', requireAuth, cacheMiddleware(300, 'empresas'), async (req, res) => {
  try {
    if (IS_FRONTEND_MODE) {
      const result = await hybridSystem.frontend.storage.get('empresas');
      return res.json({
        success: true,
        data: result || []
      });
    }

    const result = await queryWithMetrics(
      'SELECT * FROM empresas WHERE is_active = true ORDER BY nome',
      [],
      'select',
      'empresas'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'get empresas' });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS DE NOTIFICAÇÕES =================
app.get('/api/notifications', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(60, 'notifications'),
  async (req, res) => {
    try {
      const { limit = 20, offset = 0 } = req.query;
      
      const notifications = await NotificationService.getNotifications(
        req.empresa_id, 
        req.user.id, 
        parseInt(limit), 
        parseInt(offset)
      );
      
      res.json({
        success: true,
        data: notifications
      });
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'get notifications' });
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// ================= ROTAS DE RELATÓRIOS =================
app.get('/api/relatorios/vendas', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(600, 'relatorios'),
  async (req, res) => {
    try {
      const { periodo = '7' } = req.query;
      
      const report = await ReportsService.getSalesReport(
        req.empresa_id, 
        periodo
      );
      
      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'sales report' });
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

app.get('/api/relatorios/estoque', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(600, 'relatorios'),
  async (req, res) => {
    try {
      const report = await ReportsService.getStockReport(req.empresa_id);
      
      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'stock report' });
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

app.get('/api/relatorios/financeiro', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(600, 'relatorios'),
  async (req, res) => {
    try {
      const { mes, ano } = req.query;
      
      const report = await ReportsService.getFinancialReport(
        req.empresa_id, 
        mes, 
        ano
      );
      
      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'financial report' });
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

app.get('/api/relatorios/produtos-mais-vendidos', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(600, 'relatorios'),
  async (req, res) => {
    try {
      const { limite = '10' } = req.query;
      
      const report = await ReportsService.getTopProductsReport(
        req.empresa_id, 
        parseInt(limite)
      );
      
      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'top products report' });
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// ================= ROTAS DE CACHE =================
app.get('/api/cache/status', requireAuth, async (req, res) => {
  try {
    const cacheInfo = await CacheService.status();

    res.json({
      success: true,
      data: cacheInfo
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'cache status' });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.delete('/api/cache/clear', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Acesso negado. Apenas administradores podem limpar o cache.' 
      });
    }

    await CacheService.flush();
    
    res.json({
      success: true,
      message: 'Cache limpo com sucesso!'
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'clear cache' });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= WEBSOCKET INTEGRATION =================
io.on('connection', (socket) => {
  BizFlowLogger.businessLog('Nova conexão WebSocket', { socketId: socket.id, mode: IS_FRONTEND_MODE ? 'frontend' : 'backend' });
  
  if (!IS_FRONTEND_MODE) {
    activeConnectionsGauge.inc();
  }

  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      const user = await AuthService.validateToken(token);
      
      socket.join(`empresa-${user.empresa_id}`);
      socket.join(`user-${user.id}`);
      
      socket.emit('authenticated', { 
        success: true, 
        user: { 
          id: user.id, 
          nome: user.full_name,
          username: user.username,
          empresa_id: user.empresa_id
        } 
      });
      
      BizFlowLogger.authLog('Usuário autenticado via WebSocket', {
        userId: user.id,
        username: user.username,
        mode: IS_FRONTEND_MODE ? 'frontend' : 'backend'
      });
    } catch (error) {
      socket.emit('authenticated', { 
        success: false, 
        error: 'Autenticação falhou' 
      });
    }
  });

  socket.on('join-empresa', (empresaId) => {
    socket.join(`empresa-${empresaId}`);
    BizFlowLogger.businessLog('Cliente entrou na empresa via WebSocket', {
      socketId: socket.id,
      empresaId: empresaId
    });
  });

  socket.on('nova-venda', (data) => {
    socket.to(`empresa-${data.empresa_id}`).emit('venda-atualizada', data);
  });

  socket.on('disconnect', () => {
    BizFlowLogger.businessLog('Conexão WebSocket desconectada', { 
      socketId: socket.id,
      mode: IS_FRONTEND_MODE ? 'frontend' : 'backend'
    });
    
    if (!IS_FRONTEND_MODE) {
      activeConnectionsGauge.dec();
    }
  });
});

// ================= INICIALIZAÇÃO DO BANCO (Apenas Backend) =================
async function initializeDatabase() {
  if (IS_FRONTEND_MODE) {
    BizFlowLogger.businessLog('Modo Frontend - Skip inicialização do banco');
    return;
  }

  try {
    BizFlowLogger.businessLog('Inicializando banco de dados FASE 5 COMPLETA...');
    await createTables();
    await createAdminUser();
    BizFlowLogger.businessLog('Banco inicializado com sucesso!');
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'database initialization' });
    throw error;
  }
}

async function createTables() {
  if (IS_FRONTEND_MODE) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tablesSQL = `
      -- Tabelas (mantidas do original)
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        cnpj VARCHAR(20),
        email VARCHAR(100),
        telefone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 5,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        sale_code VARCHAR(50) UNIQUE NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        total_items INTEGER NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name VARCHAR(200) NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS financial_accounts (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) CHECK (type IN ('receita', 'despesa')),
        amount DECIMAL(15,2) NOT NULL,
        due_date DATE,
        status VARCHAR(50) DEFAULT 'pendente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        report_type VARCHAR(100) NOT NULL,
        title VARCHAR(200) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices
      CREATE INDEX IF NOT EXISTS idx_sales_empresa_date ON sales(empresa_id, sale_date);
      CREATE INDEX IF NOT EXISTS idx_products_empresa_active ON products(empresa_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_financial_due_date ON financial_accounts(due_date);

      -- Dados iniciais
      INSERT INTO empresas (id, nome, cnpj, email, telefone) 
      VALUES (1, 'Empresa Principal', '00.000.000/0001-00', 'contato@empresa.com', '(11) 9999-9999')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO products (empresa_id, name, description, price, stock_quantity, category) VALUES 
      (1, 'Smartphone Android', 'Smartphone Android 128GB', 899.90, 15, 'Eletrônicos'),
      (1, 'Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 8, 'Eletrônicos'),
      (1, 'Café Premium', 'Café em grãos 500g', 24.90, 50, 'Alimentação')
      ON CONFLICT DO NOTHING;
    `;

    await client.query(tablesSQL);
    await client.query('COMMIT');
    BizFlowLogger.businessLog('Tabelas criadas/verificadas com sucesso!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    BizFlowLogger.errorLog(error, { context: 'create tables' });
    throw error;
  } finally {
    client.release();
  }
}

async function createAdminUser() {
  if (IS_FRONTEND_MODE) return;

  try {
    const userCheck = await queryWithMetrics(
      'SELECT id FROM users WHERE username = $1', 
      ['admin'],
      'select',
      'users'
    );

    if (userCheck.rows.length === 0) {
      const passwordHash = await bcrypt.hash('admin123', 12);
      await queryWithMetrics(
        `INSERT INTO users (empresa_id, username, email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin'],
        'insert',
        'users'
      );
      BizFlowLogger.businessLog('Usuário admin criado com sucesso!');
    } else {
      BizFlowLogger.businessLog('Usuário admin já existe');
    }
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'create admin user' });
    throw error;
  }
}

// ================= TRATAMENTO DE ERROS =================
app.use((err, req, res, next) => {
  BizFlowLogger.errorLog(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    mode: IS_FRONTEND_MODE ? 'frontend' : 'backend'
  });
  
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor FASE 5 COMPLETA',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Contacte o suporte',
    request_id: crypto.randomUUID(),
    mode: IS_FRONTEND_MODE ? 'frontend' : 'backend'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    path: req.originalUrl,
    mode: IS_FRONTEND_MODE ? 'frontend' : 'backend'
  });
});

// ================= GRACEFUL SHUTDOWN =================
async function gracefulShutdown() {
  BizFlowLogger.businessLog('Iniciando graceful shutdown...');
  
  try {
    server.close(() => {
      BizFlowLogger.businessLog('Servidor HTTP fechado');
    });

    if (!IS_FRONTEND_MODE) {
      await pool.end();
      BizFlowLogger.businessLog('Pool de conexões do PostgreSQL fechado');
    }

    BizFlowLogger.businessLog('Graceful shutdown completado');
    process.exit(0);
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'graceful shutdown' });
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ================= INICIALIZAÇÃO DO SERVIDOR =================
async function startServer() {
  try {
    BizFlowLogger.businessLog('Iniciando BizFlow Server FASE 5 COMPLETA - SISTEMA HÍBRIDO...');
    
    // Inicializar sistema
    if (!IS_FRONTEND_MODE) {
      await initializeDatabase();
    } else {
      // Em modo frontend, garantir que os dados demo estejam carregados
      if (hybridSystem.frontend) {
        hybridSystem.frontend.loadDemoData();
      }
    }
    
    // Inicializar Cache Service
    await CacheService.init();
    
    // Iniciar servidor
    server.listen(PORT, HOST, () => {
      const mode = IS_FRONTEND_MODE ? 'FRONTEND' : 'BACKEND';
      const storage = IS_FRONTEND_MODE ? 'localStorage' : 'PostgreSQL';
      
      BizFlowLogger.businessLog(`
╔══════════════════════════════════════════════════════════════╗
║              🚀 BIZFLOW FASE 5 COMPLETA                    ║
║                   SISTEMA HÍBRIDO                          ║
╠══════════════════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                                  ║
║ 🌐 Host: ${HOST}                                                 ║
║ 🎯 Modo: ✅ ${mode}                                         ║
║ 🗄️  Storage: ${storage}                                      ║
║ 🔴 Cache: ✅ MEMORY CACHE ATIVADO                          ║
║ 📊 ${!IS_FRONTEND_MODE ? 'Prometheus: ✅ MÉTRICAS ATIVADAS' : 'Frontend: ✅ DADOS DEMO'} ║
║ 🔌 WebSocket: ✅ ATIVADO                                      ║
║ 📈 Services: ✅ AUTH, NOTIFICATIONS, REPORTS                 ║
║ 🛡️  Segurança: ✅ RATE LIMITING + HELMET                     ║
║ 📝 Logs: ✅ SISTEMA ESTRUTURADO                             ║
║ 🌐 API Status: /api/status                                   ║
║ ❤️  Health Check: /health                                    ║
║ ${!IS_FRONTEND_MODE ? '📈 Métricas: /metrics' : '💾 Storage: localStorage'}                              ║
║ 👤 Usuário: admin                                            ║
║ 🔑 Senha: admin123                                           ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
    
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'server startup' });
    process.exit(1);
  }
}

// Iniciar o servidor
startServer();

// ✅ EXPORTAR PARA USO EM OUTROS ARQUIVOS
export { 
  app, 
  io, 
  pool, 
  queryWithMetrics,
  CacheService,
  BizFlowLogger as logger,
  hybridSystem
};
