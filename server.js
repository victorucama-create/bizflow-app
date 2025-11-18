// server.js - ATUALIZADO COM SISTEMA DE AUTENTICAÇÃO COMPLETO E CORREÇÕES
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
import cookieParser from 'cookie-parser';

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

// Testar conexão com o banco
pool.on('connect', () => {
  console.log('✅ Conectado ao PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Erro na conexão PostgreSQL:', err);
});

// ================= CONFIGURAÇÃO CSP (CONTENT SECURITY POLICY) =================
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net; img-src 'self' data: https:;"
  );
  next();
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
app.use(cookieParser());

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ FAVICON - Elimina erro 404
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ================= MIDDLEWARE DE AUTENTICAÇÃO =================

// Middleware para verificar sessão
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session_token;
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Acesso não autorizado. Faça login para continuar.' 
      });
    }

    // Verificar sessão no banco
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

// Middleware para verificar permissões de admin
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Acesso negado. Permissões de administrador necessárias.' 
    });
  }
  next();
}

// ================= INICIALIZAÇÃO AUTOMÁTICA DO BANCO =================
async function initializeDatabaseIfNeeded() {
    try {
        console.log('🔍 Verificando se o banco precisa de inicialização...');
        
        // Testar se a tabela users existe
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);
        
        const tablesExist = result.rows[0].exists;
        
        if (!tablesExist) {
            console.log('🔄 Tabelas não encontradas. Inicializando banco...');
            await executeInitSQL();
        } else {
            console.log('✅ Tabelas já existem. Verificando usuário admin...');
            await verifyAdminUser();
        }
    } catch (error) {
        console.error('❌ Erro ao verificar banco:', error);
    }
}

async function verifyAdminUser() {
    try {
        const result = await pool.query(
            'SELECT id, username, password_hash FROM users WHERE username = $1',
            ['admin']
        );
        
        if (result.rows.length === 0) {
            console.log('❌ Usuário admin não encontrado. Criando...');
            await createAdminUser();
        } else {
            console.log('✅ Usuário admin verificado');
        }
    } catch (error) {
        console.error('❌ Erro ao verificar usuário admin:', error);
    }
}

async function createAdminUser() {
    try {
        const passwordHash = await bcrypt.hash('admin123', 10);
        await pool.query(
            `INSERT INTO users (username, email, password_hash, full_name, role) 
             VALUES ($1, $2, $3, $4, $5)`,
            ['admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin']
        );
        console.log('✅ Usuário admin criado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao criar usuário admin:', error);
    }
}

async function executeInitSQL() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const initSQL = `
        -- Criar tabela de usuários
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

        -- Criar tabela de sessões
        CREATE TABLE user_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            session_token VARCHAR(255) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Criar tabela de categorias
        CREATE TABLE categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Criar tabela de produtos
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

        -- Criar tabela de vendas
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

        -- Criar tabela de itens da venda
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

        -- Inserir categorias iniciais
        INSERT INTO categories (name, description) VALUES 
        ('Geral', 'Produtos diversos'),
        ('Eletrônicos', 'Dispositivos eletrônicos'),
        ('Alimentação', 'Produtos alimentícios'),
        ('Limpeza', 'Produtos de limpeza');

        -- Inserir produtos de exemplo
        INSERT INTO products (name, description, price, cost, stock_quantity, category_id, sku) VALUES 
        ('Smartphone Android', 'Smartphone Android 128GB', 899.90, 650.00, 15, 2, 'SP-AND001'),
        ('Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 1400.00, 8, 2, 'NB-I5001'),
        ('Café Premium', 'Café em grãos 500g', 24.90, 15.00, 50, 3, 'CF-PREM01'),
        ('Detergente', 'Detergente líquido 500ml', 3.90, 1.80, 100, 4, 'DT-LIQ01'),
        ('Água Mineral', 'Água mineral 500ml', 2.50, 0.80, 200, 3, 'AG-MIN01');
        `;

        await client.query(initSQL);
        
        // Criar usuário admin separadamente
        const passwordHash = await bcrypt.hash('admin123', 10);
        await client.query(
            `INSERT INTO users (username, email, password_hash, full_name, role) 
             VALUES ($1, $2, $3, $4, $5)`,
            ['admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin']
        );

        await client.query('COMMIT');
        
        console.log('✅ Banco inicializado automaticamente com sucesso!');
        console.log('📊 Tabelas criadas: users, user_sessions, categories, products, sales, sale_items');
        console.log('👤 Usuário admin criado: admin / admin123');
        console.log('🎯 Dados iniciais: 4 categorias, 5 produtos exemplo');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro na inicialização automática:', error);
        throw error;
    } finally {
        client.release();
    }
}

