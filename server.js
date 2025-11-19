// server.js - SISTEMA BIZFLOW FASE 5.1 - COMPLETO COM RELATÓRIOS
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
      phase: 'FASE 5.1 - Sistema Completo com Relatórios'
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
        min_stock INTEGER DEFAULT 5,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de vendas
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        sale_code VARCHAR(50) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        total_items INTEGER NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed'
      );

      -- Tabela de itens da venda
      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER REFERENCES sales(id),
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      (1, 1, 'Sistema Iniciado', 'Sistema BizFlow FASE 5.1 iniciado com sucesso!', 'success'),
      (1, 1, 'Bem-vindo', 'Bem-vindo ao sistema BizFlow FASE 5.1', 'info'),
      (1, 1, 'Relatórios Disponíveis', 'Todos os relatórios estão disponíveis', 'info')
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
    
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1', 
      ['admin']
    );

    if (userCheck.rows.length === 0) {
      console.log('🔄 Criando usuário admin...');
      
      const passwordHash = await bcrypt.hash('admin123', 12);
      
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

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    // Buscar usuário
    const userResult = await pool.query(
      `SELECT id, username, email, password_hash, full_name, role, empresa_id 
       FROM users 
       WHERE username = $1 AND is_active = true 
       LIMIT 1`,
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

app.post('/api/produtos', async (req, res) => {
  try {
    const { name, description, price, stock_quantity, category } = req.body;
    
    const result = await pool.query(
      `INSERT INTO products (empresa_id, name, description, price, stock_quantity, category) 
       VALUES (1, $1, $2, $3, $4, $5) 
       RETURNING *`,
      [name, description, price, stock_quantity, category]
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
      `SELECT s.*, 
              COUNT(si.id) as items_count
       FROM sales s
       LEFT JOIN sale_items si ON s.id = si.sale_id
       GROUP BY s.id
       ORDER BY s.sale_date DESC 
       LIMIT 50`
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

app.post('/api/vendas', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { items, total_amount, total_items, payment_method } = req.body;
    const sale_code = 'V' + Date.now();
    
    // Inserir venda
    const saleResult = await client.query(
      `INSERT INTO sales (empresa_id, sale_code, total_amount, total_items, payment_method) 
       VALUES (1, $1, $2, $3, $4) 
       RETURNING *`,
      [sale_code, total_amount, total_items, payment_method]
    );
    
    const sale = saleResult.rows[0];
    
    // Inserir itens da venda
    for (const item of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.product_id, item.product_name, item.quantity, item.unit_price, item.total_price]
      );

      // Atualizar estoque
      if (item.product_id) {
        await client.query(
          `UPDATE products SET stock_quantity = stock_quantity - $1 
           WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }
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

// ================= ROTAS DE RELATÓRIOS FASE 5.1 =================

// Relatório de Vendas
app.get('/api/relatorios/vendas', async (req, res) => {
  try {
    const { periodo = '7' } = req.query;
    const dias = parseInt(periodo);
    
    const result = await pool.query(
      `SELECT 
        DATE(s.sale_date) as data,
        COUNT(*) as total_vendas,
        SUM(s.total_amount) as total_valor,
        AVG(s.total_amount) as valor_medio,
        s.payment_method,
        COUNT(DISTINCT s.id) as vendas_por_dia
      FROM sales s
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'
      GROUP BY DATE(s.sale_date), s.payment_method
      ORDER BY data DESC, s.payment_method`
    );
    
    // Estatísticas resumidas
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) as total_vendas_periodo,
        SUM(s.total_amount) as total_faturado,
        AVG(s.total_amount) as ticket_medio,
        MAX(s.total_amount) as maior_venda,
        MIN(s.total_amount) as menor_venda
      FROM sales s
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'`
    );
    
    res.json({
      success: true,
      data: {
        detalhes: result.rows,
        estatisticas: statsResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de vendas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Relatório de Estoque
app.get('/api/relatorios/estoque', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.name as produto,
        p.stock_quantity as quantidade,
        p.min_stock as estoque_minimo,
        p.price as preco,
        p.category as categoria,
        CASE 
          WHEN p.stock_quantity <= p.min_stock THEN 'CRÍTICO'
          WHEN p.stock_quantity <= p.min_stock * 2 THEN 'ALERTA' 
          ELSE 'NORMAL'
        END as status_estoque,
        (p.stock_quantity * p.price) as valor_total_estoque
      FROM products p
      WHERE p.is_active = true
      ORDER BY status_estoque, p.stock_quantity ASC`
    );
    
    // Estatísticas do estoque
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) as total_produtos,
        SUM(p.stock_quantity) as total_itens_estoque,
        SUM(p.stock_quantity * p.price) as valor_total_estoque,
        AVG(p.price) as preco_medio,
        COUNT(CASE WHEN p.stock_quantity <= p.min_stock THEN 1 END) as produtos_estoque_baixo,
        COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END) as produtos_sem_estoque
      FROM products p
      WHERE p.is_active = true`
    );
    
    res.json({
      success: true,
      data: {
        produtos: result.rows,
        estatisticas: statsResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de estoque:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Relatório Financeiro
app.get('/api/relatorios/financeiro', async (req, res) => {
  try {
    const { mes, ano } = req.query;
    const mesAtual = mes || new Date().getMonth() + 1;
    const anoAtual = ano || new Date().getFullYear();
    
    // Receitas e Despesas
    const financeiroResult = await pool.query(
      `SELECT 
        type as tipo,
        COUNT(*) as total_contas,
        SUM(amount) as total_valor,
        AVG(amount) as valor_medio,
        status
      FROM financial_accounts 
      WHERE EXTRACT(MONTH FROM due_date) = $1 
        AND EXTRACT(YEAR FROM due_date) = $2
      GROUP BY type, status
      ORDER BY type, status`,
      [mesAtual, anoAtual]
    );
    
    // Vendas do período
    const vendasResult = await pool.query(
      `SELECT 
        SUM(total_amount) as total_vendas,
        COUNT(*) as total_vendas_quantidade,
        AVG(total_amount) as ticket_medio
      FROM sales 
      WHERE EXTRACT(MONTH FROM sale_date) = $1 
        AND EXTRACT(YEAR FROM sale_date) = $2`,
      [mesAtual, anoAtual]
    );
    
    res.json({
      success: true,
      data: {
        financeiro: financeiroResult.rows,
        vendas: vendasResult.rows[0] || { total_vendas: 0, total_vendas_quantidade: 0, ticket_medio: 0 }
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório financeiro:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Relatório de Produtos Mais Vendidos
app.get('/api/relatorios/produtos-mais-vendidos', async (req, res) => {
  try {
    const { limite = '10' } = req.query;
    
    const result = await pool.query(
      `SELECT 
        p.name as produto,
        p.category as categoria,
        SUM(si.quantity) as total_vendido,
        SUM(si.total_price) as total_faturado,
        COUNT(DISTINCT si.sale_id) as vezes_vendido,
        AVG(si.quantity) as media_por_venda
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      GROUP BY p.id, p.name, p.category
      ORDER BY total_vendido DESC
      LIMIT $1`,
      [limite]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de produtos mais vendidos:', error);
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
      usuariosResult,
      financeiroResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM empresas WHERE is_active = true'),
      pool.query('SELECT COUNT(*) as total FROM products WHERE is_active = true'),
      pool.query('SELECT COUNT(*) as total, COALESCE(SUM(total_amount), 0) as total_vendas FROM sales'),
      pool.query('SELECT COUNT(*) as total FROM users WHERE is_active = true'),
      pool.query(`SELECT 
        COUNT(*) as total_contas,
        SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) as total_receitas,
        SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) as total_despesas
        FROM financial_accounts`)
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
        total_despesas: parseFloat(financeiroResult.rows[0].total_despesas || 0)
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

  socket.on('disconnect', () => {
    console.log('🔌 Conexão WebSocket desconectada FASE 5.1:', socket.id);
  });
});

// ================= TRATAMENTO DE ERROS =================
app.use((err, req, res, next) => {
  console.error('💥 Erro não tratado:', err);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor'
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
║           SISTEMA COMPLETO COM RELATÓRIOS       ║
╠══════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                      ║
║ 🌐 Host: ${HOST}                                     ║
║ 🗄️  Banco: PostgreSQL                             ║
║ 🔌 WebSocket: ✅ ATIVADO                          ║
║ 📊 Relatórios: ✅ COMPLETOS                       ║
║ 💰 Financeiro: ✅ ATIVADO                         ║
║ 📈 Dashboard: ✅ ATIVADO                          ║
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
