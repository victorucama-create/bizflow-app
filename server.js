// server.js - SISTEMA COMPLETO BIZFLOW FASE 5.1 - CORREÇÕES CRÍTICAS
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
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import winston from 'winston';

// ✅ CONFIGURAÇÃO ES6 MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// ✅ CONFIGURAÇÃO SOCKET.IO FASE 5.1 - CORRIGIDA
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://bizflow-app-xvcw.onrender.com'] 
      : ['http://localhost:10000', 'http://127.0.0.1:10000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// ✅ CONFIGURAÇÃO RENDER-COMPATIBLE FASE 5.1
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'bizflow-fase5-secure-key-2024-production';

// ✅ CONFIGURAÇÃO LOGS FASE 5.1
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bizflow-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ✅ CONFIGURAÇÃO POSTGRESQL FASE 5.1 - OTIMIZADA
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  min: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  maxUses: 7500,
});

// ✅ HEALTH CHECK DO POOL FASE 5.1
pool.on('connect', (client) => {
  logger.info('✅ Nova conexão PostgreSQL estabelecida');
});

pool.on('error', (err, client) => {
  logger.error('❌ Erro no pool PostgreSQL:', err);
});

pool.on('remove', (client) => {
  logger.info('🔌 Cliente removido do pool PostgreSQL');
});

// ================= MIDDLEWARES FASE 5.1 =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ CORS FASE 5.1 - CORRIGIDO
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://bizflow-app-xvcw.onrender.com'] 
    : ['http://localhost:10000', 'http://127.0.0.1:10000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Empresa-ID', 'X-API-Key']
}));

// ✅ HELMET FASE 5.1 - CONFIGURADO
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// ✅ COMPRESSÃO FASE 5.1 - OTIMIZADA
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// ✅ MORGAN FASE 5.1 - COM WINSTON
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// ✅ RATE LIMITING FASE 5.1 - MELHORADO
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => {
    // Limites diferentes por tipo de requisição
    if (req.path.includes('/api/')) return 1000;
    if (req.path.includes('/api/v1/')) return 500;
    return 200;
  },
  message: {
    success: false,
    error: 'Muitas requisições deste IP - tente novamente em 15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0'
}));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ FAVICON FASE 5.1
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// ================= HEALTH CHECKS FASE 5.1 =================
app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '5.1.0',
    phase: 'FASE 5.1 - Sistema de Produção & Escalabilidade',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'checking'
  };

  try {
    // Verificar banco de dados
    await pool.query('SELECT 1');
    healthCheck.database = 'connected';
    
    // Verificar WebSocket
    healthCheck.websocket = io.engine.clientsCount;
    
    res.json(healthCheck);
  } catch (error) {
    healthCheck.status = 'ERROR';
    healthCheck.database = 'disconnected';
    healthCheck.error = error.message;
    
    logger.error('Health check failed:', error);
    res.status(503).json(healthCheck);
  }
});

