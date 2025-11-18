// init-db.js - SCRIPT DE INICIALIZAÇÃO DO BANCO DE DADOS
import { Pool } from 'pg';

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Script SQL para criar as tabelas e dados iniciais
const initSQL = `
-- Criar tabela de categorias
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de produtos
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

-- Criar tabela de vendas
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

-- Criar tabela de itens da venda
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

-- Inserir categorias iniciais
INSERT INTO categories (name, description) VALUES 
('Geral', 'Produtos diversos'),
('Eletrônicos', 'Dispositivos eletrônicos'),
('Alimentação', 'Produtos alimentícios'),
('Limpeza', 'Produtos de limpeza')
ON CONFLICT DO NOTHING;

-- Inserir produtos de exemplo
INSERT INTO products (name, description, price, cost, stock_quantity, category_id, sku) VALUES 
('Smartphone Android', 'Smartphone Android 128GB', 899.90, 650.00, 15, 2, 'SP-AND001'),
('Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 1400.00, 8, 2, 'NB-I5001'),
('Café Premium', 'Café em grãos 500g', 24.90, 15.00, 50, 3, 'CF-PREM01'),
('Detergente', 'Detergente líquido 500ml', 3.90, 1.80, 100, 4, 'DT-LIQ01'),
('Água Mineral', 'Água mineral 500ml', 2.50, 0.80, 200, 3, 'AG-MIN01')
ON CONFLICT DO NOTHING;
`;

async function initializeDatabase() {
  let client;
  try {
    console.log('🔄 Conectando ao banco de dados...');
    client = await pool.connect();
    
    console.log('🗄️  Criando tabelas...');
    await client.query(initSQL);
    
    console.log('✅ Banco de dados inicializado com sucesso!');
    console.log('📊 Tabelas criadas: categories, products, sales, sale_items');
    console.log('🎯 Dados iniciais inseridos: 4 categorias, 5 produtos exemplo');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Executar a inicialização
initializeDatabase();