// ================= ROTAS DE AUTENTICAÇÃO =================

// POST - Login
app.post('/api/auth/login', async (req, res) => {
  let client;
  try {
    const { username, password } = req.body;

    console.log('🔐 Tentativa de login para usuário:', username);

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    client = await pool.connect();

    // Buscar usuário
    const userResult = await client.query(
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
    console.log('🔑 Verificação de senha:', isValidPassword);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Credenciais inválidas' 
      });
    }

    // Gerar token de sessão
    const sessionToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    // Salvar sessão
    await client.query(
      'INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, sessionToken, expiresAt]
    );

    // Remover password hash da resposta
    const { password_hash, ...userWithoutPassword } = user;

    console.log('✅ Login realizado com sucesso para:', user.username);

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
  } finally {
    if (client) client.release();
  }
});

// POST - Registrar novo usuário
app.post('/api/auth/register', async (req, res) => {
  let client;
  try {
    const { username, email, password, full_name } = req.body;

    console.log('👤 Tentativa de registro:', username);

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

    client = await pool.connect();

    // Verificar se usuário já existe
    const existingUser = await client.query(
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
    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, full_name, role, created_at`,
      [username, email, passwordHash, full_name]
    );

    console.log('✅ Usuário registrado com sucesso:', username);

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      data: userResult.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro no registro:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor: ' + error.message 
    });
  } finally {
    if (client) client.release();
  }
});

// POST - Logout
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.session_token;
    
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

// GET - Perfil do usuário
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

// ================= ROTAS PRINCIPAIS =================

// ✅ ROTA PRINCIPAL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ✅ HEALTH CHECK (CRÍTICO PARA RENDER)
app.get('/health', async (req, res) => {
    try {
        // Testar conexão com o banco
        await pool.query('SELECT 1');
        console.log('✅ Health check executado - Banco OK');
        res.status(200).json({ 
            status: 'OK', 
            service: 'BizFlow API',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            environment: process.env.NODE_ENV || 'development',
            database: 'connected',
            features: 'authentication-enabled'
        });
    } catch (error) {
        console.error('❌ Health check - Erro no banco:', error);
        res.status(500).json({ 
            status: 'ERROR', 
            service: 'BizFlow API',
            database: 'disconnected',
            error: error.message 
        });
    }
});

// ✅ ROTA DE TESTE SIMPLES
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: '🚀 BizFlow API funcionando perfeitamente!',
        data: {
            vendas: 3,
            estoque: 4,
            online: true,
            database: 'PostgreSQL',
            authentication: 'enabled'
        }
    });
});

// ================= DEBUG ROTAS =================
app.get('/api/debug/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role, is_active FROM users');
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
      'SELECT id, username, password_hash FROM users WHERE username = $1', 
      ['admin']
    );
    
    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: 'Usuário admin não encontrado',
        suggestion: 'Execute a inicialização do banco'
      });
    }

    const user = result.rows[0];
    const testPassword = 'admin123';
    const isPasswordValid = await bcrypt.compare(testPassword, user.password_hash);

    res.json({
      success: true,
      userExists: true,
      passwordValid: isPasswordValid,
      userId: user.id,
      suggestion: isPasswordValid ? 
        'Senha está correta' : 
        'Senha não corresponde.'
    });

  } catch (error) {
    console.error('Debug check-admin error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ================= API - PRODUTOS (ESTOQUE) =================

// GET - Listar produtos
app.get('/api/produtos', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, c.name as categoria 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.is_active = true 
            ORDER BY p.name
        `);
        
        const alertas = result.rows.filter(item => item.stock_quantity <= 5);
        
        res.json({
            success: true,
            data: result.rows,
            totalItens: result.rows.length,
            alertas: alertas.length,
            itensBaixoEstoque: alertas
        });
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// POST - Criar produto
app.post('/api/produtos', requireAuth, async (req, res) => {
    try {
        const { produto: name, quantidade: stock_quantity, minimo, categoria: category_id, preco: price, custo: cost, sku, codigo_barras: barcode } = req.body;
        
        if (!name || stock_quantity === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Produto e quantidade são obrigatórios' 
            });
        }

        const result = await pool.query(
            `INSERT INTO products (name, price, cost, stock_quantity, category_id, sku, barcode) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
            [name.trim(), parseFloat(price) || 0, parseFloat(cost) || 0, parseInt(stock_quantity), category_id || 1, sku, barcode]
        );

        res.json({
            success: true,
            data: result.rows[0],
            message: "Item adicionado ao estoque! 📦"
        });
    } catch (error) {
        console.error('Erro ao criar produto:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// PUT - Atualizar produto
app.put('/api/produtos/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { produto: name, quantidade: stock_quantity, preco: price, custo: cost } = req.body;
        
        const result = await pool.query(
            `UPDATE products 
             SET name = $1, price = $2, cost = $3, stock_quantity = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 
             RETURNING *`,
            [name, parseFloat(price), parseFloat(cost), parseInt(stock_quantity), id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: "Produto atualizado com sucesso! ✅"
        });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// DELETE - Deletar produto (soft delete)
app.delete('/api/produtos/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'UPDATE products SET is_active = false WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }
        
        res.json({
            success: true,
            message: "Produto deletado com sucesso! 🗑️"
        });
    } catch (error) {
        console.error('Erro ao deletar produto:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ================= API - VENDAS =================

// GET - Listar vendas
app.get('/api/vendas', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   COUNT(si.id) as items_count,
                   JSON_AGG(
                     JSON_BUILD_OBJECT(
                       'product_name', si.product_name,
                       'quantity', si.quantity,
                       'unit_price', si.unit_price,
                       'total_price', si.total_price
                     )
                   ) as items
            FROM sales s
            LEFT JOIN sale_items si ON s.id = si.sale_id
            GROUP BY s.id
            ORDER BY s.sale_date DESC
            LIMIT 50
        `);
        
        const receitaTotal = result.rows.reduce((sum, v) => sum + parseFloat(v.total_amount), 0);
        
        res.json({
            success: true,
            data: result.rows,
            total: result.rows.length,
            receitaTotal: receitaTotal
        });
    } catch (error) {
        console.error('Erro ao buscar vendas:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// POST - Registrar venda
app.post('/api/vendas', requireAuth, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { items, total_amount, total_items, payment_method, notes } = req.body;
        
        // Gerar código da venda
        const saleCode = 'V' + Date.now();
        
        // Inserir venda
        const saleResult = await client.query(
            `INSERT INTO sales (sale_code, total_amount, total_items, payment_method, notes) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [saleCode, parseFloat(total_amount), parseInt(total_items), payment_method, notes]
        );
        
        const sale = saleResult.rows[0];
        
        // Inserir itens da venda e atualizar estoque
        for (const item of items) {
            await client.query(
                `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [sale.id, item.id, item.name, item.quantity, item.price, item.total]
            );
            
            await client.query(
                'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                [item.quantity, item.id]
            );
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            data: sale,
            message: "Venda registrada com sucesso! 💰"
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao registrar venda:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    } finally {
        client.release();
    }
});

// ================= API - DASHBOARD =================
app.get('/api/dashboard', requireAuth, async (req, res) => {
    try {
        // Total de vendas do dia
        const salesResult = await pool.query(`
            SELECT COUNT(*) as total_vendas, 
                   COALESCE(SUM(total_amount), 0) as receita_total,
                   COALESCE(SUM(total_items), 0) as total_itens_vendidos,
                   COALESCE(AVG(total_amount), 0) as ticket_medio
            FROM sales 
            WHERE sale_date >= CURRENT_DATE
        `);
        
        // Produtos com estoque baixo
        const lowStockResult = await pool.query(`
            SELECT COUNT(*) as alertas_estoque
            FROM products 
            WHERE stock_quantity <= 5 AND is_active = true
        `);
        
        // Total de produtos
        const totalProductsResult = await pool.query(`
            SELECT COUNT(*) as total_itens_estoque
            FROM products 
            WHERE is_active = true
        `);
        
        // Vendas dos últimos 7 dias
        const salesTrendResult = await pool.query(`
            SELECT DATE(sale_date) as date, 
                   COUNT(*) as sales_count,
                   SUM(total_amount) as daily_revenue
            FROM sales 
            WHERE sale_date >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(sale_date)
            ORDER BY date
        `);
        
        const data = {
            receitaTotal: parseFloat(salesResult.rows[0].receita_total),
            totalVendas: parseInt(salesResult.rows[0].total_vendas),
            totalItensVendidos: parseInt(salesResult.rows[0].total_itens_vendidos),
            ticketMedio: parseFloat(salesResult.rows[0].ticket_medio),
            alertasEstoque: parseInt(lowStockResult.rows[0].alertas_estoque),
            totalItensEstoque: parseInt(totalProductsResult.rows[0].total_itens_estoque),
            tendenciaVendas: salesTrendResult.rows
        };
        
        res.json({
            success: true,
            data: data
        });
        
    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ================= API - CATEGORIAS =================
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

// ================= API - GESTÃO DE USUÁRIOS (APENAS ADMIN) =================

// GET - Listar usuários
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC'
        );
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// PUT - Atualizar usuário
app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role, is_active } = req.body;
        
        const result = await pool.query(
            'UPDATE users SET role = $1, is_active = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, username, email, full_name, role, is_active',
            [role, is_active, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }
        
        res.json({
            success: true,
            data: result.rows[0],
            message: 'Usuário atualizado com sucesso!'
        });
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ================= ROTA DE INICIALIZAÇÃO MANUAL =================
app.post('/api/init-db', async (req, res) => {
    const { secret } = req.body;
    if (secret !== 'bizflow-init-2024') {
        return res.status(401).json({ success: false, error: 'Não autorizado' });
    }

    try {
        console.log('🔄 Inicializando banco de dados via HTTP...');
        await executeInitSQL();
        
        res.json({
            success: true,
            message: 'Banco de dados inicializado com sucesso!',
            tables: ['users', 'user_sessions', 'categories', 'products', 'sales', 'sale_items'],
            sample_data: 'Usuário admin (admin/admin123), 5 produtos e 4 categorias inseridos'
        });

    } catch (error) {
        console.error('❌ Erro ao inicializar banco via HTTP:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao inicializar banco: ' + error.message 
        });
    }
});

// ================= MANIPULAÇÃO DE ERROS =================
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Rota não encontrada',
        path: req.originalUrl 
    });
});

app.use((error, req, res, next) => {
    console.error('Erro no servidor:', error);
    res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor'
    });
});

// ================= INICIALIZAÇÃO DO SERVIDOR =================
async function startServer() {
    try {
        // Inicializar banco se necessário
        await initializeDatabaseIfNeeded();
        
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
║ 📊 Dashboard: /                      ║
╚══════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

// Iniciar o servidor
startServer();

export default app;
