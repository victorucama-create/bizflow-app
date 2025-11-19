// server.js - SISTEMA COMPLETO BIZFLOW FASE 5.1 - CORREÇÃO LOGIN
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

// ✅ CONFIGURAÇÃO ES6 MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// ✅ CONFIGURAÇÃO SOCKET.IO FASE 5.1
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

// ✅ CONFIGURAÇÃO POSTGRESQL FASE 5.1
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

app.use(cors({
  origin: "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(morgan('combined'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, error: 'Muitas requisições' }
});

app.use('/api/', apiLimiter);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ FAVICON
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// ================= HEALTH CHECKS FASE 5.1 =================
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '5.1.0',
      database: 'connected'
    });
  } catch (error) {
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
    
    // ✅ CRIAR TABELAS SE NÃO EXISTIREM
    await createTablesIfNotExist();
    
    // ✅ CRIAR USUÁRIO ADMIN SE NÃO EXISTIR
    await createAdminUser();
    
    console.log('✅ Banco FASE 5.1 inicializado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na inicialização do banco FASE 5.1:', error);
  }
}

async function createTablesIfNotExist() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // ✅ CRIAR TABELAS BÁSICAS
    const tablesSQL = `
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        cnpj VARCHAR(20) UNIQUE,
        email VARCHAR(100),
        telefone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        empresa_id INTEGER DEFAULT 1,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        sale_code VARCHAR(50) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed'
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

      -- Inserir empresa padrão
      INSERT INTO empresas (id, nome, cnpj, email, telefone) 
      VALUES (1, 'Empresa Principal', '00.000.000/0001-00', 'contato@empresa.com', '(11) 9999-9999')
      ON CONFLICT (id) DO NOTHING;
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

async function createAdminUser() {
  try {
    // ✅ VERIFICAR SE USUÁRIO ADMIN JÁ EXISTE
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1', 
      ['admin']
    );

    if (userCheck.rows.length === 0) {
      console.log('👤 Criando usuário admin...');
      
      // ✅ CRIAR SENHA HASH CORRETAMENTE
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(
        `INSERT INTO users (empresa_id, username, email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin']
      );
      
      console.log('✅ Usuário admin criado com sucesso!');
    } else {
      console.log('✅ Usuário admin já existe');
    }
  } catch (error) {
    console.error('❌ Erro ao criar usuário admin:', error);
  }
}

// ================= ROTAS PÚBLICAS FASE 5.1 =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ✅ ROTA DE LOGIN FASE 5.1 - CORRIGIDA E SIMPLIFICADA
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Recebida tentativa de login...');
  
  try {
    const { username, password } = req.body;

    console.log('📧 Usuário:', username);

    // Validações básicas
    if (!username || !password) {
      console.log('❌ Campos obrigatórios faltando');
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    // Buscar usuário
    console.log('🔍 Buscando usuário no banco...');
    const userResult = await pool.query(
      'SELECT id, username, email, password_hash, full_name, role, empresa_id FROM users WHERE username = $1 AND is_active = true LIMIT 1',
      [username]
    );

    console.log('📊 Resultado da busca:', userResult.rows.length, 'usuários encontrados');

    if (userResult.rows.length === 0) {
      console.log('❌ Usuário não encontrado:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    const user = userResult.rows[0];
    console.log('✅ Usuário encontrado:', user.username);

    // Verificar senha
    console.log('🔑 Verificando senha...');
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      console.log('❌ Senha inválida para:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    console.log('✅ Senha válida!');

    // Gerar token simples
    const sessionToken = 'bizflow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Salvar sessão
    await pool.query(
      `INSERT INTO user_sessions (user_id, session_token, empresa_id, expires_at) 
       VALUES ($1, $2, $3, $4)`,
      [user.id, sessionToken, user.empresa_id, expiresAt]
    );

    // Remover password hash da resposta
    const { password_hash, ...userWithoutPassword } = user;

    console.log('🎉 Login realizado com sucesso para:', username);

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
    console.error('📝 Stack trace:', error.stack);
    
    // Resposta de erro detalhada
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ================= ROTAS DA APLICAÇÃO =================

// Rota básica de teste
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API BizFlow FASE 5.1 funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Empresas
app.get('/api/empresas', async (req, res) => {
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

// Produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE is_active = true ORDER BY name'
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
app.get('/api/notifications', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20'
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

// ================= WEBSOCKET FASE 5.1 =================
io.on('connection', (socket) => {
  console.log('🔌 Nova conexão WebSocket:', socket.id);

  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      const sessionResult = await pool.query(
        `SELECT u.* FROM user_sessions us 
         JOIN users u ON us.user_id = u.id 
         WHERE us.session_token = $1 AND us.expires_at > NOW() AND u.is_active = true`,
        [token]
      );

      if (sessionResult.rows.length > 0) {
        const user = sessionResult.rows[0];
        socket.emit('authenticated', { 
          success: true, 
          user: { 
            id: user.id, 
            nome: user.full_name
          } 
        });
      } else {
        socket.emit('authenticated', { 
          success: false, 
          error: 'Autenticação falhou' 
        });
      }
    } catch (error) {
      socket.emit('authenticated', { 
        success: false, 
        error: 'Erro interno' 
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Conexão WebSocket desconectada:', socket.id);
  });
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
    console.log('🚀 Iniciando BizFlow Server FASE 5.1...');
    
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
║ 🔌 WebSocket: ✅ ATIVADO                          ║
║ 👤 Usuário: admin / admin123                     ║
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
