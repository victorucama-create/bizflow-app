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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
    console.log('🔍 Inicializando banco de dados...');
    
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
      console.log('🔄 Criando tabelas...');
      await createTables();
    } else {
      console.log('✅ Tabelas já existem');
      await ensureAdminUser();
      await ensureFinancialTables();
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
        notes TEXT
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

      -- Inserir categorias
      INSERT INTO categories (name, description) VALUES 
      ('Geral', 'Produtos diversos'),
      ('Eletrônicos', 'Dispositivos eletrônicos'),
      ('Alimentação', 'Produtos alimentícios'),
      ('Limpeza', 'Produtos de limpeza');

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
    console.log('✅ Banco inicializado com sucesso!');
    
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
    // Verificar se tabelas financeiras existem
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
      phase: 'FASE 3 - Sistema Avançado & Relatórios'
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
    const { name, price, cost, stock_quantity, category_id, sku } = req.body;
    
    const result = await pool.query(
      `INSERT INTO products (name, price, cost, stock_quantity, category_id, sku) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [name, price, cost, stock_quantity, category_id, sku]
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
app.get('/api/vendas', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, 
             COUNT(si.id) as items_count
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      GROUP BY s.id
      ORDER BY s.sale_date DESC
      LIMIT 50
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

app.post('/api/vendas', requireAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { items, total_amount, total_items, payment_method } = req.body;
    
    // Gerar código da venda
    const saleCode = 'V' + Date.now();
    
    // Inserir venda
    const saleResult = await client.query(
      `INSERT INTO sales (sale_code, total_amount, total_items, payment_method) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [saleCode, total_amount, total_items, payment_method]
    );
    
    const sale = saleResult.rows[0];
    
    // Inserir itens da venda
    for (const item of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.id, item.name, item.quantity, item.price, item.total]
      );
    }
    
    await client.query('COMMIT');
    
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

// ================= FASE 3 - RELATÓRIOS AVANÇADOS =================