app.get('/health/detailed', async (req, res) => {
  try {
    const [
      dbResult,
      usersCount,
      productsCount,
      salesCount
    ] = await Promise.all([
      pool.query('SELECT 1'),
      pool.query('SELECT COUNT(*) FROM users WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM products WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM sales WHERE status = $1', ['completed'])
    ]);

    res.json({
      status: 'OK',
      database: 'connected',
      metrics: {
        active_users: parseInt(usersCount.rows[0].count),
        active_products: parseInt(productsCount.rows[0].count),
        completed_sales: parseInt(salesCount.rows[0].count),
        websocket_connections: io.engine.clientsCount,
        database_connections: pool.totalCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// ================= INICIALIZAÇÃO DO BANCO FASE 5.1 =================
async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    logger.info('🔍 Inicializando banco de dados FASE 5.1...');
    
    await client.query('BEGIN');

    // ✅ VERIFICAR E CRIAR ÍNDICES FASE 5.1
    const indexesSQL = `
      -- Índices para performance FASE 5.1
      CREATE INDEX IF NOT EXISTS idx_users_empresa_active ON users(empresa_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_users_username_empresa ON users(username, empresa_id);
      CREATE INDEX IF NOT EXISTS idx_products_empresa_active ON products(empresa_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_sales_empresa_date ON sales(empresa_id, sale_date);
      CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_financial_accounts_empresa_type ON financial_accounts(empresa_id, type);
      CREATE INDEX IF NOT EXISTS idx_financial_accounts_due_date ON financial_accounts(due_date);
      CREATE INDEX IF NOT EXISTS idx_notifications_empresa_user ON notifications(empresa_id, user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_empresa_date ON audit_logs(empresa_id, created_at);
      
      -- Índices para queries de relatórios
      CREATE INDEX IF NOT EXISTS idx_sales_date_amount ON sales(sale_date, total_amount);
      CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity, min_stock);
    `;

    await client.query(indexesSQL);
    logger.info('✅ Índices de performance criados/verificados');

    await client.query('COMMIT');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Erro na inicialização do banco FASE 5.1:', error);
  } finally {
    client.release();
  }
}

// ================= MIDDLEWARES FASE 5.1 =================

// ✅ MIDDLEWARE DE CONTEXTO EMPRESARIAL FASE 5.1 - CORRIGIDO
async function empresaContext(req, res, next) {
  const startTime = Date.now();
  
  try {
    let empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || req.body.empresa_id;
    
    logger.debug('🏢 Contexto empresarial - ID fornecido:', { empresaId, path: req.path });

    // Se não foi fornecido, usar empresa padrão
    if (!empresaId) {
      try {
        // Buscar empresa padrão de forma eficiente
        const empresaResult = await pool.query(
          'SELECT id FROM empresas WHERE is_active = true ORDER BY id LIMIT 1'
        );
        
        empresaId = empresaResult.rows.length > 0 ? empresaResult.rows[0].id : 1;
        logger.debug('✅ Empresa padrão definida:', empresaId);
      } catch (dbError) {
        logger.warn('⚠️ Erro ao buscar empresa padrão, usando fallback:', dbError);
        empresaId = 1;
      }
    }
    
    req.empresa_id = parseInt(empresaId);
    req.requestId = crypto.randomUUID();
    
    // Log da requisição
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info('📊 Requisição processada', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        empresaId: req.empresa_id,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent')
      });
    });
    
    next();
  } catch (error) {
    logger.error('❌ Erro no contexto empresarial:', error);
    // Continuar mesmo com erro no contexto
    req.empresa_id = 1;
    req.requestId = crypto.randomUUID();
    next();
  }
}

// ✅ MIDDLEWARE DE AUTENTICAÇÃO FASE 5.1 - MELHORADO
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      logger.warn('🔐 Tentativa de acesso sem token', { path: req.path });
      return res.status(401).json({ 
        success: false, 
        error: 'Acesso não autorizado' 
      });
    }

    // Verificar se é token JWT (API) ou session token (Web)
    if (token.startsWith('jwt_')) {
      // Autenticação JWT para API
      const jwtToken = token.replace('jwt_', '');
      try {
        const decoded = jwt.verify(jwtToken, JWT_SECRET);
        
        // Buscar usuário com cache básico
        const userResult = await pool.query(
          `SELECT u.*, e.nome as empresa_nome, f.nome as filial_nome 
           FROM users u 
           LEFT JOIN empresas e ON u.empresa_id = e.id 
           LEFT JOIN filiais f ON u.filial_id = f.id 
           WHERE u.id = $1 AND u.is_active = true`,
          [decoded.userId]
        );

        if (userResult.rows.length === 0) {
          logger.warn('🔐 Usuário JWT não encontrado', { userId: decoded.userId });
          return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
        }

        req.user = userResult.rows[0];
        logger.debug('✅ Usuário autenticado via JWT', { userId: req.user.id });
        next();
      } catch (jwtError) {
        logger.warn('🔐 Token JWT inválido', { error: jwtError.message });
        return res.status(401).json({ success: false, error: 'Token JWT inválido' });
      }
    } else {
      // Autenticação por sessão (Web)
      const sessionResult = await pool.query(
        `SELECT u.*, e.nome as empresa_nome, f.nome as filial_nome 
         FROM user_sessions us 
         JOIN users u ON us.user_id = u.id 
         LEFT JOIN empresas e ON u.empresa_id = e.id 
         LEFT JOIN filiais f ON u.filial_id = f.id 
         WHERE us.session_token = $1 AND us.expires_at > NOW() AND u.is_active = true`,
        [token]
      );

      if (sessionResult.rows.length === 0) {
        logger.warn('🔐 Sessão inválida ou expirada', { token: token.substring(0, 10) + '...' });
        return res.status(401).json({ 
          success: false, 
          error: 'Sessão expirada' 
        });
      }

      req.user = sessionResult.rows[0];
      logger.debug('✅ Usuário autenticado via sessão', { userId: req.user.id });
      next();
    }
  } catch (error) {
    logger.error('🔐 Erro na autenticação:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
}

// ✅ MIDDLEWARE DE PERMISSÕES FASE 5.1
function checkPermission(modulo, acao = 'read') {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Não autenticado' });
      }
      
      // Admin tem acesso total
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Verificar permissões do usuário
      const permissoes = req.user.permissoes || {};
      
      // Verificar acesso ao módulo
      if (modulo === '*' && permissoes['*'] && permissoes['*'].includes('*')) {
        return next();
      }
      
      if (permissoes[modulo] && (permissoes[modulo].includes('*') || permissoes[modulo].includes(acao))) {
        return next();
      }
      
      logger.warn('🔐 Acesso negado', {
        userId: req.user.id,
        modulo,
        acao,
        path: req.path
      });
      
      return res.status(403).json({ 
        success: false, 
        error: `Acesso negado: ${modulo}.${acao}` 
      });
      
    } catch (error) {
      logger.error('🔐 Erro na verificação de permissões:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  };
}

// ✅ MIDDLEWARE DE AUDITORIA FASE 5.1
async function logAudit(action, tableName, recordId, oldValues, newValues, req) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (empresa_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.empresa_id,
        req.user?.id,
        action,
        tableName,
        recordId,
        oldValues,
        newValues,
        req.ip,
        req.get('User-Agent')
      ]
    );
    
    logger.info('📝 Auditoria registrada', {
      action,
      tableName,
      recordId,
      userId: req.user?.id,
      empresaId: req.empresa_id
    });
  } catch (error) {
    logger.error('📝 Erro ao registrar auditoria:', error);
  }
}

