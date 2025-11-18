// server.js - BIZFLOW FASE 4 - VERSÃO ULTRA-CORRIGIDA
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// ✅ CONFIGURAÇÃO POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ================= MIDDLEWARES =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ FAVICON
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// ================= MIDDLEWARES PERSONALIZADOS =================
async function empresaContext(req, res, next) {
  try {
    req.empresa_id = 1; // Sempre usar empresa 1 por enquanto
    next();
  } catch (error) {
    req.empresa_id = 1;
    next();
  }
}

async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Acesso não autorizado' });
    }

    const sessionResult = await pool.query(
      `SELECT u.* FROM user_sessions us 
       JOIN users u ON us.user_id = u.id 
       WHERE us.session_token = $1 AND us.expires_at > NOW() AND u.is_active = true`,
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Sessão expirada' });
    }

    req.user = sessionResult.rows[0];
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}

// ================= INICIALIZAÇÃO DO BANCO =================
async function initializeDatabase() {
  try {
    console.log('🔍 Verificando banco de dados...');
    
    // Verificar se usuário admin existe
    const adminCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    
    if (adminCheck.rows.length === 0) {
      console.log('👤 Criando usuário admin...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(
        `INSERT INTO users (empresa_id, filial_id, username, email, password_hash, full_name, role, permissoes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [1, 1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin', '{"*": ["*"]}']
      );
      
      console.log('✅ Usuário admin criado');
    } else {
      console.log('✅ Usuário admin já existe');
    }
    
  } catch (error) {
    console.error('❌ Erro na inicialização do banco:', error);
  }
}

// ================= ROTAS PÚBLICAS =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '4.0.0',
      message: 'Sistema FASE 4 funcionando!'
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// ================= ROTAS DE AUTENTICAÇÃO =================
app.post('/api/auth/login', empresaContext, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username e password são obrigatórios' });
    }

    console.log('🔐 Tentativa de login:', username);

    // Buscar usuário - método FLEXÍVEL
    let userResult = await pool.query(
      `SELECT u.* FROM users u WHERE u.username = $1 AND u.is_active = true`,
      [username]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Usuário não encontrado:', username);
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }

    const user = userResult.rows[0];

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      console.log('❌ Senha inválida para usuário:', username);
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }

    // Gerar token de sessão
    const sessionToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Salvar sessão
    await pool.query(
      'INSERT INTO user_sessions (user_id, session_token, empresa_id, expires_at) VALUES ($1, $2, $3, $4)',
      [user.id, sessionToken, user.empresa_id || 1, expiresAt]
    );

    // Remover password hash da resposta
    const { password_hash, ...userWithoutPassword } = user;

    console.log('✅ Login bem-sucedido para:', user.username);

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
    console.error('❌ Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { password_hash, ...userWithoutPassword } = req.user;
    res.json({ success: true, data: userWithoutPassword });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [token]);
    res.json({ success: true, message: 'Logout realizado com sucesso!' });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS BÁSICAS =================
app.get('/api/dashboard', requireAuth, empresaContext, async (req, res) => {
  try {
    const salesResult = await pool.query('SELECT COUNT(*) as total_vendas, COALESCE(SUM(total_amount), 0) as receita_total FROM sales WHERE empresa_id = $1', [req.empresa_id]);
    const productsResult = await pool.query('SELECT COUNT(*) as total_produtos FROM products WHERE empresa_id = $1 AND is_active = true', [req.empresa_id]);
    
    res.json({
      success: true,
      data: {
        receitaTotal: parseFloat(salesResult.rows[0].receita_total),
        totalVendas: parseInt(salesResult.rows[0].total_vendas),
        totalProdutos: parseInt(productsResult.rows[0].total_produtos)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/produtos', requireAuth, empresaContext, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE empresa_id = $1 AND is_active = true ORDER BY name', [req.empresa_id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= DEBUG ENDPOINTS =================
app.get('/api/debug/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, empresa_id, email, role FROM users');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/tables', async (req, res) => {
  try {
    const result = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/create-admin', async (req, res) => {
  try {
    console.log('🛠️ Criando usuário admin manualmente...');
    
    const adminCheck = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    
    if (adminCheck.rows.length > 0) {
      return res.json({ success: true, message: 'Admin já existe', user: adminCheck.rows[0] });
    }
    
    const passwordHash = await bcrypt.hash('admin123', 10);
    const result = await pool.query(
      `INSERT INTO users (empresa_id, filial_id, username, email, password_hash, full_name, role, permissoes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id, username, email, full_name, role`,
      [1, 1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin', '{"*": ["*"]}']
    );
    
    console.log('✅ Admin criado manualmente');
    
    res.json({
      success: true,
      message: 'Usuário admin criado com sucesso!',
      user: result.rows[0],
      credentials: { username: 'admin', password: 'admin123' }
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar admin:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================= INICIALIZAÇÃO DO SERVIDOR =================
async function startServer() {
  try {
    console.log('🚀 Iniciando BizFlow Server...');
    await initializeDatabase();
    
    app.listen(PORT, HOST, () => {
      console.log(`
╔══════════════════════════════════════════════════╗
║              🚀 BIZFLOW API FASE 4              ║
║               VERSÃO SIMPLIFICADA               ║
╠══════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                      ║
║ 🌐 Host: ${HOST}                                     ║
║ 👤 Usuário: admin / admin123                     ║
║ 🔗 URL: https://bizflow-app-xvcw.onrender.com    ║
╚══════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Falha ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();
export default app;
