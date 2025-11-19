// server.js - SISTEMA BIZFLOW FASE 5.1 - CORREÇÃO DEFINITIVA
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

// ✅ CONFIGURAÇÃO ES6 MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ✅ CONFIGURAÇÃO
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// ✅ CONFIGURAÇÃO POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ================= MIDDLEWARES =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ FAVICON
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ================= HEALTH CHECK =================
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '5.1.0',
      phase: 'FASE 5.1 - Sistema Otimizado & Corrigido'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      error: error.message 
    });
  }
});

// ================= INICIALIZAÇÃO DO BANCO =================
async function initializeDatabase() {
  try {
    console.log('🔍 Inicializando banco de dados FASE 5.1...');
    
    // ✅ CRIAR TABELAS E USUÁRIO ADMIN
    await createTables();
    await createAdminUser();
    
    console.log('✅ Banco inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro na inicialização do banco:', error);
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- ✅ TABELA DE SESSÕES SEM empresa_id (CORREÇÃO FASE 5.1)
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de produtos
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

      -- Tabela de vendas
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        sale_code VARCHAR(50) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Inserir empresa padrão
      INSERT INTO empresas (id, nome, cnpj, email, telefone) 
      VALUES (1, 'Empresa Principal', '00.000.000/0001-00', 'contato@empresa.com', '(11) 9999-9999')
      ON CONFLICT (id) DO NOTHING;

      -- Inserir produtos de exemplo
      INSERT INTO products (empresa_id, name, description, price, stock_quantity) VALUES 
      (1, 'Smartphone Android', 'Smartphone Android 128GB', 899.90, 15),
      (1, 'Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 8),
      (1, 'Café Premium', 'Café em grãos 500g', 24.90, 50),
      (1, 'Detergente', 'Detergente líquido 500ml', 3.90, 100)
      ON CONFLICT DO NOTHING;

      -- Inserir notificações de exemplo
      INSERT INTO notifications (empresa_id, user_id, title, message, type) VALUES 
      (1, 1, 'Sistema Iniciado', 'Sistema BizFlow FASE 5.1 iniciado com sucesso!', 'success'),
      (1, 1, 'Bem-vindo', 'Bem-vindo ao sistema BizFlow FASE 5.1', 'info')
      ON CONFLICT DO NOTHING;
    `;

    await client.query(tablesSQL);
    await client.query('COMMIT');
    console.log('✅ Tabelas criadas/verificadas com sucesso!');
    
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
    console.log('👤 Verificando usuário admin...');
    
    // ✅ VERIFICAR SE ADMIN JÁ EXISTE
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1', 
      ['admin']
    );

    if (userCheck.rows.length === 0) {
      console.log('🔄 Criando usuário admin...');
      
      // ✅ CRIAR SENHA HASH CORRETAMENTE
      const passwordHash = await bcrypt.hash('admin123', 12);
      
      await pool.query(
        `INSERT INTO users (empresa_id, username, email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin']
      );
      
      console.log('✅ Usuário admin criado com sucesso!');
      console.log('📧 Login: admin');
      console.log('🔑 Senha: admin123');
    } else {
      console.log('✅ Usuário admin já existe');
    }
  } catch (error) {
    console.error('❌ ERRO CRÍTICO ao criar usuário admin:', error);
    throw error;
  }
}

