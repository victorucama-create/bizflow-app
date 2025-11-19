// server.js - SISTEMA BIZFLOW FASE 5 COMPLETA - COM CACHE SERVICE FALLBACK
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
import winston from 'winston';
import dotenv from 'dotenv';
import client from 'prom-client';

// ✅ IMPORTAR SERVIÇOS DA FASE 5 COMPLETA
import AuthService from './services/auth.js';
import NotificationService from './services/notifications.js';
import ReportsService from './services/reports.js';
import CacheService from './services/cache-service.js';
import BizFlowLogger from './utils/logger.js';
import BizFlowValidators from './utils/validators.js';
import BizFlowHelpers from './utils/helpers.js';

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

// ================= CACHE SERVICE - FASE 5.2 =================
// ✅ JÁ CONFIGURADO NO services/cache-service.js - USANDO FALLBACK AUTOMÁTICO

// ✅ ESTRATÉGIAS DE CACHE
const cacheStrategies = {
  DASHBOARD: 300,
  PRODUCTS: 120,
  REPORTS: 600,
  SESSIONS: 3600
};

// ✅ MIDDLEWARE DE CACHE GENÉRICO
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

// ================= MONITORAMENTO PROMETHEUS - FASE 5.3 =================
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// Métricas customizadas
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

const cacheHitCounter = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total de hits no cache'
});

const cacheMissCounter = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total de misses no cache'
});

const databaseQueryDuration = new client.Histogram({
  name: 'database_query_duration_ms',
  help: 'Duração das queries do banco em ms',
  labelNames: ['operation', 'table'],
  buckets: [0.1, 1, 5, 10, 25, 50, 100, 250, 500, 1000]
});

// ✅ MIDDLEWARE DE MÉTRICAS
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

// Endpoint de métricas Prometheus
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

// ================= CONFIGURAÇÃO POSTGRESQL OTIMIZADA =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ✅ WRAPPER PARA MÉTRICAS DE DATABASE
const queryWithMetrics = async (queryText, params = [], operation = 'query', table = 'unknown') => {
  const start = Date.now();
  try {
    const result = await pool.query(queryText, params);
    const duration = Date.now() - start;
    databaseQueryDuration.labels(operation, table).observe(duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    databaseQueryDuration.labels('error', table).observe(duration);
    throw error;
  }
};

// ================= RATE LIMITING AVANÇADO =================
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

// ================= MIDDLEWARES FASE 5 COMPLETA =================
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

// ✅ MIDDLEWARE DE AUTENTICAÇÃO COM CACHE SERVICE
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

// ✅ MIDDLEWARE DE CONTEXTO EMPRESARIAL COM CACHE
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
        const empresaResult = await queryWithMetrics(
          'SELECT id FROM empresas WHERE is_active = true ORDER BY id LIMIT 1',
          [],
          'select',
          'empresas'
        );
        empresaId = empresaResult.rows.length > 0 ? empresaResult.rows[0].id : 1;
        await CacheService.set(cacheKey, { id: empresaId }, 300);
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

// ✅ MIDDLEWARE DE VALIDAÇÃO
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

// ✅ MIDDLEWARE DE SANITIZAÇÃO
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

// ================= HEALTH CHECK AVANÇADO =================
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  const healthChecks = {};
  
  try {
    healthChecks.database = await testDatabaseConnection();
    healthChecks.cache = await testCacheConnection();
    
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
    const allHealthy = Object.values(healthChecks).every(check => check.status === 'healthy');
    const status = allHealthy ? 200 : 503;

    res.status(status).json({ 
      status: allHealthy ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      version: '5.5.0',
      environment: process.env.NODE_ENV || 'development',
      phase: 'FASE 5 COMPLETA - Sistema de Produção & Escalabilidade',
      performance: {
        response_time_ms: responseTime,
        memory_usage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
        },
        database_connections: {
          total: parseInt(dbMetrics.rows[0].total_connections),
          active: parseInt(dbMetrics.rows[0].active_connections)
        }
      },
      health_checks: healthChecks,
      metrics: systemMetrics.rows[0],
      uptime: Math.round(process.uptime()) + 's'
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'health check' });
    res.status(503).json({ 
      status: 'ERROR', 
      error: error.message,
      timestamp: new Date().toISOString(),
      health_checks: healthChecks
    });
  }
});

