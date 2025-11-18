// server.js - SISTEMA COMPLETO BIZFLOW FASE 4 - CORRIGIDO
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
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ✅ CONFIGURAÇÃO RENDER-COMPATIBLE
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'bizflow-fase4-secret-key-2024';

// ✅ CONFIGURAÇÃO POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ================= MIDDLEWARES FASE 4 =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(morgan('combined'));

// Rate Limiting FASE 4
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // limite por IP
  message: {
    success: false,
    error: 'Muitas requisições deste IP'
  }
});
app.use('/api/', apiLimiter);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ FAVICON
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// ================= MIDDLEWARES PERSONALIZADOS =================

// Middleware de contexto empresarial FASE 4 - CORRIGIDO
async function empresaContext(req, res, next) {
  try {
    let empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || req.body.empresa_id;
    
    // CORREÇÃO: Se não veio empresa_id, usar 1 como padrão
    if (!empresaId) {
      empresaId = 1;
    }
    
    req.empresa_id = parseInt(empresaId);
    
    console.log('🏢 Contexto empresarial:', req.empresa_id);
    next();
  } catch (error) {
    console.error('Erro no contexto empresarial:', error);
    // CORREÇÃO: Não quebrar o fluxo, usar empresa padrão
    req.empresa_id = 1;
    next();
  }
}

// Middleware de autenticação FASE 4
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
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
        
        // Buscar usuário
        const userResult = await pool.query(
          `SELECT u.*, e.nome as empresa_nome, f.nome as filial_nome 
           FROM users u 
           LEFT JOIN empresas e ON u.empresa_id = e.id 
           LEFT JOIN filiais f ON u.filial_id = f.id 
           WHERE u.id = $1 AND u.is_active = true`,
          [decoded.userId]
        );

        if (userResult.rows.length === 0) {
          return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
        }

        req.user = userResult.rows[0];
        next();
      } catch (jwtError) {
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
        return res.status(401).json({ 
          success: false, 
          error: 'Sessão expirada' 
        });
      }

      req.user = sessionResult.rows[0];
      next();
    }
  } catch (error) {
    console.error('Erro na autenticação:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
}

// Middleware de permissões FASE 4
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
      
      return res.status(403).json({ 
        success: false, 
        error: `Acesso negado: ${modulo}.${acao}` 
      });
      
    } catch (error) {
      console.error('Erro na verificação de permissões:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  };
}

// Middleware de auditoria FASE 4
async function logAudit(action, tableName, recordId, oldValues, newValues, req) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (empresa_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.empresa_id || 1,
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
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error);
  }
}

// ================= INICIALIZAÇÃO DO BANCO FASE 4 =================
async function initializeDatabase() {
  try {
    console.log('🔍 Inicializando banco de dados FASE 4...');
    
    // Verificar se tabelas existem
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    const tablesExist = result.rows[0].exists;
    
    if (!tablesExist) {
      console.log('🔄 Criando tabelas FASE 4...');
      await createTables();
    } else {
      console.log('✅ Tabelas já existem');
      await ensureAdminUser();
      await ensureMultiEmpresaTables();
    }
    
  } catch (error) {
    console.error('❌ Erro na inicialização do banco:', error);
  }
}

