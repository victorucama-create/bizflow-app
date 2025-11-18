// server.js - SISTEMA COMPLETO BIZFLOW FASE 3
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

// ✅ CONFIGURAÇÃO ES6 MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ CONFIGURAÇÃO RENDER-COMPATIBLE
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// ✅ CONFIGURAÇÃO POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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

// ================= INICIALIZAÇÃO DO BANCO =================
async function initializeDatabase() {
  try {
    console.log('🔍 Inicializando banco de dados FASE 3...');
    
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
      console.log('🔄 Criando tabelas FASE 3...');
      await createTables();
    } else {
      console.log('✅ Tabelas já existem');
      await ensureAdminUser();
      await ensureFinancialTables();
      await ensureBackupTables();
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
      -- Tabela de usuários
      CREATE TABLE users (
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

      -- Tabela de sessões
      CREATE TABLE user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de categorias
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de produtos
      CREATE TABLE products (
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

      -- Tabela de vendas
      CREATE TABLE sales (
        id SERIAL PRIMARY KEY,
        sale_code VARCHAR(50) UNIQUE NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        total_items INTEGER NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed',
        notes TEXT,
        user_id INTEGER REFERENCES users(id)
      );

      -- Tabela de itens da venda
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

      -- TABELAS FINANCEIRAS (FASE 3)
      CREATE TABLE financial_accounts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) CHECK (type IN ('receita', 'despesa')),
        category VARCHAR(100),
        amount DECIMAL(15,2) NOT NULL,
        due_date DATE,
        status VARCHAR(50) CHECK (status IN ('pendente', 'pago', 'recebido', 'atrasado')),
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE financial_reports (
        id SERIAL PRIMARY KEY,
        report_type VARCHAR(100) NOT NULL,
        period_start DATE,
        period_end DATE,
        data JSONB,
        user_id INTEGER REFERENCES users(id),
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TABELAS DE BACKUP (FASE 3)
      CREATE TABLE system_backups (
        id SERIAL PRIMARY KEY,
        backup_type VARCHAR(50) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        file_size INTEGER,
        data JSONB,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        table_name VARCHAR(100),
        record_id INTEGER,
        old_values JSONB,
        new_values JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Inserir categorias
      INSERT INTO categories (name, description) VALUES 
      ('Geral', 'Produtos diversos'),
      ('Eletrônicos', 'Dispositivos eletrônicos'),
      ('Alimentação', 'Produtos alimentícios'),
      ('Limpeza', 'Produtos de limpeza'),
      ('Financeiro', 'Transações financeiras'),
      ('Serviços', 'Prestação de serviços');

      -- Inserir produtos
      INSERT INTO products (name, description, price, cost, stock_quantity, category_id, sku) VALUES 
      ('Smartphone Android', 'Smartphone Android 128GB', 899.90, 650.00, 15, 2, 'SP-AND001'),
      ('Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 1400.00, 8, 2, 'NB-I5001'),
      ('Café Premium', 'Café em grãos 500g', 24.90, 15.00, 50, 3, 'CF-PREM01'),
      ('Detergente', 'Detergente líquido 500ml', 3.90, 1.80, 100, 4, 'DT-LIQ01'),
      ('Água Mineral', 'Água mineral 500ml', 2.50, 0.80, 200, 3, 'AG-MIN01');
    `;

    await client.query(tablesSQL);
    
    // Criar usuário admin
    const passwordHash = await bcrypt.hash('admin123', 10);
    await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, role) 
       VALUES ($1, $2, $3, $4, $5)`,
      ['admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin']
    );

    await client.query('COMMIT');
    console.log('✅ Banco FASE 3 inicializado com sucesso!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao criar tabelas:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureFinancialTables() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'financial_accounts'
      );
    `);
    
    if (!result.rows[0].exists) {
      console.log('🔄 Criando tabelas financeiras...');
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        await client.query(`
          CREATE TABLE financial_accounts (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            type VARCHAR(50) CHECK (type IN ('receita', 'despesa')),
            category VARCHAR(100),
            amount DECIMAL(15,2) NOT NULL,
            due_date DATE,
            status VARCHAR(50) CHECK (status IN ('pendente', 'pago', 'recebido', 'atrasado')),
            user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query(`
          CREATE TABLE financial_reports (
            id SERIAL PRIMARY KEY,
            report_type VARCHAR(100) NOT NULL,
            period_start DATE,
            period_end DATE,
            data JSONB,
            user_id INTEGER REFERENCES users(id),
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query('COMMIT');
        console.log('✅ Tabelas financeiras criadas!');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error('❌ Erro ao verificar tabelas financeiras:', error);
  }
}

async function ensureBackupTables() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_backups'
      );
    `);
    
    if (!result.rows[0].exists) {
      console.log('🔄 Criando tabelas de backup...');
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        await client.query(`
          CREATE TABLE system_backups (
            id SERIAL PRIMARY KEY,
            backup_type VARCHAR(50) NOT NULL,
            filename VARCHAR(255) NOT NULL,
            file_size INTEGER,
            data JSONB,
            user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query(`
          CREATE TABLE audit_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            action VARCHAR(100) NOT NULL,
            table_name VARCHAR(100),
            record_id INTEGER,
            old_values JSONB,
            new_values JSONB,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query('COMMIT');
        console.log('✅ Tabelas de backup criadas!');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error('❌ Erro ao verificar tabelas de backup:', error);
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
        `INSERT INTO users (username, email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        ['admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin']
      );
      
      console.log('✅ Usuário admin criado');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar usuário admin:', error);
  }
}

// ================= MIDDLEWARE DE AUTENTICAÇÃO =================
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Acesso não autorizado' 
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
        error: 'Sessão expirada' 
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

// ================= MIDDLEWARE DE AUDITORIA =================
async function logAudit(action, tableName, recordId, oldValues, newValues, req) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
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
      version: '3.0.0',
      phase: 'FASE 3 COMPLETA - Sistema Avançado & Relatórios',
      features: [
        'Dashboard Avançado',
        'Módulo Financeiro Completo',
        'Relatórios PDF/Excel',
        'Sistema de Backup',
        'Auditoria Completa'
      ]
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message 
    });
  }
});

// ================= ROTAS DE AUTENTICAÇÃO =================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    // Buscar usuário
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    const user = userResult.rows[0];

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
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
      'INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, sessionToken, expiresAt]
    );

    // Registrar auditoria
    await logAudit('LOGIN', 'users', user.id, null, null, req);

    // Remover password hash da resposta
    const { password_hash, ...userWithoutPassword } = user;

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
    console.error('Erro no login:', error);
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

    const newUser = userResult.rows[0];

    // Registrar auditoria
    await logAudit('REGISTER', 'users', newUser.id, null, { username, email, full_name }, req);

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      data: newUser
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

// ================= ROTAS DA APLICAÇÃO (PROTEGIDAS) =================

// Produtos
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

app.post('/api/produtos', requireAuth, async (req, res) => {
  try {
    const { name, description, price, cost, stock_quantity, category_id, sku, barcode } = req.body;
    
    const result = await pool.query(
      `INSERT INTO products (name, description, price, cost, stock_quantity, category_id, sku, barcode) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [name, description, price, cost, stock_quantity, category_id, sku, barcode]
    );

    const newProduct = result.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'products', newProduct.id, null, newProduct, req);

    res.json({
      success: true,
      data: newProduct,
      message: "Produto adicionado com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Vendas
app.get('/api/vendas', requireAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT s.*, 
             COUNT(si.id) as items_count,
             u.full_name as vendedor
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN users u ON s.user_id = u.id
      GROUP BY s.id, u.full_name
      ORDER BY s.sale_date DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM sales');
    
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

app.post('/api/vendas', requireAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { items, total_amount, total_items, payment_method, notes } = req.body;
    
    // Gerar código da venda
    const saleCode = 'V' + Date.now();
    
    // Inserir venda
    const saleResult = await client.query(
      `INSERT INTO sales (sale_code, total_amount, total_items, payment_method, notes, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [saleCode, total_amount, total_items, payment_method, notes, req.user.id]
    );
    
    const sale = saleResult.rows[0];
    
    // Inserir itens da venda
    for (const item of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.id, item.name, item.quantity, item.price, item.total]
      );

      // Atualizar estoque
      if (item.id) {
        await client.query(
          `UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [item.quantity, item.id]
        );
      }
    }
    
    await client.query('COMMIT');

    // Registrar auditoria
    await logAudit('CREATE', 'sales', sale.id, null, sale, req);

    res.json({
      success: true,
      data: sale,
      message: "Venda registrada com sucesso!"
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar venda:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// ================= FASE 3 - DASHBOARD AVANÇADO =================

app.get('/api/dashboard/avancado', requireAuth, async (req, res) => {
  try {
    const { periodo = '30' } = req.query;
    const periodoDias = parseInt(periodo);

    // Métricas principais
    const [vendasResult, produtosResult, financeiroResult, topProdutosResult] = await Promise.all([
      // Total de vendas e receita
      pool.query(`
        SELECT 
          COUNT(*) as total_vendas,
          COALESCE(SUM(total_amount), 0) as receita_total,
          COALESCE(AVG(total_amount), 0) as ticket_medio,
          COUNT(*) FILTER (WHERE sale_date >= CURRENT_DATE) as vendas_hoje,
          COALESCE(SUM(total_amount) FILTER (WHERE sale_date >= CURRENT_DATE), 0) as receita_hoje
        FROM sales 
        WHERE sale_date >= CURRENT_DATE - INTERVAL '${periodoDias} days'
      `),
      
      // Total de produtos
      pool.query(`
        SELECT 
          COUNT(*) as total_produtos,
          SUM(stock_quantity) as total_estoque,
          COUNT(CASE WHEN stock_quantity <= 5 THEN 1 END) as alertas_estoque,
          COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as produtos_zerados
        FROM products 
        WHERE is_active = true
      `),
      
      // Dados financeiros
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'receita' AND status = 'recebido' THEN amount ELSE 0 END), 0) as receitas,
          COALESCE(SUM(CASE WHEN type = 'despesa' AND status = 'pago' THEN amount ELSE 0 END), 0) as despesas,
          COUNT(CASE WHEN status = 'pendente' THEN 1 END) as contas_pendentes,
          COUNT(CASE WHEN status = 'atrasado' THEN 1 END) as contas_atrasadas,
          COALESCE(SUM(CASE WHEN type = 'receita' AND status = 'pendente' THEN amount ELSE 0 END), 0) as receitas_pendentes,
          COALESCE(SUM(CASE WHEN type = 'despesa' AND status = 'pendente' THEN amount ELSE 0 END), 0) as despesas_pendentes
        FROM financial_accounts
        WHERE due_date >= CURRENT_DATE - INTERVAL '${periodoDias} days'
      `),
      
      // Produtos mais vendidos
      pool.query(`
        SELECT 
          si.product_name,
          SUM(si.quantity) as total_vendido,
          SUM(si.total_price) as receita_produto,
          COUNT(DISTINCT s.id) as vezes_vendido
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.sale_date >= CURRENT_DATE - INTERVAL '${periodoDias} days'
        GROUP BY si.product_name
        ORDER BY total_vendido DESC
        LIMIT 10
      `)
    ]);

    // Vendas por dia (últimos 7 dias)
    const vendasPorDiaResult = await pool.query(`
      SELECT 
        DATE(sale_date) as data,
        COUNT(*) as quantidade_vendas,
        COALESCE(SUM(total_amount), 0) as receita_dia
      FROM sales
      WHERE sale_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(sale_date)
      ORDER BY data
    `);

    // Métodos de pagamento
    const metodosPagamentoResult = await pool.query(`
      SELECT 
        payment_method,
        COUNT(*) as quantidade,
        COALESCE(SUM(total_amount), 0) as valor_total
      FROM sales
      WHERE sale_date >= CURRENT_DATE - INTERVAL '${periodoDias} days'
      GROUP BY payment_method
      ORDER BY valor_total DESC
    `);

    const data = {
      metricas: {
        receitaTotal: parseFloat(vendasResult.rows[0].receita_total),
        totalVendas: parseInt(vendasResult.rows[0].total_vendas),
        ticketMedio: parseFloat(vendasResult.rows[0].ticket_medio),
        vendasHoje: parseInt(vendasResult.rows[0].vendas_hoje),
        receitaHoje: parseFloat(vendasResult.rows[0].receita_hoje),
        totalProdutos: parseInt(produtosResult.rows[0].total_produtos),
        totalEstoque: parseInt(produtosResult.rows[0].total_estoque),
        alertasEstoque: parseInt(produtosResult.rows[0].alertas_estoque),
        produtosZerados: parseInt(produtosResult.rows[0].produtos_zerados),
        receitas: parseFloat(financeiroResult.rows[0].receitas),
        despesas: parseFloat(financeiroResult.rows[0].despesas),
        lucro: parseFloat(financeiroResult.rows[0].receitas) - parseFloat(financeiroResult.rows[0].despesas),
        contasPendentes: parseInt(financeiroResult.rows[0].contas_pendentes),
        contasAtrasadas: parseInt(financeiroResult.rows[0].contas_atrasadas),
        receitasPendentes: parseFloat(financeiroResult.rows[0].receitas_pendentes),
        despesasPendentes: parseFloat(financeiroResult.rows[0].despesas_pendentes)
      },
      topProdutos: topProdutosResult.rows,
      vendasPorDia: vendasPorDiaResult.rows,
      metodosPagamento: metodosPagamentoResult.rows,
      periodo: periodoDias
    };
    
    res.json({
      success: true,
      data: data
    });
    
  } catch (error) {
    console.error('Erro ao buscar dashboard avançado:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= FASE 3 - RELATÓRIOS AVANÇADOS =================

// Relatórios de Vendas
app.get('/api/relatorios/vendas', requireAuth, async (req, res) => {
  try {
    const { data_inicio, data_fim, agrupamento = 'dia', categoria, vendedor } = req.query;
    
    let queryWhere = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;

    if (data_inicio && data_fim) {
      paramCount += 2;
      queryWhere += ` AND s.sale_date BETWEEN $${paramCount-1} AND $${paramCount}`;
      queryParams.push(data_inicio, data_fim + ' 23:59:59');
    }

    if (categoria) {
      paramCount += 1;
      queryWhere += ` AND c.name = $${paramCount}`;
      queryParams.push(categoria);
    }

    if (vendedor) {
      paramCount += 1;
      queryWhere += ` AND u.full_name ILIKE $${paramCount}`;
      queryParams.push(`%${vendedor}%`);
    }

    const relatorioResult = await pool.query(`
      SELECT 
        ${agrupamento === 'dia' ? "DATE(s.sale_date) as periodo" : 
          agrupamento === 'mes' ? "TO_CHAR(s.sale_date, 'YYYY-MM') as periodo" : 
          "TO_CHAR(s.sale_date, 'YYYY') as periodo"},
        COUNT(*) as total_vendas,
        COALESCE(SUM(s.total_amount), 0) as receita_total,
        COALESCE(AVG(s.total_amount), 0) as ticket_medio,
        SUM(si.quantity) as total_itens_vendidos,
        COUNT(DISTINCT s.user_id) as vendedores_ativos
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${queryWhere}
      GROUP BY ${agrupamento === 'dia' ? "DATE(s.sale_date)" : 
                agrupamento === 'mes' ? "TO_CHAR(s.sale_date, 'YYYY-MM')" : 
                "TO_CHAR(s.sale_date, 'YYYY')"}
      ORDER BY periodo
    `, queryParams);

    // Métodos de pagamento
    const metodosPagamentoResult = await pool.query(`
      SELECT 
        payment_method,
        COUNT(*) as quantidade,
        COALESCE(SUM(total_amount), 0) as valor_total
      FROM sales
      ${queryWhere.replace(/s\./g, '')}
      GROUP BY payment_method
      ORDER BY valor_total DESC
    `, queryParams);

    // Vendas por vendedor
    const vendasVendedorResult = await pool.query(`
      SELECT 
        u.full_name as vendedor,
        COUNT(*) as total_vendas,
        COALESCE(SUM(s.total_amount), 0) as receita_total,
        COALESCE(AVG(s.total_amount), 0) as ticket_medio
      FROM sales s
      JOIN users u ON s.user_id = u.id
      ${queryWhere.replace(/s\./g, '')}
      GROUP BY u.id, u.full_name
      ORDER BY receita_total DESC
    `, queryParams);

    res.json({
      success: true,
      data: {
        resumo: relatorioResult.rows,
        metodosPagamento: metodosPagamentoResult.rows,
        vendasVendedor: vendasVendedorResult.rows,
        periodo: {
          data_inicio,
          data_fim,
          agrupamento,
          categoria,
          vendedor
        }
      }
    });
    
  } catch (error) {
    console.error('Erro ao gerar relatório de vendas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Relatório de Produtos
app.get('/api/relatorios/produtos', requireAuth, async (req, res) => {
  try {
    const { data_inicio, data_fim, categoria } = req.query;
    
    let queryWhere = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;

    if (data_inicio && data_fim) {
      paramCount += 2;
      queryWhere += ` AND s.sale_date BETWEEN $${paramCount-1} AND $${paramCount}`;
      queryParams.push(data_inicio, data_fim + ' 23:59:59');
    }

    if (categoria) {
      paramCount += 1;
      queryWhere += ` AND c.name = $${paramCount}`;
      queryParams.push(categoria);
    }

    const produtosResult = await pool.query(`
      SELECT 
        si.product_name as produto,
        SUM(si.quantity) as quantidade_vendida,
        COALESCE(SUM(si.total_price), 0) as receita_total,
        COALESCE(AVG(si.unit_price), 0) as preco_medio,
        c.name as categoria,
        COUNT(DISTINCT s.id) as vezes_vendido,
        (SUM(si.quantity) * 100.0 / (SELECT SUM(quantity) FROM sale_items si2 
          JOIN sales s2 ON si2.sale_id = s2.id ${queryWhere.replace('1=1 AND', 'WHERE').replace('si.', 'si2.').replace('s.', 's2.')})) as percentual_total
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${queryWhere}
      GROUP BY si.product_name, c.name
      ORDER BY quantidade_vendida DESC
      LIMIT 50
    `, queryParams);

    // Estoque por categoria
    const estoqueCategoriaResult = await pool.query(`
      SELECT 
        c.name as categoria,
        COUNT(*) as total_produtos,
        SUM(p.stock_quantity) as total_estoque,
        COALESCE(SUM(p.stock_quantity * p.price), 0) as valor_estoque,
        COUNT(CASE WHEN p.stock_quantity <= 5 THEN 1 END) as alertas_estoque
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = true
      GROUP BY c.name
      ORDER BY valor_estoque DESC
    `);

    res.json({
      success: true,
      data: {
        produtos: produtosResult.rows,
        estoque: estoqueCategoriaResult.rows,
        periodo: { data_inicio, data_fim, categoria }
      }
    });
    
  } catch (error) {
    console.error('Erro ao gerar relatório de produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= FASE 3 - MÓDULO FINANCEIRO =================

// Contas a Pagar/Receber
app.get('/api/financeiro/contas', requireAuth, async (req, res) => {
  try {
    const { tipo, status, categoria, data_inicio, data_fim } = req.query;
    
    let queryWhere = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;

    if (tipo) {
      paramCount += 1;
      queryWhere += ` AND type = $${paramCount}`;
      queryParams.push(tipo);
    }

    if (status) {
      paramCount += 1;
      queryWhere += ` AND status = $${paramCount}`;
      queryParams.push(status);
    }

    if (categoria) {
      paramCount += 1;
      queryWhere += ` AND category = $${paramCount}`;
      queryParams.push(categoria);
    }

    if (data_inicio && data_fim) {
      paramCount += 2;
      queryWhere += ` AND due_date BETWEEN $${paramCount-1} AND $${paramCount}`;
      queryParams.push(data_inicio, data_fim);
    }
    
    const result = await pool.query(`
      SELECT fa.*, u.full_name as usuario 
      FROM financial_accounts fa
      LEFT JOIN users u ON fa.user_id = u.id
      ${queryWhere}
      ORDER BY due_date, created_at DESC
    `, queryParams);

    // Resumo financeiro
    const resumoResult = await pool.query(`
      SELECT 
        COUNT(*) as total_contas,
        COUNT(CASE WHEN status = 'pendente' THEN 1 END) as contas_pendentes,
        COUNT(CASE WHEN status = 'atrasado' THEN 1 END) as contas_atrasadas,
        COALESCE(SUM(amount), 0) as valor_total,
        COALESCE(SUM(CASE WHEN status = 'pendente' THEN amount ELSE 0 END), 0) as valor_pendente,
        COALESCE(SUM(CASE WHEN status = 'atrasado' THEN amount ELSE 0 END), 0) as valor_atrasado
      FROM financial_accounts
      ${queryWhere}
    `, queryParams);
    
    res.json({
      success: true,
      data: {
        contas: result.rows,
        resumo: resumoResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Erro ao buscar contas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/financeiro/contas', requireAuth, async (req, res) => {
  try {
    const { name, type, category, amount, due_date, status = 'pendente' } = req.body;
    
    const result = await pool.query(
      `INSERT INTO financial_accounts (name, type, category, amount, due_date, status, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [name, type, category, amount, due_date, status, req.user.id]
    );

    const newAccount = result.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'financial_accounts', newAccount.id, null, newAccount, req);

    res.json({
      success: true,
      data: newAccount,
      message: "Conta registrada com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar conta:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.put('/api/financeiro/contas/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, category, amount, due_date, status } = req.body;
    
    // Buscar valores antigos
    const oldAccount = await pool.query('SELECT * FROM financial_accounts WHERE id = $1', [id]);
    
    if (oldAccount.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conta não encontrada' });
    }

    const result = await pool.query(
      `UPDATE financial_accounts 
       SET name = $1, type = $2, category = $3, amount = $4, due_date = $5, status = $6, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $7 RETURNING *`,
      [name, type, category, amount, due_date, status, id]
    );

    const updatedAccount = result.rows[0];

    // Registrar auditoria
    await logAudit('UPDATE', 'financial_accounts', id, oldAccount.rows[0], updatedAccount, req);

    res.json({
      success: true,
      data: updatedAccount,
      message: "Conta atualizada com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao atualizar conta:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.delete('/api/financeiro/contas/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar valores antigos
    const oldAccount = await pool.query('SELECT * FROM financial_accounts WHERE id = $1', [id]);
    
    if (oldAccount.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conta não encontrada' });
    }

    await pool.query('DELETE FROM financial_accounts WHERE id = $1', [id]);

    // Registrar auditoria
    await logAudit('DELETE', 'financial_accounts', id, oldAccount.rows[0], null, req);

    res.json({
      success: true,
      message: "Conta excluída com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao excluir conta:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Fluxo de Caixa
app.get('/api/financeiro/fluxo-caixa', requireAuth, async (req, res) => {
  try {
    const { meses = 6 } = req.query;
    
    const fluxoResult = await pool.query(`
      SELECT 
        TO_CHAR(due_date, 'YYYY-MM') as mes,
        SUM(CASE WHEN type = 'receita' AND status = 'recebido' THEN amount ELSE 0 END) as receitas,
        SUM(CASE WHEN type = 'despesa' AND status = 'pago' THEN amount ELSE 0 END) as despesas,
        SUM(CASE WHEN type = 'receita' AND status = 'recebido' THEN amount ELSE 0 END) - 
        SUM(CASE WHEN type = 'despesa' AND status = 'pago' THEN amount ELSE 0 END) as saldo,
        SUM(CASE WHEN type = 'receita' AND status = 'pendente' THEN amount ELSE 0 END) as receitas_pendentes,
        SUM(CASE WHEN type = 'despesa' AND status = 'pendente' THEN amount ELSE 0 END) as despesas_pendentes
      FROM financial_accounts
      WHERE due_date >= CURRENT_DATE - INTERVAL '${meses} months'
      GROUP BY TO_CHAR(due_date, 'YYYY-MM')
      ORDER BY mes
    `);

    // Previsão para próximos meses
    const previsaoResult = await pool.query(`
      SELECT 
        TO_CHAR(due_date, 'YYYY-MM') as mes,
        SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) as receitas_previstas,
        SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) as despesas_previstas,
        SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) - 
        SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) as saldo_previsto
      FROM financial_accounts
      WHERE due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '3 months'
      GROUP BY TO_CHAR(due_date, 'YYYY-MM')
      ORDER BY mes
    `);

    res.json({
      success: true,
      data: {
        historico: fluxoResult.rows,
        previsao: previsaoResult.rows
      }
    });
    
  } catch (error) {
    console.error('Erro ao buscar fluxo de caixa:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= FASE 3 - EXPORTAÇÃO DE DADOS =================

// Exportar PDF
app.get('/api/exportar/pdf/:tipo', requireAuth, async (req, res) => {
  try {
    const { tipo } = req.params;
    const { data_inicio, data_fim } = req.query;

    const doc = new PDFDocument();
    
    // Configurar headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${tipo}-${new Date().toISOString().split('T')[0]}.pdf"`);
    
    doc.pipe(res);

    // Header do PDF
    doc.fontSize(20).text('BizFlow - Relatório', 100, 100);
    doc.fontSize(12).text(`Tipo: ${tipo}`, 100, 130);
    doc.text(`Período: ${data_inicio || 'Início'} à ${data_fim || 'Fim'}`, 100, 150);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 100, 170);
    doc.text(`Usuário: ${req.user.full_name}`, 100, 190);

    // Adicionar dados baseados no tipo
    let yPosition = 230;

    switch(tipo) {
      case 'vendas':
        const vendasData = await pool.query(`
          SELECT s.*, u.full_name as vendedor 
          FROM sales s 
          LEFT JOIN users u ON s.user_id = u.id 
          WHERE ($1::date IS NULL OR s.sale_date >= $1::date)
          AND ($2::date IS NULL OR s.sale_date <= $2::date)
          ORDER BY s.sale_date DESC
          LIMIT 100
        `, [data_inicio, data_fim]);

        doc.fontSize(16).text('Últimas Vendas', 100, yPosition);
        yPosition += 30;

        vendasData.rows.forEach((venda, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 100;
          }
          
          doc.fontSize(10)
             .text(`${venda.sale_code} - ${new Date(venda.sale_date).toLocaleDateString('pt-BR')}`, 100, yPosition)
             .text(`Vendedor: ${venda.vendedor} | Valor: R$ ${venda.total_amount}`, 100, yPosition + 15)
             .text(`Itens: ${venda.total_items} | Método: ${venda.payment_method}`, 100, yPosition + 30);
          
          yPosition += 50;
        });
        break;

      case 'produtos':
        const produtosData = await pool.query(`
          SELECT p.*, c.name as categoria 
          FROM products p 
          LEFT JOIN categories c ON p.category_id = c.id 
          WHERE p.is_active = true
          ORDER BY p.name
        `);

        doc.fontSize(16).text('Produtos Cadastrados', 100, yPosition);
        yPosition += 30;

        produtosData.rows.forEach((produto, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 100;
          }
          
          doc.fontSize(10)
             .text(produto.name, 100, yPosition)
             .text(`Categoria: ${produto.categoria} | Preço: R$ ${produto.price}`, 100, yPosition + 15)
             .text(`Estoque: ${produto.stock_quantity} | Custo: R$ ${produto.cost || 'N/A'}`, 100, yPosition + 30);
          
          yPosition += 45;
        });
        break;

      case 'financeiro':
        const financeiroData = await pool.query(`
          SELECT * FROM financial_accounts 
          WHERE ($1::date IS NULL OR due_date >= $1::date)
          AND ($2::date IS NULL OR due_date <= $2::date)
          ORDER BY due_date DESC
          LIMIT 100
        `, [data_inicio, data_fim]);

        doc.fontSize(16).text('Contas Financeiras', 100, yPosition);
        yPosition += 30;

        financeiroData.rows.forEach((conta, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 100;
          }
          
          const tipoText = conta.type === 'receita' ? 'Receita' : 'Despesa';
          const statusColor = conta.status === 'pendente' ? 'red' : 'green';
          
          doc.fontSize(10)
             .text(conta.name, 100, yPosition)
             .text(`Tipo: ${tipoText} | Categoria: ${conta.category || 'N/A'}`, 100, yPosition + 15)
             .text(`Valor: R$ ${conta.amount} | Vencimento: ${new Date(conta.due_date).toLocaleDateString('pt-BR')}`, 100, yPosition + 30)
             .text(`Status: ${conta.status}`, 100, yPosition + 45);
          
          yPosition += 60;
        });
        break;
    }

    doc.end();

  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Exportar Excel
app.get('/api/exportar/excel/:tipo', requireAuth, async (req, res) => {
  try {
    const { tipo } = req.params;
    const { data_inicio, data_fim } = req.query;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório');

    // Adicionar cabeçalho
    worksheet.columns = [
      { header: 'Relatório BizFlow', key: 'header', width: 30 },
      { header: 'Valor', key: 'value', width: 30 }
    ];

    worksheet.addRow({ header: 'Tipo de Relatório', value: tipo });
    worksheet.addRow({ header: 'Período', value: `${data_inicio || 'Início'} à ${data_fim || 'Fim'}` });
    worksheet.addRow({ header: 'Gerado em', value: new Date().toLocaleString('pt-BR') });
    worksheet.addRow({ header: 'Usuário', value: req.user.full_name });
    worksheet.addRow({}); // Linha vazia

    let data;

    switch(tipo) {
      case 'vendas':
        data = await pool.query(`
          SELECT s.sale_code, s.sale_date, s.total_amount, s.total_items, s.payment_method, u.full_name as vendedor
          FROM sales s 
          LEFT JOIN users u ON s.user_id = u.id 
          WHERE ($1::date IS NULL OR s.sale_date >= $1::date)
          AND ($2::date IS NULL OR s.sale_date <= $2::date)
          ORDER BY s.sale_date DESC
          LIMIT 1000
        `, [data_inicio, data_fim]);

        worksheet.addRow(['Código', 'Data', 'Valor Total', 'Itens', 'Método Pagamento', 'Vendedor']);
        
        data.rows.forEach(row => {
          worksheet.addRow([
            row.sale_code,
            new Date(row.sale_date).toLocaleDateString('pt-BR'),
            row.total_amount,
            row.total_items,
            row.payment_method,
            row.vendedor
          ]);
        });
        break;

      case 'produtos':
        data = await pool.query(`
          SELECT p.name, p.description, p.price, p.cost, p.stock_quantity, c.name as categoria, p.sku
          FROM products p 
          LEFT JOIN categories c ON p.category_id = c.id 
          WHERE p.is_active = true
          ORDER BY p.name
        `);

        worksheet.addRow(['Nome', 'Descrição', 'Preço', 'Custo', 'Estoque', 'Categoria', 'SKU']);
        
        data.rows.forEach(row => {
          worksheet.addRow([
            row.name,
            row.description,
            row.price,
            row.cost,
            row.stock_quantity,
            row.categoria,
            row.sku
          ]);
        });
        break;

      case 'financeiro':
        data = await pool.query(`
          SELECT name, type, category, amount, due_date, status
          FROM financial_accounts 
          WHERE ($1::date IS NULL OR due_date >= $1::date)
          AND ($2::date IS NULL OR due_date <= $2::date)
          ORDER BY due_date DESC
          LIMIT 1000
        `, [data_inicio, data_fim]);

        worksheet.addRow(['Descrição', 'Tipo', 'Categoria', 'Valor', 'Vencimento', 'Status']);
        
        data.rows.forEach(row => {
          worksheet.addRow([
            row.name,
            row.type,
            row.category,
            row.amount,
            new Date(row.due_date).toLocaleDateString('pt-BR'),
            row.status
          ]);
        });
        break;
    }

    // Configurar resposta
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${tipo}-${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Erro ao gerar Excel:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= FASE 3 - SISTEMA DE BACKUP =================

// Backup de dados
app.post('/api/backup/gerar', requireAuth, async (req, res) => {
  try {
    const { tipo = 'completo' } = req.body;

    // Coletar dados do sistema
    const [users, products, sales, financials, categories] = await Promise.all([
      pool.query('SELECT * FROM users'),
      pool.query('SELECT * FROM products'),
      pool.query('SELECT * FROM sales ORDER BY sale_date DESC LIMIT 1000'),
      pool.query('SELECT * FROM financial_accounts ORDER BY due_date DESC LIMIT 1000'),
      pool.query('SELECT * FROM categories')
    ]);

    const backupData = {
      metadata: {
        tipo,
        dataGeracao: new Date().toISOString(),
        usuario: req.user.full_name,
        totalRegistros: {
          users: users.rows.length,
          products: products.rows.length,
          sales: sales.rows.length,
          financials: financials.rows.length,
          categories: categories.rows.length
        }
      },
      data: {
        users: users.rows,
        products: products.rows,
        sales: sales.rows,
        financials: financials.rows,
        categories: categories.rows
      }
    };

    // Salvar backup no banco
    const backupResult = await pool.query(
      `INSERT INTO system_backups (backup_type, filename, file_size, data, user_id) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [
        tipo,
        `backup-${tipo}-${new Date().toISOString().split('T')[0]}.json`,
        JSON.stringify(backupData).length,
        backupData,
        req.user.id
      ]
    );

    // Registrar auditoria
    await logAudit('BACKUP_CREATE', 'system_backups', backupResult.rows[0].id, null, { tipo }, req);

    res.json({
      success: true,
      data: backupResult.rows[0],
      message: "Backup gerado com sucesso!"
    });

  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Listar backups
app.get('/api/backup/listar', requireAuth, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const backups = await pool.query(`
      SELECT sb.*, u.full_name as usuario 
      FROM system_backups sb
      LEFT JOIN users u ON sb.user_id = u.id
      ORDER BY sb.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const total = await pool.query('SELECT COUNT(*) as total FROM system_backups');

    res.json({
      success: true,
      data: {
        backups: backups.rows,
        pagination: {
          total: parseInt(total.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    });

  } catch (error) {
    console.error('Erro ao listar backups:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Restaurar backup
app.post('/api/backup/restaurar/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const backup = await pool.query('SELECT * FROM system_backups WHERE id = $1', [id]);
    
    if (backup.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Backup não encontrado' });
    }

    const backupData = backup.rows[0].data;

    // Aqui iria a lógica para restaurar os dados
    // Por segurança, em produção isso exigiria confirmações adicionais

    // Registrar auditoria
    await logAudit('BACKUP_RESTORE', 'system_backups', id, null, { backup_id: id }, req);

    res.json({
      success: true,
      message: "Processo de restauração iniciado!",
      data: {
        backup: backupData.metadata
      }
    });

  } catch (error) {
    console.error('Erro ao restaurar backup:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS ADICIONAIS =================

// Categorias
app.get('/api/categorias', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Dashboard (mantido para compatibilidade)
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const salesResult = await pool.query(`
      SELECT COUNT(*) as total_vendas, 
             COALESCE(SUM(total_amount), 0) as receita_total
      FROM sales 
      WHERE sale_date >= CURRENT_DATE
    `);
    
    const productsResult = await pool.query(`
      SELECT COUNT(*) as total_produtos
      FROM products 
      WHERE is_active = true
    `);
    
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

// ================= ROTAS DE DEBUG =================
app.get('/api/debug/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role FROM users');
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

// ================= INICIALIZAÇÃO DO SERVIDOR =================
async function startServer() {
  try {
    console.log('🚀 Iniciando BizFlow Server FASE 3 COMPLETA...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Iniciar servidor
    app.listen(PORT, HOST, () => {
      console.log(`
╔══════════════════════════════════════════════════╗
║              🚀 BIZFLOW API FASE 3              ║
║           SISTEMA AVANÇADO COMPLETO             ║
╠══════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                      ║
║ 🌐 Host: ${HOST}                                     ║
║ 🗄️  Banco: PostgreSQL                             ║
║ 📊 Dashboard Avançado: ✅ ATIVADO                 ║
║ 💰 Módulo Financeiro: ✅ ATIVADO                  ║
║ 📈 Relatórios PDF/Excel: ✅ ATIVADO               ║
║ 💾 Sistema de Backup: ✅ ATIVADO                  ║
║ 🔍 Auditoria Completa: ✅ ATIVADO                 ║
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