async function testDatabaseConnection() {
  try {
    await pool.query('SELECT 1');
    return { status: 'healthy', latency: 'ok' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function testCacheConnection() {
  try {
    const status = await CacheService.status();
    return { 
      status: status.connected ? 'healthy' : 'degraded', 
      type: status.type,
      details: status 
    };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

// ================= STATUS DO SISTEMA =================
app.get('/api/status', cacheMiddleware(60, 'status'), async (req, res) => {
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

// ================= ROTAS DE AUTENTICAÇÃO COM SERVIÇO =================
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

// ================= ROTAS DE NOTIFICAÇÕES COM SERVIÇO =================
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

app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const notification = await NotificationService.markAsRead(
      req.params.id, 
      req.user.id
    );
    
    res.json({
      success: true,
      data: notification,
      message: 'Notificação marcada como lida'
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'mark notification read' });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/notifications/mark-all-read', requireAuth, empresaContext, async (req, res) => {
  try {
    const result = await NotificationService.markAllAsRead(
      req.empresa_id, 
      req.user.id
    );
    
    res.json({
      success: true,
      data: result,
      message: 'Todas notificações marcadas como lidas'
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'mark all notifications read' });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/notifications/unread-count', requireAuth, empresaContext, async (req, res) => {
  try {
    const count = await NotificationService.getUnreadCount(
      req.empresa_id, 
      req.user.id
    );
    
    res.json({
      success: true,
      data: { unread_count: count }
    });
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'get unread count' });
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS DE RELATÓRIOS COM SERVIÇO =================
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

app.get('/api/relatorios/performance-sistema', 
  requireAuth,
  async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          error: 'Acesso negado. Apenas administradores podem acessar este relatório.' 
        });
      }

      const report = await ReportsService.getSystemPerformanceReport();
      
      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'system performance report' });
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// ================= ROTAS DE CACHE MANAGEMENT =================
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

// ================= ROTAS EXISTENTES (MANTIDAS PARA COMPATIBILIDADE) =================
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API BizFlow FASE 5 COMPLETA funcionando!',
    timestamp: new Date().toISOString(),
    version: '5.5.0',
    features: [
      'Cache Service (Memory/Redis)', 
      'Prometheus Metrics', 
      'Rate Limiting',
      'Advanced Security',
      'Service Architecture',
      'Structured Logging',
      'Real-time Notifications',
      'Advanced Reporting',
      'Health Monitoring',
      'WebSocket Real-time'
    ]
  });
});