// ================= WEBSOCKET FASE 5.1 - CORRIGIDO =================

// Conexões WebSocket
const connectedUsers = new Map();

io.on('connection', (socket) => {
  const connectionId = socket.id;
  logger.info('🔌 Nova conexão WebSocket estabelecida', { connectionId });

  // ✅ HEARTBEAT FASE 5.1
  socket.on('heartbeat', (data) => {
    socket.emit('heartbeat', { timestamp: Date.now() });
  });

  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      const sessionResult = await pool.query(
        `SELECT u.*, e.nome as empresa_nome 
         FROM user_sessions us 
         JOIN users u ON us.user_id = u.id 
         LEFT JOIN empresas e ON u.empresa_id = e.id 
         WHERE us.session_token = $1 AND us.expires_at > NOW() AND u.is_active = true`,
        [token]
      );

      if (sessionResult.rows.length > 0) {
        const user = sessionResult.rows[0];
        connectedUsers.set(connectionId, user);
        
        socket.join(`empresa_${user.empresa_id}`);
        socket.join(`user_${user.id}`);
        
        socket.emit('authenticated', { 
          success: true, 
          user: { 
            id: user.id, 
            nome: user.full_name,
            empresa_id: user.empresa_id
          } 
        });
        
        logger.info('✅ Usuário autenticado via WebSocket', {
          userId: user.id,
          username: user.username,
          connectionId
        });
      } else {
        socket.emit('authenticated', { 
          success: false, 
          error: 'Autenticação falhou' 
        });
        logger.warn('❌ Falha na autenticação WebSocket', { connectionId });
      }
    } catch (error) {
      logger.error('❌ Erro na autenticação WebSocket:', error);
      socket.emit('authenticated', { 
        success: false, 
        error: 'Erro interno' 
      });
    }
  });

  socket.on('join_room', (room) => {
    socket.join(room);
    logger.debug('🔌 Socket entrou na sala', { connectionId, room });
  });

  socket.on('disconnect', (reason) => {
    const user = connectedUsers.get(connectionId);
    if (user) {
      logger.info('🔌 Usuário desconectado do WebSocket', {
        userId: user.id,
        username: user.username,
        connectionId,
        reason
      });
      connectedUsers.delete(connectionId);
    } else {
      logger.info('🔌 Conexão WebSocket desconectada', { connectionId, reason });
    }
  });

  socket.on('error', (error) => {
    logger.error('❌ Erro no WebSocket:', { connectionId, error: error.message });
  });
});