async function createTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tablesSQL = `
      -- ================= FASE 4 - TABELAS MULTI-EMPRESA =================
      
      -- Tabela de empresas
      CREATE TABLE empresas (
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

      -- Tabela de filiais
      CREATE TABLE filiais (
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

      -- Tabela de usuários (ATUALIZADA FASE 4)
      CREATE TABLE users (
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

      -- Tabela de sessões (ATUALIZADA FASE 4)
      CREATE TABLE user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de categorias (ATUALIZADA FASE 4)
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(empresa_id, name)
      );

      -- Tabela de produtos (ATUALIZADA FASE 4)
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        filial_id INTEGER REFERENCES filiais(id),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        cost DECIMAL(10,2),
        stock_quantity INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 5,
        category_id INTEGER REFERENCES categories(id),
        sku VARCHAR(100),
        barcode VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de vendas (ATUALIZADA FASE 4)
      CREATE TABLE sales (
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

      -- Tabela de itens da venda (ATUALIZADA FASE 4)
      CREATE TABLE sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name VARCHAR(200) NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Inserir empresa padrão
      INSERT INTO empresas (nome, cnpj, email, telefone, endereco, cidade, estado, cep) 
      VALUES ('Empresa Principal', '00.000.000/0001-00', 'contato@empresa.com', '(11) 9999-9999', 'Endereço Principal', 'São Paulo', 'SP', '00000-000');

      -- Inserir filial padrão
      INSERT INTO filiais (empresa_id, nome, codigo, telefone, endereco, cidade, estado, cep, responsavel)
      VALUES (1, 'Matriz', 'MATRIZ', '(11) 9999-9999', 'Endereço Matriz', 'São Paulo', 'SP', '00000-000', 'Administrador');

      -- Inserir categorias padrão
      INSERT INTO categories (empresa_id, name, description) VALUES 
      (1, 'Geral', 'Produtos diversos'),
      (1, 'Eletrônicos', 'Dispositivos eletrônicos'),
      (1, 'Alimentação', 'Produtos alimentícios'),
      (1, 'Limpeza', 'Produtos de limpeza'),
      (1, 'Serviços', 'Prestação de serviços');

      -- Inserir produtos padrão
      INSERT INTO products (empresa_id, filial_id, name, description, price, cost, stock_quantity, category_id, sku) VALUES 
      (1, 1, 'Smartphone Android', 'Smartphone Android 128GB', 899.90, 650.00, 15, 2, 'SP-AND001'),
      (1, 1, 'Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 1400.00, 8, 2, 'NB-I5001'),
      (1, 1, 'Café Premium', 'Café em grãos 500g', 24.90, 15.00, 50, 3, 'CF-PREM01');
    `;

    await client.query(tablesSQL);
    
    // Criar usuário admin
    const passwordHash = await bcrypt.hash('admin123', 10);
    await client.query(
      `INSERT INTO users (empresa_id, filial_id, username, email, password_hash, full_name, role, permissoes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [1, 1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin', '{"*": ["*"]}']
    );

    await client.query('COMMIT');
    console.log('✅ Banco FASE 4 inicializado com sucesso!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao criar tabelas:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureMultiEmpresaTables() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'empresas'
      );
    `);
    
    if (!result.rows[0].exists) {
      console.log('🔄 Criando tabelas multi-empresa FASE 4...');
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Criar tabelas multi-empresa
        await client.query(`
          CREATE TABLE empresas (
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
          )
        `);
        
        await client.query(`
          CREATE TABLE filiais (
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
          )
        `);
        
        // Inserir empresa padrão
        await client.query(`
          INSERT INTO empresas (nome, cnpj, email, telefone, endereco, cidade, estado, cep) 
          VALUES ('Empresa Principal', '00.000.000/0001-00', 'contato@empresa.com', '(11) 9999-9999', 'Endereço Principal', 'São Paulo', 'SP', '00000-000')
        `);
        
        // Inserir filial padrão
        await client.query(`
          INSERT INTO filiais (empresa_id, nome, codigo, telefone, endereco, cidade, estado, cep, responsavel)
          VALUES (1, 'Matriz', 'MATRIZ', '(11) 9999-9999', 'Endereço Matriz', 'São Paulo', 'SP', '00000-000', 'Administrador')
        `);
        
        await client.query('COMMIT');
        console.log('✅ Tabelas multi-empresa criadas!');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error('❌ Erro ao verificar tabelas multi-empresa:', error);
  }
}