// Dashboard Data (usando serviços)
app.get('/api/dashboard', requireAuth, empresaContext, cacheMiddleware(300, 'dashboard'), async (req, res) => {
  try {
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

// ================= ROTAS BÁSICAS (PRODUTOS, VENDAS, ETC) =================
app.get('/api/produtos', requireAuth, empresaContext, cacheMiddleware(120, 'produtos'), async (req, res) => {
  try {
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

// ================= WEBSOCKET INTEGRATION =================
io.on('connection', (socket) => {
  BizFlowLogger.businessLog('Nova conexão WebSocket', { socketId: socket.id });
  activeConnectionsGauge.inc();

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
        username: user.username
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
    BizFlowLogger.businessLog('Conexão WebSocket desconectada', { socketId: socket.id });
    activeConnectionsGauge.dec();
  });
});

// ================= TRATAMENTO DE ERROS =================
app.use((err, req, res, next) => {
  BizFlowLogger.errorLog(err, {
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor FASE 5 COMPLETA',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Contacte o suporte',
    request_id: crypto.randomUUID()
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    path: req.originalUrl
  });
});

// ================= GRACEFUL SHUTDOWN =================
async function gracefulShutdown() {
  BizFlowLogger.businessLog('Iniciando graceful shutdown...');
  
  try {
    server.close(() => {
      BizFlowLogger.businessLog('Servidor HTTP fechado');
    });

    await pool.end();
    BizFlowLogger.businessLog('Pool de conexões do PostgreSQL fechado');

    BizFlowLogger.businessLog('Graceful shutdown completado');
    process.exit(0);
  } catch (error) {
    BizFlowLogger.errorLog(error, { context: 'graceful shutdown' });
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ================= INICIALIZAÇÃO DO BANCO =================
async function initializeDatabase() {
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tablesSQL = `
      -- Tabela de empresas
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

      -- Tabela de usuários
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

      -- Tabela de sessões
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de produtos
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

      -- Tabela de vendas
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

      -- Tabela de itens da venda
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

      -- Tabela de notificações
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

      -- Tabela de contas financeiras
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

      -- Tabela de relatórios
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        report_type VARCHAR(100) NOT NULL,
        title VARCHAR(200) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para performance
      CREATE INDEX IF NOT EXISTS idx_sales_empresa_date ON sales(empresa_id, sale_date);
      CREATE INDEX IF NOT EXISTS idx_products_empresa_active ON products(empresa_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_financial_due_date ON financial_accounts(due_date);

      -- Inserir empresa padrão
      INSERT INTO empresas (id, nome, cnpj, email, telefone) 
      VALUES (1, 'Empresa Principal', '00.000.000/0001-00', 'contato@empresa.com', '(11) 9999-9999')
      ON CONFLICT (id) DO NOTHING;

      -- Inserir produtos de exemplo
      INSERT INTO products (empresa_id, name, description, price, stock_quantity, category) VALUES 
      (1, 'Smartphone Android', 'Smartphone Android 128GB', 899.90, 15, 'Eletrônicos'),
      (1, 'Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 8, 'Eletrônicos'),
      (1, 'Café Premium', 'Café em grãos 500g', 24.90, 50, 'Alimentação'),
      (1, 'Detergente', 'Detergente líquido 500ml', 3.90, 100, 'Limpeza'),
      (1, 'Água Mineral', 'Água mineral 500ml', 2.50, 200, 'Bebidas')
      ON CONFLICT DO NOTHING;

      -- Inserir vendas de exemplo
      INSERT INTO sales (empresa_id, sale_code, total_amount, total_items, payment_method) VALUES 
      (1, 'V001', 899.90, 1, 'cartão'),
      (1, 'V002', 1899.90, 1, 'dinheiro'),
      (1, 'V003', 52.80, 3, 'cartão'),
      (1, 'V004', 7.80, 2, 'dinheiro')
      ON CONFLICT DO NOTHING;

      -- Inserir itens das vendas
      INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price) VALUES 
      (1, 1, 'Smartphone Android', 1, 899.90, 899.90),
      (2, 2, 'Notebook i5', 1, 1899.90, 1899.90),
      (3, 3, 'Café Premium', 2, 24.90, 49.80),
      (3, 5, 'Água Mineral', 1, 2.50, 2.50),
      (4, 4, 'Detergente', 2, 3.90, 7.80)
      ON CONFLICT DO NOTHING;

      -- Inserir contas financeiras de exemplo
      INSERT INTO financial_accounts (empresa_id, name, type, amount, due_date, status) VALUES 
      (1, 'Venda Cliente A', 'receita', 1500.00, '2024-01-20', 'recebido'),
      (1, 'Aluguel', 'despesa', 1200.00, '2024-01-15', 'pago'),
      (1, 'Salários', 'despesa', 5000.00, '2024-01-25', 'pendente'),
      (1, 'Venda Online', 'receita', 890.50, '2024-01-18', 'recebido')
      ON CONFLICT DO NOTHING;

      -- Inserir notificações de exemplo
      INSERT INTO notifications (empresa_id, user_id, title, message, type) VALUES 
      (1, NULL, 'Sistema Iniciado', 'Sistema BizFlow FASE 5 COMPLETA iniciado com sucesso!', 'success'),
      (1, NULL, 'Bem-vindo', 'Bem-vindo ao sistema BizFlow FASE 5 COMPLETA', 'info'),
      (1, NULL, 'Relatórios Disponíveis', 'Todos os relatórios estão disponíveis', 'info')
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

// ================= INICIALIZAÇÃO DO SERVIDOR =================
async function startServer() {
  try {
    BizFlowLogger.businessLog('Iniciando BizFlow Server FASE 5 COMPLETA PRODUÇÃO...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Inicializar Cache Service
    await CacheService.init();
    
    // Iniciar servidor
    server.listen(PORT, HOST, () => {
      const cacheType = CacheService.redisEnabled ? 'Redis' : 'Memory';
      
      BizFlowLogger.businessLog(`
╔══════════════════════════════════════════════════════════════╗
║              🚀 BIZFLOW FASE 5 COMPLETA                    ║
║           SISTEMA DE PRODUÇÃO & ESCALABILIDADE             ║
╠══════════════════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                                  ║
║ 🌐 Host: ${HOST}                                                 ║
║ 🗄️  Banco: PostgreSQL                                         ║
║ 🔴 Cache: ✅ ${cacheType} CACHE ATIVADO                        ║
║ 📊 Prometheus: ✅ MÉTRICAS ATIVADAS                          ║
║ 🔌 WebSocket: ✅ ATIVADO                                      ║
║ 📈 Services: ✅ AUTH, NOTIFICATIONS, REPORTS                 ║
║ 🛡️  Segurança: ✅ RATE LIMITING + HELMET                     ║
║ 📝 Logs: ✅ SISTEMA ESTRUTURADO                             ║
║ 🌐 API Status: /api/status                                   ║
║ ❤️  Health Check: /health                                    ║
║ 📈 Métricas: /metrics                                        ║
║ 👤 Usuário: admin                                            ║
║ 🔑 Senha: admin123                                           ║
║ 🌐 URL: https://bizflow-app-xvcw.onrender.com               ║
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
  CacheService as cacheService,
  BizFlowLogger as logger 
};
