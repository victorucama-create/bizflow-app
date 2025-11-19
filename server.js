// server.js - SISTEMA BIZFLOW FASE 5 COMPLETA - PRODUÇÃO OTIMIZADA
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
import Redis from 'ioredis';
import client from 'prom-client';

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

// ================= REDIS CACHE - FASE 5.2 =================
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true
});

// Event handlers Redis
redis.on('connect', () => {
  logger.info('✅ Redis conectado com sucesso');
});

redis.on('error', (error) => {
  logger.error('❌ Erro Redis:', error);
});

redis.on('ready', () => {
  logger.info('🚀 Redis pronto para uso');
});

// ✅ ESTRATÉGIAS DE CACHE
const cacheStrategies = {
  // Cache de dados do dashboard (5 minutos)
  DASHBOARD: 300,
  // Cache de produtos (2 minutos)
  PRODUCTS: 120,
  // Cache de relatórios (10 minutos)
  REPORTS: 600,
  // Cache de sessões (24 horas)
  SESSIONS: 86400
};

// ✅ MIDDLEWARE DE CACHE GENÉRICO
const cacheMiddleware = (duration = 300, keyPrefix = 'cache') => {
  return async (req, res, next) => {
    // Skip cache para requests não-GET e usuários autenticados com parâmetros específicos
    if (req.method !== 'GET' || req.query.nocache) {
      return next();
    }

    const cacheKey = `${keyPrefix}:${req.originalUrl}`;
    
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        // Incrementar métrica de cache hit
        cacheHitCounter.inc();
        return res.json(JSON.parse(cachedData));
      }

      // Incrementar métrica de cache miss
      cacheMissCounter.inc();
      
      // Sobrescrever res.json para capturar a resposta
      const originalJson = res.json;
      res.json = function(data) {
        if (data.success !== false) {
          redis.setex(cacheKey, duration, JSON.stringify(data))
            .catch(err => logger.error('Erro ao salvar cache:', err));
        }
        originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      logger.error('Erro no cache middleware:', error);
      next();
    }
  };
};

// ================= MONITORAMENTO PROMETHEUS - FASE 5.3 =================
// Coletor de métricas padrão
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
    logger.error('Erro ao coletar métricas:', error);
    res.status(500).end();
  }
});

// ================= LOGGER ESTRUTURADO FASE 5.3 =================
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// ================= CONFIGURAÇÃO POSTGRESQL OTIMIZADA FASE 5.1 =================
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

// ================= RATE LIMITING AVANÇADO FASE 5.3 =================
// Store customizado para Redis
const RedisStore = {
  incr: async (key, callback) => {
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, 15 * 60); // 15 minutos
      }
      callback(null, current, 15 * 60 * 1000);
    } catch (error) {
      callback(error);
    }
  },
  decrement: async (key) => {
    await redis.decr(key);
  },
  resetKey: async (key) => {
    await redis.del(key);
  }
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: async (req) => {
    // Limites dinâmicos baseados no tipo de usuário
    if (req.user?.role === 'admin') return 5000;
    if (req.user) return 1000;
    return 500; // Anônimos
  },
  message: {
    success: false,
    error: 'Muitas requisições deste IP - tente novamente mais tarde'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Não aplicar rate limiting a métricas e health checks
    return req.path === '/metrics' || req.path === '/health';
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Apenas 5 tentativas por IP
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
  stream: { write: message => logger.info(message.trim()) } 
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ APLICAR RATE LIMITING
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// ================= MIDDLEWARES PERSONALIZADOS =================

// ✅ MIDDLEWARE DE AUTENTICAÇÃO COM CACHE
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token de autenticação não fornecido' 
      });
    }

    // Tentar buscar do cache primeiro
    const cacheKey = `session:${token}`;
    let userSession = await redis.get(cacheKey);
    
    if (userSession) {
      req.user = JSON.parse(userSession);
      return next();
    }

    // Se não encontrou no cache, buscar no banco
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
      return res.status(401).json({ 
        success: false, 
        error: 'Sessão expirada ou inválida' 
      });
    }

    req.user = sessionResult.rows[0];
    
    // Salvar no cache por 1 hora
    await redis.setex(cacheKey, 3600, JSON.stringify(req.user));
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
}