async function ensureAdminUser() {
  try {
    const adminCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      ['admin']
    );
    
    if (adminCheck.rows.length === 0) {
      console.log('👤 Criando usuário admin...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(
        `INSERT INTO users (empresa_id, filial_id, username, email, password_hash, full_name, role, permissoes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [1, 1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin', '{"*": ["*"]}']
      );
      
      console.log('✅ Usuário admin criado');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar usuário admin:', error);
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
      phase: 'FASE 4 COMPLETA - Sistema Empresarial & Multi-empresa'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message 
    });
  }
});

// ================= ROTAS DE AUTENTICAÇÃO FASE 4 =================

// Rota de login CORRIGIDA
app.post('/api/auth/login', empresaContext, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    console.log('🔐 Tentativa de login:', { username, empresa_id: req.empresa_id });

    // Buscar usuário - CORREÇÃO: busca flexível
    let userResult;
    
    // Primeiro tenta buscar com empresa_id
    userResult = await pool.query(
      `SELECT u.*, e.nome as empresa_nome, f.nome as filial_nome 
       FROM users u 
       LEFT JOIN empresas e ON u.empresa_id = e.id 
       LEFT JOIN filiais f ON u.filial_id = f.id 
       WHERE u.username = $1 AND u.empresa_id = $2 AND u.is_active = true`,
      [username, req.empresa_id]
    );

    // Se não encontrou, tenta buscar sem empresa_id (para compatibilidade)
    if (userResult.rows.length === 0) {
      userResult = await pool.query(
        `SELECT u.*, e.nome as empresa_nome, f.nome as filial_nome 
         FROM users u 
         LEFT JOIN empresas e ON u.empresa_id = e.id 
         LEFT JOIN filiais f ON u.filial_id = f.id 
         WHERE u.username = $1 AND u.is_active = true`,
        [username]
      );
    }

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
      console.log('❌ Senha inválida para usuário:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    // Gerar token de sessão
    const sessionToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Salvar sessão
    await pool.query(
      'INSERT INTO user_sessions (user_id, session_token, empresa_id, expires_at) VALUES ($1, $2, $3, $4)',
      [user.id, sessionToken, user.empresa_id, expiresAt]
    );

    // Atualizar último login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Registrar auditoria
    await logAudit('LOGIN', 'users', user.id, null, null, req);

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
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor: ' + error.message 
    });
  }
});

// Rota /api/auth/me 
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

// Rota de logout
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    await pool.query(
      'DELETE FROM user_sessions WHERE session_token = $1',
      [token]
    );

    // Registrar auditoria
    await logAudit('LOGOUT', 'users', req.user.id, null, null, req);

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

// ================= ROTAS BÁSICAS (COMPATIBILIDADE) =================

// Dashboard básico
app.get('/api/dashboard', requireAuth, empresaContext, async (req, res) => {
  try {
    const salesResult = await pool.query(`
      SELECT COUNT(*) as total_vendas, 
             COALESCE(SUM(total_amount), 0) as receita_total
      FROM sales 
      WHERE empresa_id = $1 AND sale_date >= CURRENT_DATE
    `, [req.empresa_id]);
    
    const productsResult = await pool.query(`
      SELECT COUNT(*) as total_produtos
      FROM products 
      WHERE empresa_id = $1 AND is_active = true
    `, [req.empresa_id]);
    
    const data = {
      receitaTotal: parseFloat(salesResult.rows[0].receita_total),
      totalVendas: parseInt(salesResult.rows[0].total_vendas),
      totalProdutos: parseInt(productsResult.rows[0].total_produtos)
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

// Produtos
app.get('/api/produtos', requireAuth, empresaContext, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name as categoria
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.empresa_id = $1 AND p.is_active = true 
      ORDER BY p.name
    `, [req.empresa_id]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Vendas
app.get('/api/vendas', requireAuth, empresaContext, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT s.*, u.full_name as vendedor
      FROM sales s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.empresa_id = $1
      ORDER BY s.sale_date DESC
      LIMIT $2 OFFSET $3
    `, [req.empresa_id, limit, offset]);
    
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM sales WHERE empresa_id = $1',
      [req.empresa_id]
    );
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(totalResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar vendas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= DEBUG ENDPOINTS =================
app.get('/api/debug/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.empresa_id, e.nome as empresa_nome 
      FROM users u 
      LEFT JOIN empresas e ON u.empresa_id = e.id
    `);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/debug/tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ================= WEBSOCKET FASE 4 =================

io.on('connection', (socket) => {
  console.log('🔌 Usuário conectado via WebSocket:', socket.id);

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
        
        socket.join(`empresa_${user.empresa_id}`);
        socket.join(`user_${user.id}`);
        
        socket.emit('authenticated', { success: true, user: { id: user.id, nome: user.full_name } });
        
        console.log(`✅ Usuário ${user.full_name} autenticado via WebSocket`);
      } else {
        socket.emit('authenticated', { success: false, error: 'Autenticação falhou' });
      }
    } catch (error) {
      console.error('Erro na autenticação WebSocket:', error);
      socket.emit('authenticated', { success: false, error: 'Erro interno' });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Usuário desconectado:', socket.id);
  });
});

// ================= INICIALIZAÇÃO DO SERVIDOR FASE 4 =================
async function startServer() {
  try {
    console.log('🚀 Iniciando BizFlow Server FASE 4 CORRIGIDO...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Iniciar servidor
    server.listen(PORT, HOST, () => {
      console.log(`
╔══════════════════════════════════════════════════╗
║              🚀 BIZFLOW API FASE 4              ║
║           SISTEMA EMPRESARIAL CORRIGIDO         ║
╠══════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                      ║
║ 🌐 Host: ${HOST}                                     ║
║ 🗄️  Banco: PostgreSQL                             ║
║ 🔌 WebSocket: ✅ ATIVADO                          ║
║ 🏢 Multi-empresa: ✅ ATIVADO                      ║
║ 👤 Usuário: admin / admin123                     ║
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
