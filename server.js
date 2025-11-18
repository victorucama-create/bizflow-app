// server.js - VERSÃO ESTABILIZADA COM AUTENTICAÇÃO
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

// ✅ CONFIGURAÇÃO ES6 MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ CONFIGURAÇÃO RENDER-COMPATIBLE
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// ✅ CONFIGURAÇÃO POSTGRESQL COM FALLBACK
let pool;
try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    // Configurações para prevenir timeouts
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    max: 20
  });

  pool.on('connect', () => {
    console.log('✅ Conectado ao PostgreSQL');
  });

  pool.on('error', (err) => {
    console.error('❌ Erro na conexão PostgreSQL:', err);
  });
} catch (error) {
  console.error('❌ Erro ao criar pool do PostgreSQL:', error);
  process.exit(1);
}

// ================= CONFIGURAÇÃO CSP =================
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net; img-src 'self' data: https:;"
  );
  next();
});

// ================= MIDDLEWARES =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(morgan('combined'));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ FAVICON
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// ================= MIDDLEWARE DE AUTENTICAÇÃO =================
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Acesso não autorizado. Faça login para continuar.' 
      });
    }

    const sessionResult = await pool.query(
      `SELECT u.*, us.expires_at 
       FROM user_sessions us 
       JOIN users u ON us.user_id = u.id 
       WHERE us.session_token = $1 AND us.expires_at > NOW() AND u.is_active = true`,
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Sessão expirada. Faça login novamente.' 
      });
    }

    req.user = sessionResult.rows[0];
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Acesso negado. Permissões de administrador necessárias.' 
    });
  }
  next();
}

// ================= INICIALIZAÇÃO DO BANCO =================
async function initializeDatabase() {
  try {
    console.log('🔍 Verificando banco de dados...');
    
    // Testar conexão
    await pool.query('SELECT 1');
    
    // Verificar se tabelas existem
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'products', 'categories')
    `);
    
    const existingTables = tablesCheck.rows.map(row => row.table_name);
    console.log('📊 Tabelas existentes:', existingTables);
    
    if (!existingTables.includes('users')) {
      console.log('🔄 Criando tabelas...');
      await createTables();
    } else {
      console.log('✅ Tabelas já existem');
      await ensureAdminUser();
    }
    
  } catch (error) {
    console.error('❌ Erro na inicialização do banco:', error);
    throw error;
  }
}

async function createTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tablesSQL = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        cost DECIMAL(10,2),
        stock_quantity INTEGER DEFAULT 0,
        category_id INTEGER REFERENCES categories(id),
        sku VARCHAR(100),
        barcode VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        sale_code VARCHAR(50) UNIQUE NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        total_items INTEGER NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT
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

      INSERT INTO categories (name, description) VALUES 
      ('Geral', 'Produtos diversos'),
      ('Eletrônicos', 'Dispositivos eletrônicos'),
      ('Alimentação', 'Produtos alimentícios'),
      ('Limpeza', 'Produtos de limpeza')
      ON CONFLICT DO NOTHING;

      INSERT INTO products (name, description, price, cost, stock_quantity, category_id, sku) VALUES 
      ('Smartphone Android', 'Smartphone Android 128GB', 899.90, 650.00, 15, 2, 'SP-AND001'),
      ('Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 1400.00, 8, 2, 'NB-I5001'),
      ('Café Premium', 'Café em grãos 500g', 24.90, 15.00, 50, 3, 'CF-PREM01'),
      ('Detergente', 'Detergente líquido 500ml', 3.90, 1.80, 100, 4, 'DT-LIQ01'),
      ('Água Mineral', 'Água mineral 500ml', 2.50, 0.80, 200, 3, 'AG-MIN01')
      ON CONFLICT DO NOTHING;
    `;

    await client.query(tablesSQL);
    await ensureAdminUser(client);
    await client.query('COMMIT');
    
    console.log('✅ Banco inicializado com sucesso!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao criar tabelas:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureAdminUser(client = pool) {
  try {
    const adminCheck = await client.query(
      'SELECT id FROM users WHERE username = $1',
      ['admin']
    );
    
    if (adminCheck.rows.length === 0) {
      console.log('👤 Criando usuário admin...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await client.query(
        `INSERT INTO users (username, email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        ['admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin']
      );
      
      console.log('✅ Usuário admin criado: admin / admin123');
    } else {
      console.log('✅ Usuário admin já existe');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar usuário admin:', error);
    throw error;
  }
}

// ================= ROTAS DE AUTENTICAÇÃO =================
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 Recebida requisição de login');
  
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    console.log('👤 Tentando login para:', username);

    // Buscar usuário
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
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
    console.log('✅ Usuário encontrado:', user.username);

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      console.log('❌ Senha inválida para:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    console.log('✅ Senha válida para:', username);

    // Gerar token de sessão
    const sessionToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    // Salvar sessão
    await pool.query(
      'INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, sessionToken, expiresAt]
    );

    // Remover password hash da resposta
    const { password_hash, ...userWithoutPassword } = user;

    console.log('🎉 Login bem-sucedido para:', user.username);

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
    console.error('💥 ERRO NO LOGIN:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    if (!username || !email || !password || !full_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Todos os campos são obrigatórios' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'A senha deve ter pelo menos 6 caracteres' 
      });
    }

    // Verificar se usuário já existe
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username ou email já estão em uso' 
      });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Criar usuário
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, full_name, role, created_at`,
      [username, email, passwordHash, full_name]
    );

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      data: userResult.rows[0]
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    await pool.query(
      'DELETE FROM user_sessions WHERE session_token = $1',
      [token]
    );

    res.json({
      success: true,
      message: 'Logout realizado com sucesso!'
    });

  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { password_hash, ...userWithoutPassword } = req.user;
    
    res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// ================= ROTAS PÚBLICAS =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ 
      status: 'OK', 
      service: 'BizFlow API',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: '🚀 BizFlow API funcionando!',
    authentication: 'enabled'
  });
});

