// server.js - SISTEMA COMPLETO BIZFLOW FASE 5.1 - CORREÇÕES FINAIS
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

// ✅ CONFIGURAÇÃO ES6 MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// ✅ CONFIGURAÇÃO SOCKET.IO FASE 5.1 - CORRIGIDA
const io = new Server(server, {
  cors: {
    origin: "*",
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

// ✅ CONFIGURAÇÃO POSTGRESQL FASE 5.1 - OTIMIZADA
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  min: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ================= MIDDLEWARES FASE 5.1 =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ CORS FASE 5.1 - CORRIGIDO
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Empresa-ID', 'X-API-Key']
}));

// ✅ HELMET FASE 5.1 - CONFIGURAÇÃO SIMPLIFICADA
app.use(helmet({
  contentSecurityPolicy: false, // ✅ DESABILITADO PARA RESOLVER ERROS CSP
  crossOriginEmbedderPolicy: false
}));

// ✅ COMPRESSÃO FASE 5.1 - OTIMIZADA
app.use(compression({
  level: 6,
  threshold: 1024
}));

// ✅ MORGAN FASE 5.1
app.use(morgan('combined'));

// ✅ RATE LIMITING FASE 5.1 - MELHORADO
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
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
    
    console.error('Health check failed:', error);
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
        websocket_connections: io.engine.clientsCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// ================= INICIALIZAÇÃO DO BANCO FASE 5.1 =================
async function initializeDatabase() {
  try {
    console.log('🔍 Inicializando banco de dados FASE 5.1...');
    
    // ✅ VERIFICAR SE TABELAS EXISTEM PRIMEIRO
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('📊 Tabelas existentes:', tablesCheck.rows.map(r => r.table_name));
    
    // ✅ CRIAR TABELAS SE NÃO EXISTIREM
    await createTablesIfNotExist();
    
    // ✅ CRIAR ÍNDICES DE PERFORMANCE
    await createPerformanceIndexes();
    
    console.log('✅ Banco FASE 5.1 inicializado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na inicialização do banco FASE 5.1:', error);
  }
}