// ================= ROTAS PRINCIPAIS =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ✅ ROTA DE LOGIN - CORRIGIDA FASE 5.1
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Tentativa de login recebida...');
  
  try {
    const { username, password } = req.body;

    console.log('📧 Usuário:', username);

    // Validações
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    // Buscar usuário
    console.log('🔍 Buscando usuário no banco...');
    const userResult = await pool.query(
      `SELECT id, username, email, password_hash, full_name, role, empresa_id 
       FROM users 
       WHERE username = $1 AND is_active = true 
       LIMIT 1`,
      [username]
    );

    console.log('📊 Usuários encontrados:', userResult.rows.length);

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

    // Gerar token de sessão
    const sessionToken = 'bizflow_' + Date.now() + '_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // ✅ SALVAR SESSÃO SEM empresa_id (CORREÇÃO FASE 5.1)
    await pool.query(
      `INSERT INTO user_sessions (user_id, session_token, expires_at) 
       VALUES ($1, $2, $3)`,
      [user.id, sessionToken, expiresAt]
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
    
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ================= ROTAS DA API =================

// Teste da API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API BizFlow FASE 5.1 funcionando!',
    timestamp: new Date().toISOString(),
    features: [
      'Sistema Multi-empresa',
      'Gestão Completa',
      'API REST',
      'WebSocket em Tempo Real',
      'Dashboard Interativo',
      'Sistema de Cache'
    ]
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

// Criar empresa
app.post('/api/empresas', async (req, res) => {
  try {
    const { nome, cnpj, email, telefone } = req.body;
    
    const result = await pool.query(
      `INSERT INTO empresas (nome, cnpj, email, telefone) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [nome, cnpj, email, telefone]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "Empresa criada com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar empresa:', error);
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

// Criar produto
app.post('/api/produtos', async (req, res) => {
  try {
    const { name, description, price, stock_quantity } = req.body;
    
    const result = await pool.query(
      `INSERT INTO products (empresa_id, name, description, price, stock_quantity) 
       VALUES (1, $1, $2, $3, $4) 
       RETURNING *`,
      [name, description, price, stock_quantity]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "Produto adicionado com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Vendas
app.get('/api/vendas', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sales ORDER BY sale_date DESC LIMIT 50'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar vendas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Criar venda
app.post('/api/vendas', async (req, res) => {
  try {
    const { total_amount, payment_method } = req.body;
    const sale_code = 'V' + Date.now();
    
    const result = await pool.query(
      `INSERT INTO sales (empresa_id, sale_code, total_amount, payment_method) 
       VALUES (1, $1, $2, $3) 
       RETURNING *`,
      [sale_code, total_amount, payment_method]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "Venda registrada com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar venda:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Notificações
app.get('/api/notifications', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10'
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

// Contas Financeiras
app.get('/api/financeiro', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM financial_accounts ORDER BY due_date, created_at DESC'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar contas financeiras:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Criar conta financeira
app.post('/api/financeiro', async (req, res) => {
  try {
    const { name, type, amount, due_date } = req.body;
    
    const result = await pool.query(
      `INSERT INTO financial_accounts (empresa_id, name, type, amount, due_date) 
       VALUES (1, $1, $2, $3, $4) 
       RETURNING *`,
      [name, type, amount, due_date]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "Conta financeira registrada com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar conta financeira:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Dashboard Data
app.get('/api/dashboard', async (req, res) => {
  try {
    const [
      empresasResult,
      produtosResult,
      vendasResult,
      usuariosResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM empresas WHERE is_active = true'),
      pool.query('SELECT COUNT(*) as total FROM products WHERE is_active = true'),
      pool.query('SELECT COUNT(*) as total, COALESCE(SUM(total_amount), 0) as total_vendas FROM sales'),
      pool.query('SELECT COUNT(*) as total FROM users WHERE is_active = true')
    ]);

    res.json({
      success: true,
      data: {
        total_empresas: parseInt(empresasResult.rows[0].total),
        total_produtos: parseInt(produtosResult.rows[0].total),
        total_vendas: parseInt(vendasResult.rows[0].total),
        total_usuarios: parseInt(usuariosResult.rows[0].total),
        faturamento_total: parseFloat(vendasResult.rows[0].total_vendas)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar dados do dashboard:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= WEBSOCKET FASE 5.1 =================
io.on('connection', (socket) => {
  console.log('🔌 Nova conexão WebSocket FASE 5.1:', socket.id);

  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      // ✅ CONSULTA SEM empresa_id (CORREÇÃO FASE 5.1)
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
            nome: user.full_name,
            username: user.username
          } 
        });
        console.log('✅ Usuário autenticado via WebSocket FASE 5.1:', user.username);
      } else {
        socket.emit('authenticated', { 
          success: false, 
          error: 'Autenticação falhou' 
        });
      }
    } catch (error) {
      console.error('Erro na autenticação WebSocket:', error);
      socket.emit('authenticated', { 
        success: false, 
        error: 'Erro interno' 
      });
    }
  });

  socket.on('join_dashboard', () => {
    socket.join('dashboard');
    console.log('📊 Socket entrou na sala do dashboard:', socket.id);
  });

  socket.on('new_sale', (data) => {
    // Broadcast para todos na sala do dashboard
    socket.to('dashboard').emit('sale_update', data);
    console.log('💰 Nova venda notificada via WebSocket');
  });

  socket.on('new_notification', (data) => {
    socket.broadcast.emit('notification_added', data);
    console.log('🔔 Nova notificação via WebSocket');
  });

  socket.on('disconnect', () => {
    console.log('🔌 Conexão WebSocket desconectada FASE 5.1:', socket.id);
  });
});

// Função para enviar notificações via WebSocket
function sendNotification(socket, title, message, type = 'info') {
  socket.emit('notification', {
    title,
    message,
    type,
    timestamp: new Date().toISOString()
  });
}

// ================= TRATAMENTO DE ERROS =================
app.use((err, req, res, next) => {
  console.error('💥 Erro não tratado:', err);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada'
  });
});

// ================= INICIALIZAÇÃO DO SERVIDOR =================
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
║ 🏢 Multi-empresa: ✅ ATIVADO                      ║
║ 📊 Dashboard: ✅ ATIVADO                          ║
║ 🔔 Notificações: ✅ ATIVADO                       ║
║ 💰 Gestão Financeira: ✅ ATIVADO                  ║
║ 👤 Usuário: admin                                ║
║ 🔑 Senha: admin123                               ║
╚══════════════════════════════════════════════════╝
      `);
    });
    
  } catch (error) {
    console.error('❌ Falha ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Iniciar o servidor
startServer();

export default app;