// ✅ MIDDLEWARE DE CONTEXTO EMPRESARIAL
async function empresaContext(req, res, next) {
  try {
    let empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || req.body.empresa_id;
    
    if (!empresaId && req.user) {
      empresaId = req.user.empresa_id;
    }
    
    if (!empresaId) {
      // Tentar cache primeiro
      const cacheKey = 'empresa:default';
      let defaultEmpresa = await redis.get(cacheKey);
      
      if (defaultEmpresa) {
        empresaId = JSON.parse(defaultEmpresa).id;
      } else {
        // Buscar do banco
        const empresaResult = await queryWithMetrics(
          'SELECT id FROM empresas WHERE is_active = true ORDER BY id LIMIT 1',
          [],
          'select',
          'empresas'
        );
        empresaId = empresaResult.rows.length > 0 ? empresaResult.rows[0].id : 1;
        
        // Salvar no cache
        await redis.setex(cacheKey, 300, JSON.stringify({ id: empresaId }));
      }
    }
    
    req.empresa_id = parseInt(empresaId);
    next();
  } catch (error) {
    logger.error('Erro no contexto empresarial:', error);
    req.empresa_id = 1;
    next();
  }
}

// ✅ VALIDAÇÃO DE ENTRADA AVANÇADA
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

// ✅ SANITIZAÇÃO DE INPUT
function sanitizeInput(fields) {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = req.body[field].trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    });
    next();
  };
}