// Dashboard Avançado
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
          COALESCE(AVG(total_amount), 0) as ticket_medio
        FROM sales 
        WHERE sale_date >= CURRENT_DATE - INTERVAL '${periodoDias} days'
      `),
      
      // Total de produtos
      pool.query(`
        SELECT 
          COUNT(*) as total_produtos,
          SUM(stock_quantity) as total_estoque,
          COUNT(CASE WHEN stock_quantity <= 5 THEN 1 END) as alertas_estoque
        FROM products 
        WHERE is_active = true
      `),
      
      // Dados financeiros
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'receita' AND status = 'recebido' THEN amount ELSE 0 END), 0) as receitas,
          COALESCE(SUM(CASE WHEN type = 'despesa' AND status = 'pago' THEN amount ELSE 0 END), 0) as despesas,
          COUNT(CASE WHEN status = 'pendente' THEN 1 END) as contas_pendentes
        FROM financial_accounts
        WHERE due_date >= CURRENT_DATE - INTERVAL '${periodoDias} days'
      `),
      
      // Produtos mais vendidos
      pool.query(`
        SELECT 
          si.product_name,
          SUM(si.quantity) as total_vendido,
          SUM(si.total_price) as receita_produto
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

    const data = {
      metricas: {
        receitaTotal: parseFloat(vendasResult.rows[0].receita_total),
        totalVendas: parseInt(vendasResult.rows[0].total_vendas),
        ticketMedio: parseFloat(vendasResult.rows[0].ticket_medio),
        totalProdutos: parseInt(produtosResult.rows[0].total_produtos),
        totalEstoque: parseInt(produtosResult.rows[0].total_estoque),
        alertasEstoque: parseInt(produtosResult.rows[0].alertas_estoque),
        receitas: parseFloat(financeiroResult.rows[0].receitas),
        despesas: parseFloat(financeiroResult.rows[0].despesas),
        lucro: parseFloat(financeiroResult.rows[0].receitas) - parseFloat(financeiroResult.rows[0].despesas),
        contasPendentes: parseInt(financeiroResult.rows[0].contas_pendentes)
      },
      topProdutos: topProdutosResult.rows,
      vendasPorDia: vendasPorDiaResult.rows,
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

// Relatórios de Vendas
app.get('/api/relatorios/vendas', requireAuth, async (req, res) => {
  try {
    const { data_inicio, data_fim, agrupamento = 'dia' } = req.query;
    
    let queryWhere = '';
    if (data_inicio && data_fim) {
      queryWhere = `WHERE s.sale_date BETWEEN '${data_inicio}' AND '${data_fim} 23:59:59'`;
    }

    const relatorioResult = await pool.query(`
      SELECT 
        ${agrupamento === 'dia' ? "DATE(s.sale_date) as periodo" : 
          agrupamento === 'mes' ? "TO_CHAR(s.sale_date, 'YYYY-MM') as periodo" : 
          "TO_CHAR(s.sale_date, 'YYYY') as periodo"},
        COUNT(*) as total_vendas,
        COALESCE(SUM(s.total_amount), 0) as receita_total,
        COALESCE(AVG(s.total_amount), 0) as ticket_medio,
        SUM(si.quantity) as total_itens_vendidos
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      ${queryWhere}
      GROUP BY ${agrupamento === 'dia' ? "DATE(s.sale_date)" : 
                agrupamento === 'mes' ? "TO_CHAR(s.sale_date, 'YYYY-MM')" : 
                "TO_CHAR(s.sale_date, 'YYYY')"}
      ORDER BY periodo
    `);

    // Métodos de pagamento
    const metodosPagamentoResult = await pool.query(`
      SELECT 
        payment_method,
        COUNT(*) as quantidade,
        COALESCE(SUM(total_amount), 0) as valor_total
      FROM sales
      ${queryWhere}
      GROUP BY payment_method
      ORDER BY valor_total DESC
    `);

    res.json({
      success: true,
      data: {
        resumo: relatorioResult.rows,
        metodosPagamento: metodosPagamentoResult.rows,
        periodo: {
          data_inicio,
          data_fim,
          agrupamento
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
    const { data_inicio, data_fim } = req.query;
    
    let queryWhere = '';
    if (data_inicio && data_fim) {
      queryWhere = `WHERE s.sale_date BETWEEN '${data_inicio}' AND '${data_fim} 23:59:59'`;
    }

    const produtosResult = await pool.query(`
      SELECT 
        si.product_name as produto,
        SUM(si.quantity) as quantidade_vendida,
        COALESCE(SUM(si.total_price), 0) as receita_total,
        COALESCE(AVG(si.unit_price), 0) as preco_medio,
        (SELECT name FROM categories c 
         JOIN products p ON p.category_id = c.id 
         WHERE p.name = si.product_name LIMIT 1) as categoria
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${queryWhere}
      GROUP BY si.product_name
      ORDER BY quantidade_vendida DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      data: produtosResult.rows,
      periodo: { data_inicio, data_fim }
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
    const { tipo, status } = req.query;
    
    let queryWhere = 'WHERE 1=1';
    if (tipo) queryWhere += ` AND type = '${tipo}'`;
    if (status) queryWhere += ` AND status = '${status}'`;
    
    const result = await pool.query(`
      SELECT * FROM financial_accounts 
      ${queryWhere}
      ORDER BY due_date, created_at DESC
    `);
    
    res.json({
      success: true,
      data: result.rows
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

    res.json({
      success: true,
      data: result.rows[0],
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
    const { status } = req.body;
    
    const result = await pool.query(
      `UPDATE financial_accounts SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conta não encontrada' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Status atualizado com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao atualizar conta:', error);
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
        SUM(CASE WHEN type = 'despesa' AND status = 'pago' THEN amount ELSE 0 END) as saldo
      FROM financial_accounts
      WHERE due_date >= CURRENT_DATE - INTERVAL '${meses} months'
      GROUP BY TO_CHAR(due_date, 'YYYY-MM')
      ORDER BY mes
    `);

    res.json({
      success: true,
      data: fluxoResult.rows
    });
    
  } catch (error) {
    console.error('Erro ao buscar fluxo de caixa:', error);
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
    console.log('🚀 Iniciando BizFlow Server FASE 3...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Iniciar servidor
    app.listen(PORT, HOST, () => {
      console.log(`
╔══════════════════════════════════════╗
║         🚀 BIZFLOW API FASE 3       ║
║      Sistema Avançado & Relatórios   ║
╠══════════════════════════════════════╣
║ 📍 Porta: ${PORT}                          ║
║ 🌐 Host: ${HOST}                         ║
║ 🗄️  Banco: PostgreSQL                 ║
║ 📊 Relatórios: ATIVADOS              ║
║ 💰 Financeiro: ATIVADO               ║
║ 👤 Usuário: admin / admin123         ║
╚══════════════════════════════════════╝
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