// ================= ROTAS DEBUG =================
app.get('/api/debug/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role FROM users');
    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/debug/check-admin', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username FROM users WHERE username = $1', 
      ['admin']
    );
    
    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: 'Usuário admin não encontrado'
      });
    }

    res.json({
      success: true,
      userExists: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Debug check-admin error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ================= ROTAS PROTEGIDAS =================
app.get('/api/produtos', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name as categoria 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_active = true 
      ORDER BY p.name
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/vendas', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM sales 
      ORDER BY sale_date DESC 
      LIMIT 20
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar vendas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const salesResult = await pool.query(`
      SELECT COUNT(*) as total_vendas, 
             COALESCE(SUM(total_amount), 0) as receita_total
      FROM sales 
      WHERE sale_date >= CURRENT_DATE
    `);
    
    const lowStockResult = await pool.query(`
      SELECT COUNT(*) as alertas_estoque
      FROM products 
      WHERE stock_quantity <= 5 AND is_active = true
    `);
    
    const data = {
      receitaTotal: parseFloat(salesResult.rows[0].receita_total),
      totalVendas: parseInt(salesResult.rows[0].total_vendas),
      alertasEstoque: parseInt(lowStockResult.rows[0].alertas_estoque)
    };
    
    res.json({
      success: true,
      data: data
    });
    
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= INICIALIZAÇÃO DO SERVIDOR =================
async function startServer() {
  try {
    console.log('🚀 Iniciando BizFlow Server...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Iniciar servidor
    app.listen(PORT, HOST, () => {
      console.log(`
╔══════════════════════════════════════╗
║            🚀 BIZFLOW API           ║
║        Sistema de Gestão Integrada   ║
╠══════════════════════════════════════╣
║ 📍 Porta: ${PORT}                          ║
║ 🌐 Host: ${HOST}                         ║
║ 🗄️  Banco: PostgreSQL                 ║
║ 🔐 Autenticação: ATIVADA             ║
║ 🩺 Health: /health                    ║
║ 🔑 Login: POST /api/auth/login       ║
║ 👤 Register: POST /api/auth/register ║
║ 🐛 Debug: /api/debug/*               ║
╚══════════════════════════════════════╝
      `);
    });
    
  } catch (error) {
    console.error('❌ Falha crítica ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Recebido SIGTERM, encerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Recebido SIGINT, encerrando servidor...');
  await pool.end();
  process.exit(0);
});

// Iniciar o servidor
startServer();

export default app;