// ================= HEALTH CHECK AVANÇADO FASE 5.5 =================
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  const healthChecks = {};
  
  try {
    // Testar conexão com o banco
    healthChecks.database = await testDatabaseConnection();
    
    // Testar conexão com Redis
    healthChecks.redis = await testRedisConnection();
    
    // Coletar métricas do sistema
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

    // Status geral baseado nos health checks
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
    logger.error('Health check failed:', error);
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

async function testRedisConnection() {
  try {
    await redis.ping();
    return { status: 'healthy', latency: 'ok' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

// ================= STATUS DO SISTEMA FASE 5.5 =================
app.get('/api/status', cacheMiddleware(60, 'status'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Coletar métricas completas do sistema
    const [dbMetrics, businessMetrics, systemInfo, cacheMetrics] = await Promise.all([
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
      getCacheMetrics()
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
        cache: cacheMetrics,
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
    logger.error('Status check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar status do sistema',
      details: error.message
    });
  }
});

async function getCacheMetrics() {
  try {
    const redisInfo = await redis.info();
    const keys = await redis.keys('*');
    
    return {
      status: 'connected',
      total_keys: keys.length,
      memory_used: redisInfo.split('\r\n').find(line => line.startsWith('used_memory_human'))?.split(':')[1] || 'unknown',
      hit_rate: 'active' // Seria calculado com métricas mais detalhadas
    };
  } catch (error) {
    return {
      status: 'disconnected',
      error: error.message
    };
  }
}

// ================= INICIALIZAÇÃO DO BANCO FASE 5.1 =================
async function initializeDatabase() {
  try {
    logger.info('🔍 Inicializando banco de dados FASE 5 COMPLETA...');
    
    // ✅ CRIAR TABELAS E USUÁRIO ADMIN
    await createTables();
    await createAdminUser();
    
    logger.info('✅ Banco inicializado com sucesso!');
  } catch (error) {
    logger.error('❌ Erro na inicialização do banco:', error);
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

      -- ✅ TABELA DE SESSÕES SEM empresa_id (CORREÇÃO FASE 5.1)
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

      -- Índices para performance FASE 5.1
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
    logger.info('✅ Tabelas criadas/verificadas com sucesso!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Erro ao criar tabelas:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function createAdminUser() {
  try {
    logger.info('👤 Verificando usuário admin...');
    
    const userCheck = await queryWithMetrics(
      'SELECT id FROM users WHERE username = $1', 
      ['admin'],
      'select',
      'users'
    );

    if (userCheck.rows.length === 0) {
      logger.info('🔄 Criando usuário admin...');
      
      const passwordHash = await bcrypt.hash('admin123', 12);
      
      await queryWithMetrics(
        `INSERT INTO users (empresa_id, username, email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin'],
        'insert',
        'users'
      );
      
      logger.info('✅ Usuário admin criado com sucesso!');
    } else {
      logger.info('✅ Usuário admin já existe');
    }
  } catch (error) {
    logger.error('❌ ERRO CRÍTICO ao criar usuário admin:', error);
    throw error;
  }
}

// ================= ROTAS PRINCIPAIS =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ✅ FAVICON
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ================= ROTAS DE AUTENTICAÇÃO =================
app.post('/api/auth/login', authLimiter, sanitizeInput(['username', 'password']), async (req, res) => {
  logger.info('🔐 Tentativa de login recebida...');
  
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
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
      logger.warn('Tentativa de login com usuário inválido:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    const user = userResult.rows[0];

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      logger.warn('Tentativa de login com senha inválida para:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    // Gerar token de sessão
    const sessionToken = 'bizflow_' + Date.now() + '_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // ✅ SALVAR SESSÃO SEM empresa_id (CORREÇÃO FASE 5.1)
    await queryWithMetrics(
      `INSERT INTO user_sessions (user_id, session_token, expires_at) 
       VALUES ($1, $2, $3)`,
      [user.id, sessionToken, expiresAt],
      'insert',
      'user_sessions'
    );

    // Salvar sessão no cache
    const cacheKey = `session:${sessionToken}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(user));

    // Remover password hash da resposta
    const { password_hash, ...userWithoutPassword } = user;

    logger.info('🎉 Login realizado com sucesso para:', username);

    res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      data: {
        user: userWithoutPassword,
        session_token: sessionToken,
        expires_at: expiresAt
      }
    });

  } catch (error) {
    logger.error('💥 ERRO CRÍTICO NO LOGIN:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ================= ROTAS DA API COM AUTENTICAÇÃO E CACHE =================

// Teste da API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API BizFlow FASE 5 COMPLETA funcionando!',
    timestamp: new Date().toISOString(),
    version: '5.5.0',
    features: ['Redis Cache', 'Prometheus Metrics', 'Rate Limiting', 'Advanced Security']
  });
});

// Empresas
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
    logger.error('Erro ao buscar empresas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Produtos
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
    logger.error('Erro ao buscar produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Dashboard Data
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
      queryWithMetrics('SELECT COUNT(*) as total FROM notifications WHERE empresa_id = $1 AND is_read = false', [req.empresa_id], 'select', 'notifications')
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
        notificacoes_nao_lidas: parseInt(notificacoesResult.rows[0].total)
      }
    });
  } catch (error) {
    logger.error('Erro ao buscar dados do dashboard:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS DE RELATÓRIOS COM CACHE =================

// Relatório de Vendas
app.get('/api/relatorios/vendas', requireAuth, empresaContext, cacheMiddleware(600, 'relatorios'), async (req, res) => {
  try {
    const { periodo = '7' } = req.query;
    const dias = parseInt(periodo);
    
    const result = await queryWithMetrics(
      `SELECT 
        DATE(s.sale_date) as data,
        COUNT(*) as total_vendas,
        SUM(s.total_amount) as total_valor,
        AVG(s.total_amount) as valor_medio,
        s.payment_method,
        COUNT(DISTINCT s.id) as vendas_por_dia
      FROM sales s
      WHERE s.empresa_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'
      GROUP BY DATE(s.sale_date), s.payment_method
      ORDER BY data DESC, s.payment_method`,
      [req.empresa_id],
      'select',
      'sales'
    );
    
    // Estatísticas resumidas
    const statsResult = await queryWithMetrics(
      `SELECT 
        COUNT(*) as total_vendas_periodo,
        SUM(s.total_amount) as total_faturado,
        AVG(s.total_amount) as ticket_medio,
        MAX(s.total_amount) as maior_venda,
        MIN(s.total_amount) as menor_venda
      FROM sales s
      WHERE s.empresa_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'`,
      [req.empresa_id],
      'select',
      'sales'
    );
    
    res.json({
      success: true,
      data: {
        detalhes: result.rows,
        estatisticas: statsResult.rows[0] || {
          total_vendas_periodo: 0,
          total_faturado: 0,
          ticket_medio: 0,
          maior_venda: 0,
          menor_venda: 0
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao gerar relatório de vendas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= WEBSOCKET FASE 5.5 =================
io.on('connection', (socket) => {
  logger.info('🔌 Nova conexão WebSocket FASE 5:', socket.id);
  activeConnectionsGauge.inc();

  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      // Verificar cache primeiro
      const cacheKey = `session:${token}`;
      let user = await redis.get(cacheKey);
      
      if (user) {
        user = JSON.parse(user);
      } else {
        // Buscar do banco
        const sessionResult = await queryWithMetrics(
          `SELECT u.* FROM user_sessions us 
           JOIN users u ON us.user_id = u.id 
           WHERE us.session_token = $1 AND us.expires_at > NOW() AND u.is_active = true`,
          [token],
          'select',
          'user_sessions'
        );

        if (sessionResult.rows.length === 0) {
          socket.emit('authenticated', { 
            success: false, 
            error: 'Autenticação falhou' 
          });
          return;
        }
        
        user = sessionResult.rows[0];
        // Salvar no cache
        await redis.setex(cacheKey, 3600, JSON.stringify(user));
      }

      socket.join(`empresa-${user.empresa_id}`);
      socket.emit('authenticated', { 
        success: true, 
        user: { 
          id: user.id, 
          nome: user.full_name,
          username: user.username,
          empresa_id: user.empresa_id
        } 
      });
      logger.info('✅ Usuário autenticado via WebSocket FASE 5:', user.username);
    } catch (error) {
      logger.error('Erro na autenticação WebSocket:', error);
      socket.emit('authenticated', { 
        success: false, 
        error: 'Erro interno' 
      });
    }
  });

  socket.on('disconnect', () => {
    logger.info('🔌 Conexão WebSocket desconectada FASE 5:', socket.id);
    activeConnectionsGauge.dec();
  });
});

// ================= TRATAMENTO DE ERROS FASE 5.5 =================
app.use((err, req, res, next) => {
  logger.error('💥 Erro não tratado:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor FASE 5',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Contacte o suporte',
    request_id: req.id || crypto.randomUUID()
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    path: req.originalUrl
  });
});

// ================= GRACEFUL SHUTDOWN FASE 5.5 =================
async function gracefulShutdown() {
  logger.info('🔄 Iniciando graceful shutdown...');
  
  try {
    // Parar de aceitar novas conexões
    server.close(() => {
      logger.info('✅ Servidor HTTP fechado');
    });

    // Fechar conexões do Redis
    await redis.quit();
    logger.info('✅ Conexão Redis fechada');

    // Fechar pool do PostgreSQL
    await pool.end();
    logger.info('✅ Pool de conexões do PostgreSQL fechado');

    logger.info('🎯 Graceful shutdown completado');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Erro durante graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ================= INICIALIZAÇÃO DO SERVIDOR FASE 5 COMPLETA =================
async function startServer() {
  try {
    logger.info('🚀 Iniciando BizFlow Server FASE 5 COMPLETA PRODUÇÃO...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Iniciar servidor
    server.listen(PORT, HOST, () => {
      logger.info(`
╔══════════════════════════════════════════════════════════════╗
║              🚀 BIZFLOW FASE 5 COMPLETA                    ║
║           SISTEMA DE PRODUÇÃO & ESCALABILIDADE             ║
╠══════════════════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                                  ║
║ 🌐 Host: ${HOST}                                                 ║
║ 🗄️  Banco: PostgreSQL                                         ║
║ 🔴 Redis: ✅ CACHE ATIVADO                                    ║
║ 📊 Prometheus: ✅ MÉTRICAS ATIVADAS                          ║
║ 🔌 WebSocket: ✅ ATIVADO                                      ║
║ 📈 Dashboard: ✅ COM CACHE                                    ║
║ 🛡️  Segurança: ✅ RATE LIMITING + HELMET                     ║
║ 📝 Logs: ✅ WINSTON ESTRUTURADO                             ║
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
    logger.error('❌ Falha ao iniciar servidor FASE 5:', error);
    process.exit(1);
  }
}

// Iniciar o servidor
startServer();

export { app, io, pool, redis, logger, queryWithMetrics };