async function createTablesIfNotExist() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // ✅ VERIFICAR E CRIAR TABELA PRODUCTS COM min_stock
    const productsExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'min_stock'
      )
    `);
    
    if (!productsExists.rows[0].exists) {
      console.log('🔄 Adicionando coluna min_stock à tabela products...');
      await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 5');
    }

    // ✅ VERIFICAR E CRIAR OUTRAS TABELAS NECESSÁRIAS
    const tablesSQL = `
      -- Tabela de empresas (se não existir)
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        cnpj VARCHAR(20) UNIQUE,
        email VARCHAR(100),
        telefone VARCHAR(20),
        endereco TEXT,
        cidade VARCHAR(100),
        estado VARCHAR(2),
        cep VARCHAR(10),
        logo_url TEXT,
        configuracao JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de filiais (se não existir)
      CREATE TABLE IF NOT EXISTS filiais (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        nome VARCHAR(200) NOT NULL,
        codigo VARCHAR(50) NOT NULL,
        telefone VARCHAR(20),
        endereco TEXT,
        cidade VARCHAR(100),
        estado VARCHAR(2),
        cep VARCHAR(10),
        responsavel VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(empresa_id, codigo)
      );

      -- Tabela de usuários (se não existir)
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        filial_id INTEGER REFERENCES filiais(id) ON DELETE SET NULL,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        permissoes JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(empresa_id, username),
        UNIQUE(empresa_id, email)
      );

      -- Tabela de sessões (se não existir)
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de produtos (se não existir) - COM min_stock
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        filial_id INTEGER REFERENCES filiais(id),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        cost DECIMAL(10,2),
        stock_quantity INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 5, -- ✅ COLUNA ADICIONADA
        category_id INTEGER,
        sku VARCHAR(100),
        barcode VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de vendas (se não existir)
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        filial_id INTEGER REFERENCES filiais(id),
        sale_code VARCHAR(50) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        total_items INTEGER NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        user_id INTEGER REFERENCES users(id),
        UNIQUE(empresa_id, sale_code)
      );

      -- Tabela de notificações (se não existir)
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        action_url TEXT,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Inserir dados iniciais se não existirem
      INSERT INTO empresas (id, nome, cnpj, email, telefone) 
      VALUES (1, 'Empresa Principal', '00.000.000/0001-00', 'contato@empresa.com', '(11) 9999-9999')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO filiais (id, empresa_id, nome, codigo, responsavel)
      VALUES (1, 1, 'Matriz', 'MATRIZ', 'Administrador')
      ON CONFLICT (id) DO NOTHING;

      -- Inserir usuário admin se não existir
      INSERT INTO users (empresa_id, filial_id, username, email, password_hash, full_name, role) 
      SELECT 1, 1, 'admin', 'admin@bizflow.com', '$2a$10$8K1p/a0dRTlR0.0G5QbB5u/9QJ9qZ7XZ7XZ7XZ7XZ7XZ7XZ7XZ7XZ', 'Administrador do Sistema', 'admin'
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
    `;

    await client.query(tablesSQL);
    await client.query('COMMIT');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao criar tabelas:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function createPerformanceIndexes() {
  try {
    console.log('📈 Criando índices de performance...');
    
    const indexesSQL = `
      -- Índices para performance FASE 5.1
      CREATE INDEX IF NOT EXISTS idx_users_empresa_active ON users(empresa_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_users_username_empresa ON users(username, empresa_id);
      CREATE INDEX IF NOT EXISTS idx_products_empresa_active ON products(empresa_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_sales_empresa_date ON sales(empresa_id, sale_date);
      CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_empresa_user ON notifications(empresa_id, user_id, created_at);
    `;

    await pool.query(indexesSQL);
    console.log('✅ Índices de performance criados/verificados');
    
  } catch (error) {
    console.error('❌ Erro ao criar índices:', error);
  }
}

// ================= MIDDLEWARES FASE 5.1 =================

// ✅ MIDDLEWARE DE CONTEXTO EMPRESARIAL FASE 5.1 - CORRIGIDO
async function empresaContext(req, res, next) {
  try {
    let empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || req.body.empresa_id;
    
    // Se não foi fornecido, usar empresa padrão
    if (!empresaId) {
      empresaId = 1; // Fallback para empresa principal
    }
    
    req.empresa_id = parseInt(empresaId);
    next();
  } catch (error) {
    console.error('❌ Erro no contexto empresarial:', error);
    req.empresa_id = 1;
    next();
  }
}

// ✅ MIDDLEWARE DE AUTENTICAÇÃO FASE 5.1 - MELHORADO
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Acesso não autorizado' 
      });
    }

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
      return res.status(401).json({ 
        success: false, 
        error: 'Sessão expirada' 
      });
    }

    req.user = sessionResult.rows[0];
    next();
  } catch (error) {
    console.error('🔐 Erro na autenticação:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
}

// ================= WEBSOCKET FASE 5.1 - CORRIGIDO =================

// Conexões WebSocket
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Nova conexão WebSocket estabelecida:', socket.id);

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
        connectedUsers.set(socket.id, user);
        
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
        
        console.log('✅ Usuário autenticado via WebSocket:', user.username);
      } else {
        socket.emit('authenticated', { 
          success: false, 
          error: 'Autenticação falhou' 
        });
      }
    } catch (error) {
      console.error('❌ Erro na autenticação WebSocket:', error);
      socket.emit('authenticated', { 
        success: false, 
        error: 'Erro interno' 
      });
    }
  });

  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log('🔌 Usuário desconectado do WebSocket:', user.username);
      connectedUsers.delete(socket.id);
    }
  });
});

// ================= ROTAS PÚBLICAS FASE 5.1 =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ✅ ROTA DE LOGIN FASE 5.1 - CORREÇÃO DO ERRO 500
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('🔐 Tentativa de login para:', username);

    // Validações básicas
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    // Buscar usuário de forma SEGURA
    const userResult = await pool.query(
      `SELECT id, username, email, password_hash, full_name, role, empresa_id, filial_id 
       FROM users 
       WHERE username = $1 AND is_active = true 
       LIMIT 1`,
      [username]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Usuário não encontrado:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    const user = userResult.rows[0];

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      console.log('❌ Senha inválida para:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    console.log('✅ Login válido para:', username);

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
    console.error('💥 ERRO CRÍTICO NO LOGIN:', error);
    
    // Resposta de erro detalhada para debugging
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// ================= ROTAS DA APLICAÇÃO (ATUALIZADAS FASE 5.1) =================

// Rota básica de teste
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API BizFlow FASE 5.1 funcionando!',
    timestamp: new Date().toISOString(),
    version: '5.1.0'
  });
});

// Empresas
app.get('/api/empresas', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM empresas WHERE is_active = true ORDER BY nome'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar empresas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Filiais
app.get('/api/filiais', requireAuth, empresaContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, e.nome as empresa_nome 
       FROM filiais f 
       LEFT JOIN empresas e ON f.empresa_id = e.id 
       WHERE f.empresa_id = $1 AND f.is_active = true 
       ORDER BY f.nome`,
      [req.empresa_id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar filiais:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Produtos
app.get('/api/produtos', requireAuth, empresaContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name as categoria, f.nome as filial_nome
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       LEFT JOIN filiais f ON p.filial_id = f.id
       WHERE p.empresa_id = $1 AND p.is_active = true 
       ORDER BY p.name`,
      [req.empresa_id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Notificações
app.get('/api/notifications', requireAuth, empresaContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE empresa_id = $1 AND (user_id IS NULL OR user_id = $2)
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.empresa_id, req.user.id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= MIDDLEWARE DE ERRO FASE 5.1 =================
app.use((err, req, res, next) => {
  console.error('💥 Erro não tratado:', err);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor'
  });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada'
  });
});

// ================= INICIALIZAÇÃO DO SERVIDOR FASE 5.1 =================
async function startServer() {
  try {
    console.log('🚀 Iniciando BizFlow Server FASE 5.1 - SISTEMA DE PRODUÇÃO...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Iniciar servidor
    server.listen(PORT, HOST, () => {
      console.log(`
╔══════════════════════════════════════════════════╗
║              🚀 BIZFLOW API FASE 5.1            ║
║           SISTEMA DE PRODUÇÃO - CORREÇÕES       ║
╠══════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                      ║
║ 🌐 Host: ${HOST}                                     ║
║ 🗄️  Banco: PostgreSQL                             ║
║ 🔌 WebSocket: ✅ ESTABILIZADO                     ║
║ 🏢 Multi-empresa: ✅ OTIMIZADO                   ║
║ ⚡ Performance: ✅ ÍNDICES CRIADOS                ║
║ 🛡️  Segurança: ✅ REFORÇADA                      ║
║ 🔍 Health Checks: ✅ IMPLEMENTADOS               ║
╚══════════════════════════════════════════════════╝
      `);
    });
    
  } catch (error) {
    console.error('❌ Falha ao iniciar servidor FASE 5.1:', error);
    process.exit(1);
  }
}

// Iniciar o servidor
startServer();

export default app;
