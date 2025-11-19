// init-db.js - Inicialização do Banco de Dados FASE 5.1
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Configurar variáveis de ambiente
dotenv.config();

console.log('🚀 BIZFLOW FASE 5.1 - INICIALIZAÇÃO DO BANCO DE DADOS');
console.log('=' .repeat(60));

// Configurar pool de conexão
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando transação...');
    await client.query('BEGIN');

    console.log('📋 Criando tabelas...');
    
    // Script completo de criação de tabelas
    const createTablesSQL = `
      -- Tabela de empresas
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        cnpj VARCHAR(20),
        email VARCHAR(100),
        telefone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de sessões de usuário
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de vendas
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER DEFAULT 1,
        sale_code VARCHAR(50) UNIQUE NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        total_items INTEGER NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de itens da venda
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

      -- Índices para performance
      CREATE INDEX IF NOT EXISTS idx_sales_empresa_date ON sales(empresa_id, sale_date);
      CREATE INDEX IF NOT EXISTS idx_products_empresa_active ON products(empresa_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_financial_due_date ON financial_accounts(due_date);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
    `;

    await client.query(createTablesSQL);
    console.log('✅ Tabelas criadas com sucesso!');

    // Inserir dados iniciais
    console.log('📥 Inserindo dados iniciais...');
    
    // Empresa principal
    await client.query(`
      INSERT INTO empresas (id, nome, cnpj, email, telefone) 
      VALUES (1, 'Empresa Principal', '00.000.000/0001-00', 'contato@empresa.com', '(11) 9999-9999')
      ON CONFLICT (id) DO NOTHING
    `);

    // Usuário admin
    const passwordHash = await bcrypt.hash('admin123', 12);
    await client.query(`
      INSERT INTO users (id, empresa_id, username, email, password_hash, full_name, role) 
      VALUES (1, 1, 'admin', 'admin@bizflow.com', $1, 'Administrador do Sistema', 'admin')
      ON CONFLICT (id) DO NOTHING
    `, [passwordHash]);

    // Produtos de exemplo
    await client.query(`
      INSERT INTO products (empresa_id, name, description, price, stock_quantity, category) VALUES 
      (1, 'Smartphone Android', 'Smartphone Android 128GB', 899.90, 15, 'Eletrônicos'),
      (1, 'Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 8, 'Eletrônicos'),
      (1, 'Café Premium', 'Café em grãos 500g', 24.90, 50, 'Alimentação'),
      (1, 'Detergente', 'Detergente líquido 500ml', 3.90, 100, 'Limpeza'),
      (1, 'Água Mineral', 'Água mineral 500ml', 2.50, 200, 'Bebidas')
      ON CONFLICT DO NOTHING
    `);

    // Vendas de exemplo
    await client.query(`
      INSERT INTO sales (empresa_id, sale_code, total_amount, total_items, payment_method) VALUES 
      (1, 'V001', 899.90, 1, 'cartão'),
      (1, 'V002', 1899.90, 1, 'dinheiro'),
      (1, 'V003', 52.80, 3, 'cartão'),
      (1, 'V004', 7.80, 2, 'dinheiro')
      ON CONFLICT DO NOTHING
    `);

    // Itens das vendas
    await client.query(`
      INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price) VALUES 
      (1, 1, 'Smartphone Android', 1, 899.90, 899.90),
      (2, 2, 'Notebook i5', 1, 1899.90, 1899.90),
      (3, 3, 'Café Premium', 2, 24.90, 49.80),
      (3, 5, 'Água Mineral', 1, 2.50, 2.50),
      (4, 4, 'Detergente', 2, 3.90, 7.80)
      ON CONFLICT DO NOTHING
    `);

    // Contas financeiras
    await client.query(`
      INSERT INTO financial_accounts (empresa_id, name, type, amount, due_date, status) VALUES 
      (1, 'Venda Cliente A', 'receita', 1500.00, '2024-01-20', 'recebido'),
      (1, 'Aluguel', 'despesa', 1200.00, '2024-01-15', 'pago'),
      (1, 'Salários', 'despesa', 5000.00, '2024-01-25', 'pendente'),
      (1, 'Venda Online', 'receita', 890.50, '2024-01-18', 'recebido')
      ON CONFLICT DO NOTHING
    `);

    // Notificações
    await client.query(`
      INSERT INTO notifications (empresa_id, user_id, title, message, type) VALUES 
      (1, NULL, 'Sistema Iniciado', 'Sistema BizFlow FASE 5.1 iniciado com sucesso!', 'success'),
      (1, NULL, 'Bem-vindo', 'Bem-vindo ao sistema BizFlow FASE 5.1', 'info'),
      (1, NULL, 'Relatórios Disponíveis', 'Todos os relatórios estão disponíveis', 'info')
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('✅ Dados iniciais inseridos com sucesso!');
    
    console.log('\n🎉 BANCO DE DADOS INICIALIZADO COM SUCESSO!');
    console.log('👤 Usuário: admin');
    console.log('🔑 Senha: admin123');
    console.log('🏢 Empresa: Empresa Principal');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ ERRO na inicialização do banco:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar inicialização
initializeDatabase().catch(error => {
  console.error('💥 Falha crítica na inicialização:', error);
  process.exit(1);
});