// ✅ FUNÇÃO DE NOTIFICAÇÃO FASE 5.1
async function sendNotification(empresaId, userId, title, message, type = 'info', actionUrl = null) {
  try {
    // Salvar no banco
    const notificationResult = await pool.query(
      `INSERT INTO notifications (empresa_id, user_id, title, message, type, action_url) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [empresaId, userId, title, message, type, actionUrl]
    );

    const notification = notificationResult.rows[0];

    // Enviar via WebSocket
    if (userId) {
      io.to(`user_${userId}`).emit('notification', notification);
    } else {
      io.to(`empresa_${empresaId}`).emit('notification', notification);
    }

    logger.info('🔔 Notificação enviada', {
      empresaId,
      userId,
      title,
      type
    });

    return notification;
  } catch (error) {
    logger.error('❌ Erro ao enviar notificação:', error);
    throw error;
  }
}

// ================= ROTAS PÚBLICAS FASE 5.1 =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ✅ ROTA DE LOGIN FASE 5.1 - CORRIGIDA
app.post('/api/auth/login', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { username, password } = req.body;
    
    logger.info('🔐 Tentativa de login', { username });

    if (!username || !password) {
      logger.warn('🔐 Login com campos faltando', { username });
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    // Buscar usuário
    const userResult = await pool.query(
      `SELECT id, username, email, password_hash, full_name, role, empresa_id, filial_id 
       FROM users 
       WHERE username = $1 AND is_active = true 
       LIMIT 1`,
      [username]
    );

    if (userResult.rows.length === 0) {
      logger.warn('🔐 Login com usuário não encontrado', { username });
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    const user = userResult.rows[0];

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      logger.warn('🔐 Login com senha inválida', { username, userId: user.id });
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    // Gerar token de sessão
    const sessionToken = 'bizflow_' + Date.now() + '_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Salvar sessão
    await pool.query(
      `INSERT INTO user_sessions (user_id, session_token, empresa_id, expires_at) 
       VALUES ($1, $2, $3, $4)`,
      [user.id, sessionToken, user.empresa_id, expiresAt]
    );

    // Remover password hash da resposta
    const { password_hash, ...userWithoutPassword } = user;

    const duration = Date.now() - startTime;
    logger.info('✅ Login realizado com sucesso', {
      username,
      userId: user.id,
      duration: `${duration}ms`
    });

    // Resposta de sucesso
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
    const duration = Date.now() - startTime;
    logger.error('💥 ERRO CRÍTICO NO LOGIN:', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`
    });
    
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor'
    });
  }
});

// ================= MIDDLEWARE DE ERRO FASE 5.1 =================
app.use((err, req, res, next) => {
  logger.error('💥 Erro não tratado:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    empresaId: req.empresa_id,
    userId: req.user?.id
  });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message
  });
});

// 404 Handler
app.use('*', (req, res) => {
  logger.warn('🔍 Rota não encontrada', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: 'Rota não encontrada'
  });
});

// ================= INICIALIZAÇÃO DO SERVIDOR FASE 5.1 =================
async function startServer() {
  try {
    logger.info('🚀 Iniciando BizFlow Server FASE 5.1 - SISTEMA DE PRODUÇÃO...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Iniciar servidor
    server.listen(PORT, HOST, () => {
      logger.info(`
╔══════════════════════════════════════════════════╗
║              🚀 BIZFLOW API FASE 5.1            ║
║           SISTEMA DE PRODUÇÃO - CORREÇÕES       ║
╠══════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                      ║
║ 🌐 Host: ${HOST}                                     ║
║ 🗄️  Banco: PostgreSQL                             ║
║ 🔌 WebSocket: ✅ ESTABILIZADO                     ║
║ 📊 Logs: ✅ WINSTON IMPLEMENTADO                 ║
║ 🏢 Multi-empresa: ✅ OTIMIZADO                   ║
║ ⚡ Performance: ✅ ÍNDICES CRIADOS                ║
║ 🛡️  Segurança: ✅ REFORÇADA                      ║
║ 🔍 Health Checks: ✅ IMPLEMENTADOS               ║
╚══════════════════════════════════════════════════╝
      `);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('🔻 Recebido SIGTERM, encerrando graciosamente...');
      await pool.end();
      server.close(() => {
        logger.info('🔻 Servidor encerrado');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('🔻 Recebido SIGINT, encerrando graciosamente...');
      await pool.end();
      server.close(() => {
        logger.info('🔻 Servidor encerrado');
        process.exit(0);
      });
    });
    
  } catch (error) {
    logger.error('❌ Falha ao iniciar servidor FASE 5.1:', error);
    process.exit(1);
  }
}

// Iniciar o servidor
startServer();

export default app;
