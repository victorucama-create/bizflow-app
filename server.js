// server.js - ATUALIZADO PARA ES6 MODULES + POSTGRESQL + INICIALIZAÇÃO AUTOMÁTICA
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

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

// ================= INICIALIZAÇÃO AUTOMÁTICA DO BANCO =================
async function initializeDatabaseIfNeeded() {
    try {
        console.log('🔍 Verificando se o banco precisa de inicialização...');
        
        // Testar se a tabela products existe
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'products'
            );
        `);
        
        const tablesExist = result.rows[0].exists;
        
        if (!tablesExist) {
            console.log('🔄 Tabelas não encontradas. Inicializando banco...');
            await executeInitSQL();
        } else {
            console.log('✅ Tabelas já existem. Inicialização não necessária.');
        }
    } catch (error) {
        console.error('❌ Erro ao verificar banco:', error);
    }
}

async function executeInitSQL() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const initSQL = `
        CREATE TABLE categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

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

        INSERT INTO categories (name, description) VALUES 
        ('Geral', 'Produtos diversos'),
        ('Eletrônicos', 'Dispositivos eletrônicos'),
        ('Alimentação', 'Produtos alimentícios'),
        ('Limpeza', 'Produtos de limpeza');

        INSERT INTO products (name, description, price, cost, stock_quantity, category_id, sku) VALUES 
        ('Smartphone Android', 'Smartphone Android 128GB', 899.90, 650.00, 15, 2, 'SP-AND001'),
        ('Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 1400.00, 8, 2, 'NB-I5001'),
        ('Café Premium', 'Café em grãos 500g', 24.90, 15.00, 50, 3, 'CF-PREM01'),
        ('Detergente', 'Detergente líquido 500ml', 3.90, 1.80, 100, 4, 'DT-LIQ01'),
        ('Água Mineral', 'Água mineral 500ml', 2.50, 0.80, 200, 3, 'AG-MIN01');
        `;

        await client.query(initSQL);
        await client.query('COMMIT');
        
        console.log('✅ Banco inicializado automaticamente com sucesso!');
        console.log('📊 Tabelas criadas: categories, products, sales, sale_items');
        console.log('🎯 Dados iniciais: 4 categorias, 5 produtos exemplo');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro na inicialização automática:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// ✅ FAVICON - Elimina erro 404
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
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
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            database: 'connected'
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
            database: 'PostgreSQL'
        }
    });
});

// ================= API - PRODUTOS (ESTOQUE) =================

// GET - Listar produtos
app.get('/api/produtos', async (req, res) => {
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
app.post('/api/produtos', async (req, res) => {
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
app.put('/api/produtos/:id', async (req, res) => {
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
app.delete('/api/produtos/:id', async (req, res) => {
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
app.get('/api/vendas', async (req, res) => {
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
app.post('/api/vendas', async (req, res) => {
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
            // Inserir item da venda
            await client.query(
                `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [sale.id, item.id, item.name, item.quantity, item.price, item.total]
            );
            
            // Atualizar estoque
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
app.get('/api/dashboard', async (req, res) => {
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
app.get('/api/categorias', async (req, res) => {
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

// ================= ROTA DE INICIALIZAÇÃO MANUAL =================
app.post('/api/init-db', async (req, res) => {
    // 🔒 Segurança básica - você pode remover depois
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
            tables: ['categories', 'products', 'sales', 'sale_items'],
            sample_data: '5 produtos e 4 categorias inseridos'
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
║ 🩺 Health: /health                    ║
║ 📊 Dashboard: /                       ║
║ 🔧 Init DB: POST /api/init-db        ║
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
