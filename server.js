// server.js - SISTEMA COMPLETO BIZFLOW FASE 4
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
      await ensureFinancialTables();
      await ensureBackupTables();
      await ensureAPITables();
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

      -- Tabela de grupos de permissões FASE 4
      CREATE TABLE user_groups (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        nome VARCHAR(100) NOT NULL,
        descricao TEXT,
        permissoes JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de usuários em grupos FASE 4
      CREATE TABLE user_group_members (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER REFERENCES user_groups(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, group_id)
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

      -- TABELAS FINANCEIRAS (ATUALIZADAS FASE 4)
      CREATE TABLE financial_accounts (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        filial_id INTEGER REFERENCES filiais(id),
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
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        report_type VARCHAR(100) NOT NULL,
        period_start DATE,
        period_end DATE,
        data JSONB,
        user_id INTEGER REFERENCES users(id),
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TABELAS DE BACKUP (ATUALIZADAS FASE 4)
      CREATE TABLE system_backups (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        backup_type VARCHAR(50) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        file_size INTEGER,
        data JSONB,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE audit_logs (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
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

      -- ================= FASE 4 - NOVAS TABELAS =================
      
      -- API Keys FASE 4
      CREATE TABLE api_keys (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        secret_key VARCHAR(255) NOT NULL,
        permissions JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP,
        last_used TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Webhooks FASE 4
      CREATE TABLE webhooks (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        url TEXT NOT NULL,
        events JSONB NOT NULL,
        secret_token VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        last_triggered TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Notificações FASE 4
      CREATE TABLE notifications (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        action_url TEXT,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Integrações FASE 4
      CREATE TABLE integrations (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        provider VARCHAR(100) NOT NULL,
        config JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Cache FASE 4
      CREATE TABLE cache_data (
        id SERIAL PRIMARY KEY,
        cache_key VARCHAR(255) NOT NULL,
        cache_value JSONB NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cache_key)
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
      (1, 'Financeiro', 'Transações financeiras'),
      (1, 'Serviços', 'Prestação de serviços');

      -- Inserir produtos padrão
      INSERT INTO products (empresa_id, filial_id, name, description, price, cost, stock_quantity, category_id, sku) VALUES 
      (1, 1, 'Smartphone Android', 'Smartphone Android 128GB', 899.90, 650.00, 15, 2, 'SP-AND001'),
      (1, 1, 'Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 1400.00, 8, 2, 'NB-I5001'),
      (1, 1, 'Café Premium', 'Café em grãos 500g', 24.90, 15.00, 50, 3, 'CF-PREM01'),
      (1, 1, 'Detergente', 'Detergente líquido 500ml', 3.90, 1.80, 100, 4, 'DT-LIQ01'),
      (1, 1, 'Água Mineral', 'Água mineral 500ml', 2.50, 0.80, 200, 3, 'AG-MIN01');

      -- Inserir grupos de permissões padrão FASE 4
      INSERT INTO user_groups (empresa_id, nome, descricao, permissoes) VALUES 
      (1, 'Administradores', 'Acesso total ao sistema', '{"dashboard": ["read", "write", "delete"], "vendas": ["read", "write", "delete"], "estoque": ["read", "write", "delete"], "financeiro": ["read", "write", "delete"], "relatorios": ["read", "write", "delete"], "backup": ["read", "write", "delete"], "configuracoes": ["read", "write", "delete"], "usuarios": ["read", "write", "delete"], "empresas": ["read", "write", "delete"]}'),
      (1, 'Gerentes', 'Acesso gerencial', '{"dashboard": ["read", "write"], "vendas": ["read", "write"], "estoque": ["read", "write"], "financeiro": ["read", "write"], "relatorios": ["read", "write"], "backup": ["read"], "configuracoes": ["read"], "usuarios": ["read"]}'),
      (1, 'Vendedores', 'Acesso básico de vendas', '{"dashboard": ["read"], "vendas": ["read", "write"], "estoque": ["read"], "financeiro": ["read"], "relatorios": ["read"]}');
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
        
        // Atualizar tabelas existentes para multi-empresa
        await client.query('ALTER TABLE users ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
        await client.query('ALTER TABLE users ADD COLUMN filial_id INTEGER REFERENCES filiais(id)');
        await client.query('ALTER TABLE categories ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
        await client.query('ALTER TABLE products ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
        await client.query('ALTER TABLE products ADD COLUMN filial_id INTEGER REFERENCES filiais(id)');
        await client.query('ALTER TABLE sales ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
        await client.query('ALTER TABLE sales ADD COLUMN filial_id INTEGER REFERENCES filiais(id)');
        await client.query('ALTER TABLE financial_accounts ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
        await client.query('ALTER TABLE financial_accounts ADD COLUMN filial_id INTEGER REFERENCES filiais(id)');
        await client.query('ALTER TABLE system_backups ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
        await client.query('ALTER TABLE audit_logs ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
        
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
        
        // Atualizar registros existentes
        await client.query('UPDATE users SET empresa_id = 1, filial_id = 1 WHERE empresa_id IS NULL');
        await client.query('UPDATE categories SET empresa_id = 1 WHERE empresa_id IS NULL');
        await client.query('UPDATE products SET empresa_id = 1, filial_id = 1 WHERE empresa_id IS NULL');
        await client.query('UPDATE sales SET empresa_id = 1, filial_id = 1 WHERE empresa_id IS NULL');
        await client.query('UPDATE financial_accounts SET empresa_id = 1 WHERE empresa_id IS NULL');
        await client.query('UPDATE system_backups SET empresa_id = 1 WHERE empresa_id IS NULL');
        await client.query('UPDATE audit_logs SET empresa_id = 1 WHERE empresa_id IS NULL');
        
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

async function ensureAPITables() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'api_keys'
      );
    `);
    
    if (!result.rows[0].exists) {
      console.log('🔄 Criando tabelas API FASE 4...');
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        await client.query(`
          CREATE TABLE api_keys (
            id SERIAL PRIMARY KEY,
            empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            api_key VARCHAR(255) UNIQUE NOT NULL,
            secret_key VARCHAR(255) NOT NULL,
            permissions JSONB DEFAULT '[]',
            is_active BOOLEAN DEFAULT true,
            expires_at TIMESTAMP,
            last_used TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query(`
          CREATE TABLE webhooks (
            id SERIAL PRIMARY KEY,
            empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            url TEXT NOT NULL,
            events JSONB NOT NULL,
            secret_token VARCHAR(255),
            is_active BOOLEAN DEFAULT true,
            last_triggered TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query(`
          CREATE TABLE notifications (
            id SERIAL PRIMARY KEY,
            empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            title VARCHAR(200) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(50) DEFAULT 'info',
            is_read BOOLEAN DEFAULT false,
            action_url TEXT,
            data JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query(`
          CREATE TABLE integrations (
            id SERIAL PRIMARY KEY,
            empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
            provider VARCHAR(100) NOT NULL,
            config JSONB NOT NULL,
            is_active BOOLEAN DEFAULT true,
            last_sync TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query(`
          CREATE TABLE cache_data (
            id SERIAL PRIMARY KEY,
            cache_key VARCHAR(255) NOT NULL,
            cache_value JSONB NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(cache_key)
          )
        `);
        
        await client.query('COMMIT');
        console.log('✅ Tabelas API FASE 4 criadas!');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error('❌ Erro ao verificar tabelas API:', error);
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
      console.log('🔄 Criando tabelas financeiras FASE 4...');
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        await client.query(`
          CREATE TABLE financial_accounts (
            id SERIAL PRIMARY KEY,
            empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
            filial_id INTEGER REFERENCES filiais(id),
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
            empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
            report_type VARCHAR(100) NOT NULL,
            period_start DATE,
            period_end DATE,
            data JSONB,
            user_id INTEGER REFERENCES users(id),
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await client.query('COMMIT');
        console.log('✅ Tabelas financeiras FASE 4 criadas!');
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
      console.log('🔄 Criando tabelas de backup FASE 4...');
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        await client.query(`
          CREATE TABLE system_backups (
            id SERIAL PRIMARY KEY,
            empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
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
            empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
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
        console.log('✅ Tabelas de backup FASE 4 criadas!');
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
    const result = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    
    if (result.rows.length === 0) {
      console.log('🔄 Criando usuário admin...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(
        `INSERT INTO users (empresa_id, filial_id, username, email, password_hash, full_name, role, permissoes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [1, 1, 'admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin', '{"*": ["*"]}']
      );
      
      console.log('✅ Usuário admin criado!');
    } else {
      console.log('✅ Usuário admin já existe');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar usuário admin:', error);
  }
}

// ================= MIDDLEWARES FASE 4 =================

// Middleware de contexto empresarial FASE 4 - CORRIGIDO
async function empresaContext(req, res, next) {
  try {
    let empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || req.body.empresa_id;
    
    console.log('🏢 Contexto empresarial - ID fornecido:', empresaId);
    
    // Se não foi fornecido, usar empresa padrão
    if (!empresaId) {
      console.log('🔍 Buscando empresa padrão...');
      
      try {
        // Verificar se a tabela empresas existe
        const tableExists = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'empresas'
          );
        `);
        
        if (tableExists.rows[0].exists) {
          // Tentar buscar empresa padrão
          const empresaResult = await pool.query(
            'SELECT id FROM empresas WHERE is_active = true ORDER BY id LIMIT 1'
          );
          
          if (empresaResult.rows.length > 0) {
            empresaId = empresaResult.rows[0].id;
            console.log('✅ Empresa padrão encontrada:', empresaId);
          } else {
            empresaId = 1; // Fallback
            console.log('⚠️ Nenhuma empresa encontrada, usando fallback:', empresaId);
          }
        } else {
          empresaId = 1; // Fallback se tabela não existe
          console.log('⚠️ Tabela empresas não existe, usando fallback:', empresaId);
        }
      } catch (dbError) {
        console.error('❌ Erro ao buscar empresa padrão:', dbError);
        empresaId = 1; // Fallback em caso de erro
      }
    }
    
    req.empresa_id = parseInt(empresaId);
    console.log('🏢 Contexto empresarial definido:', req.empresa_id);
    next();
  } catch (error) {
    console.error('❌ Erro no contexto empresarial:', error);
    // Continuar mesmo com erro no contexto
    req.empresa_id = 1;
    console.log('🏢 Contexto empresarial de fallback:', req.empresa_id);
    next();
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

// Middleware de auditoria FASE 4
async function logAudit(action, tableName, recordId, oldValues, newValues, req) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (empresa_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.empresa_id,
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

// ================= WEBSOCKET FASE 4 =================

// Conexões WebSocket
const connectedUsers = new Map();

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
        connectedUsers.set(socket.id, user);
        
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

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} entrou na sala ${room}`);
  });

  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`🔌 Usuário ${user.full_name} desconectado`);
      connectedUsers.delete(socket.id);
    }
  });
});

// Função para enviar notificações
async function sendNotification(empresaId, userId, title, message, type = 'info', actionUrl = null) {
  try {
    // Salvar no banco
    const notificationResult = await pool.query(
      `INSERT INTO notifications (empresa_id, user_id, title, message, type, action_url) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [empresaId, userId, title, message, type, actionUrl]
    );

    // Enviar via WebSocket
    if (userId) {
      io.to(`user_${userId}`).emit('notification', notificationResult.rows[0]);
    } else {
      io.to(`empresa_${empresaId}`).emit('notification', notificationResult.rows[0]);
    }

    return notificationResult.rows[0];
  } catch (error) {
    console.error('Erro ao enviar notificação:', error);
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
      phase: 'FASE 4 COMPLETA - Sistema Empresarial & Multi-empresa',
      features: [
        'Sistema Multi-empresa',
        'Gestão de Filiais',
        'Controle de Permissões Avançado',
        'API REST Completa',
        'WebSocket & Notificações em Tempo Real',
        'Integração com APIs Externas',
        'Otimização de Performance',
        'Monitoramento e Logs'
      ]
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message 
    });
  }
});

// ================= ROTAS DE AUTENTICAÇÃO FASE 4 =================
app.post('/api/auth/login', empresaContext, async (req, res) => {
  try {
    const { username, password, empresa_id } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username e password são obrigatórios' 
      });
    }

    console.log(`🔐 Tentativa de login: ${username}, Empresa: ${req.empresa_id}`);

    // CORREÇÃO: Buscar usuário de forma mais simples primeiro
    let userQuery = `
      SELECT u.* 
      FROM users u 
      WHERE u.username = $1 AND u.is_active = true
    `;
    
    let queryParams = [username];
    
    // Se empresa_id foi fornecido, filtrar por empresa
    if (req.empresa_id) {
      userQuery += ' AND u.empresa_id = $2';
      queryParams.push(req.empresa_id);
    }

    const userResult = await pool.query(userQuery, queryParams);

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

    console.log('✅ Senha válida para:', username);

    // Buscar informações completas do usuário com JOINs (se necessário)
    let userCompleteQuery = `
      SELECT u.*, e.nome as empresa_nome, f.nome as filial_nome 
      FROM users u 
      LEFT JOIN empresas e ON u.empresa_id = e.id 
      LEFT JOIN filiais f ON u.filial_id = f.id 
      WHERE u.id = $1
    `;
    
    const userCompleteResult = await pool.query(userCompleteQuery, [user.id]);
    const userComplete = userCompleteResult.rows[0] || user;

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
    const { password_hash, ...userWithoutPassword } = userComplete;

    console.log('✅ Login realizado com sucesso para:', username);

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
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ================= ROTAS MULTI-EMPRESA FASE 4 =================

// Empresas
app.get('/api/empresas', requireAuth, checkPermission('empresas', 'read'), async (req, res) => {
  try {
    let query = 'SELECT * FROM empresas WHERE is_active = true';
    let params = [];
    
    // Se não for admin, só mostra a própria empresa
    if (req.user.role !== 'admin') {
      query += ' AND id = $1';
      params.push(req.user.empresa_id);
    }
    
    query += ' ORDER BY nome';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar empresas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/empresas', requireAuth, checkPermission('empresas', 'write'), async (req, res) => {
  try {
    const { nome, cnpj, email, telefone, endereco, cidade, estado, cep, logo_url } = req.body;
    
    const result = await pool.query(
      `INSERT INTO empresas (nome, cnpj, email, telefone, endereco, cidade, estado, cep, logo_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [nome, cnpj, email, telefone, endereco, cidade, estado, cep, logo_url]
    );

    const newEmpresa = result.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'empresas', newEmpresa.id, null, newEmpresa, req);

    res.json({
      success: true,
      data: newEmpresa,
      message: "Empresa criada com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar empresa:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Filiais
app.get('/api/filiais', requireAuth, empresaContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, e.nome as empresa_nome 
       FROM filiais f 
       LEFT JOIN empresas e ON f.empresa_id = e.id 
       WHERE f.empresa_id = $1 AND f.is_active = true 
       ORDER BY f.nome`,
      [req.empresa_id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar filiais:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/filiais', requireAuth, checkPermission('empresas', 'write'), empresaContext, async (req, res) => {
  try {
    const { nome, codigo, telefone, endereco, cidade, estado, cep, responsavel } = req.body;
    
    const result = await pool.query(
      `INSERT INTO filiais (empresa_id, nome, codigo, telefone, endereco, cidade, estado, cep, responsavel) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [req.empresa_id, nome, codigo, telefone, endereco, cidade, estado, cep, responsavel]
    );

    const newFilial = result.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'filiais', newFilial.id, null, newFilial, req);

    res.json({
      success: true,
      data: newFilial,
      message: "Filial criada com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar filial:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS DE PERMISSÕES FASE 4 =================

// Grupos de usuários
app.get('/api/grupos', requireAuth, checkPermission('usuarios', 'read'), empresaContext, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_groups WHERE empresa_id = $1 AND is_active = true ORDER BY nome',
      [req.empresa_id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar grupos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/grupos', requireAuth, checkPermission('usuarios', 'write'), empresaContext, async (req, res) => {
  try {
    const { nome, descricao, permissoes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO user_groups (empresa_id, nome, descricao, permissoes) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [req.empresa_id, nome, descricao, permissoes]
    );

    const newGroup = result.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'user_groups', newGroup.id, null, newGroup, req);

    res.json({
      success: true,
      data: newGroup,
      message: "Grupo criado com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar grupo:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Usuários
app.get('/api/usuarios', requireAuth, checkPermission('usuarios', 'read'), empresaContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.*, e.nome as empresa_nome, f.nome as filial_nome 
       FROM users u 
       LEFT JOIN empresas e ON u.empresa_id = e.id 
       LEFT JOIN filiais f ON u.filial_id = f.id 
       WHERE u.empresa_id = $1 AND u.is_active = true 
       ORDER BY u.full_name`,
      [req.empresa_id]
    );
    
    // Remover passwords
    const usuarios = result.rows.map(user => {
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    
    res.json({
      success: true,
      data: usuarios
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/usuarios', requireAuth, checkPermission('usuarios', 'write'), empresaContext, async (req, res) => {
  try {
    const { username, email, password, full_name, role, filial_id, permissoes } = req.body;

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
      'SELECT id FROM users WHERE username = $1 AND empresa_id = $2',
      [username, req.empresa_id]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username já está em uso' 
      });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Criar usuário
    const userResult = await pool.query(
      `INSERT INTO users (empresa_id, filial_id, username, email, password_hash, full_name, role, permissoes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id, username, email, full_name, role, created_at`,
      [req.empresa_id, filial_id, username, email, passwordHash, full_name, role, permissoes || {}]
    );

    const newUser = userResult.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'users', newUser.id, null, { username, email, full_name }, req);

    // Enviar notificação
    await sendNotification(
      req.empresa_id,
      null,
      'Novo Usuário',
      `Usuário ${full_name} foi criado no sistema`,
      'info'
    );

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      data: newUser
    });

  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// ================= ROTAS DA APLICAÇÃO (ATUALIZADAS FASE 4) =================

// Produtos (com multi-empresa)
app.get('/api/produtos', requireAuth, empresaContext, async (req, res) => {
  try {
    const { filial_id } = req.query;
    
    let query = `
      SELECT p.*, c.name as categoria, f.nome as filial_nome
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN filiais f ON p.filial_id = f.id
      WHERE p.empresa_id = $1 AND p.is_active = true 
    `;
    
    let params = [req.empresa_id];
    
    if (filial_id) {
      query += ' AND p.filial_id = $2';
      params.push(filial_id);
    }
    
    query += ' ORDER BY p.name';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/produtos', requireAuth, checkPermission('estoque', 'write'), empresaContext, async (req, res) => {
  try {
    const { name, description, price, cost, stock_quantity, category_id, sku, barcode, filial_id } = req.body;
    
    const result = await pool.query(
      `INSERT INTO products (empresa_id, filial_id, name, description, price, cost, stock_quantity, category_id, sku, barcode) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [req.empresa_id, filial_id || req.user.filial_id, name, description, price, cost, stock_quantity, category_id, sku, barcode]
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

// Vendas (com multi-empresa)
app.get('/api/vendas', requireAuth, empresaContext, async (req, res) => {
  try {
    const { limit = 50, offset = 0, filial_id } = req.query;
    
    let query = `
      SELECT s.*, 
             COUNT(si.id) as items_count,
             u.full_name as vendedor,
             f.nome as filial_nome
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN filiais f ON s.filial_id = f.id
      WHERE s.empresa_id = $1
    `;
    
    let params = [req.empresa_id];
    
    if (filial_id) {
      query += ' AND s.filial_id = $2';
      params.push(filial_id);
    }
    
    query += `
      GROUP BY s.id, u.full_name, f.nome
      ORDER BY s.sale_date DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
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

app.post('/api/vendas', requireAuth, checkPermission('vendas', 'write'), empresaContext, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { items, total_amount, total_items, payment_method, notes, filial_id } = req.body;
    
    // Gerar código da venda
    const saleCode = 'V' + Date.now();
    
    // Inserir venda
    const saleResult = await client.query(
      `INSERT INTO sales (empresa_id, filial_id, sale_code, total_amount, total_items, payment_method, notes, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [req.empresa_id, filial_id || req.user.filial_id, saleCode, total_amount, total_items, payment_method, notes, req.user.id]
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
           WHERE id = $2 AND empresa_id = $3`,
          [item.quantity, item.id, req.empresa_id]
        );
      }
    }
    
    await client.query('COMMIT');

    // Registrar auditoria
    await logAudit('CREATE', 'sales', sale.id, null, sale, req);

    // Enviar notificação
    await sendNotification(
      req.empresa_id,
      null,
      'Nova Venda',
      `Venda ${saleCode} registrada - R$ ${total_amount}`,
      'success'
    );

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

// ================= API REST FASE 4 =================

// Gerar API Key
app.post('/api/api-keys/generate', requireAuth, checkPermission('configuracoes', 'write'), empresaContext, async (req, res) => {
  try {
    const { name, permissions, expires_in_days } = req.body;
    
    const apiKey = 'bizflow_' + crypto.randomBytes(32).toString('hex');
    const secretKey = crypto.randomBytes(64).toString('hex');
    
    let expiresAt = null;
    if (expires_in_days) {
      expiresAt = new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000);
    }
    
    const result = await pool.query(
      `INSERT INTO api_keys (empresa_id, name, api_key, secret_key, permissions, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, name, api_key, permissions, expires_at, created_at`,
      [req.empresa_id, name, apiKey, secretKey, permissions || [], expiresAt]
    );

    const newApiKey = result.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'api_keys', newApiKey.id, null, { name }, req);

    res.json({
      success: true,
      data: {
        ...newApiKey,
        secret_key: secretKey // Mostrar apenas uma vez
      },
      message: "API Key gerada com sucesso! Guarde a secret_key com segurança."
    });
  } catch (error) {
    console.error('Erro ao gerar API key:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Middleware de autenticação API
async function requireApiAuth(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    
    if (!apiKey || !signature || !timestamp) {
      return res.status(401).json({ success: false, error: 'Credenciais API necessárias' });
    }
    
    // Verificar timestamp (prevenir replay attacks)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    if (Math.abs(now - requestTime) > 300000) { // 5 minutos
      return res.status(401).json({ success: false, error: 'Timestamp inválido' });
    }
    
    // Buscar API key
    const apiKeyResult = await pool.query(
      `SELECT ak.*, e.nome as empresa_nome 
       FROM api_keys ak 
       LEFT JOIN empresas e ON ak.empresa_id = e.id 
       WHERE ak.api_key = $1 AND ak.is_active = true AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
      [apiKey]
    );
    
    if (apiKeyResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'API Key inválida' });
    }
    
    const apiKeyData = apiKeyResult.rows[0];
    
    // Verificar assinatura
    const dataToSign = `${timestamp}${req.method}${req.path}${JSON.stringify(req.body)}`;
    const expectedSignature = crypto
      .createHmac('sha256', apiKeyData.secret_key)
      .update(dataToSign)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return res.status(401).json({ success: false, error: 'Assinatura inválida' });
    }
    
    // Atualizar último uso
    await pool.query(
      'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = $1',
      [apiKeyData.id]
    );
    
    req.empresa_id = apiKeyData.empresa_id;
    req.api_key = apiKeyData;
    
    next();
  } catch (error) {
    console.error('Erro na autenticação API:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}

// Rotas da API
app.get('/api/v1/products', requireApiAuth, empresaContext, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT id, name, description, price, cost, stock_quantity, sku, barcode, created_at
       FROM products 
       WHERE empresa_id = $1 AND is_active = true 
       ORDER BY name 
       LIMIT $2 OFFSET $3`,
      [req.empresa_id, limit, offset]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro API produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/v1/sales', requireApiAuth, empresaContext, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { items, total_amount, total_items, payment_method, notes } = req.body;
    
    // Gerar código da venda
    const saleCode = 'API_V' + Date.now();
    
    // Inserir venda
    const saleResult = await client.query(
      `INSERT INTO sales (empresa_id, filial_id, sale_code, total_amount, total_items, payment_method, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [req.empresa_id, 1, saleCode, total_amount, total_items, payment_method, notes]
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
          `UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2 AND empresa_id = $3`,
          [item.quantity, item.product_id, req.empresa_id]
        );
      }
    }
    
    await client.query('COMMIT');

    res.json({
      success: true,
      data: sale,
      message: "Venda registrada via API com sucesso!"
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro API venda:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// ================= ROTAS DE NOTIFICAÇÕES FASE 4 =================

app.get('/api/notifications', requireAuth, empresaContext, async (req, res) => {
  try {
    const { limit = 20, offset = 0, unread_only } = req.query;
    
    let query = `
      SELECT * FROM notifications 
      WHERE empresa_id = $1 AND (user_id IS NULL OR user_id = $2)
    `;
    
    let params = [req.empresa_id, req.user.id];
    
    if (unread_only === 'true') {
      query += ' AND is_read = false';
    }
    
    query += ' ORDER BY created_at DESC LIMIT $3 OFFSET $4';
    
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/notifications/:id/read', requireAuth, empresaContext, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND empresa_id = $2',
      [id, req.empresa_id]
    );
    
    res.json({
      success: true,
      message: "Notificação marcada como lida"
    });
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS FINANCEIRAS (ATUALIZADAS FASE 4) =================

app.get('/api/financeiro/contas', requireAuth, empresaContext, async (req, res) => {
  try {
    const { tipo, status } = req.query;
    
    let query = `
      SELECT fa.*, f.nome as filial_nome, u.full_name as usuario_nome
      FROM financial_accounts fa
      LEFT JOIN filiais f ON fa.filial_id = f.id
      LEFT JOIN users u ON fa.user_id = u.id
      WHERE fa.empresa_id = $1
    `;
    
    let params = [req.empresa_id];
    
    if (tipo) {
      query += ' AND fa.type = $2';
      params.push(tipo);
    }
    
    if (status) {
      query += ' AND fa.status = $' + (params.length + 1);
      params.push(status);
    }
    
    query += ' ORDER BY fa.due_date, fa.created_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar contas financeiras:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/financeiro/contas', requireAuth, checkPermission('financeiro', 'write'), empresaContext, async (req, res) => {
  try {
    const { name, type, category, amount, due_date, status, filial_id } = req.body;
    
    const result = await pool.query(
      `INSERT INTO financial_accounts (empresa_id, filial_id, name, type, category, amount, due_date, status, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [req.empresa_id, filial_id || req.user.filial_id, name, type, category, amount, due_date, status || 'pendente', req.user.id]
    );

    const newAccount = result.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'financial_accounts', newAccount.id, null, newAccount, req);

    res.json({
      success: true,
      data: newAccount,
      message: "Conta financeira registrada com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao criar conta financeira:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS DE RELATÓRIOS FASE 4 =================

app.get('/api/relatorios/vendas', requireAuth, empresaContext, async (req, res) => {
  try {
    const { data_inicio, data_fim, filial_id } = req.query;
    
    let query = `
      SELECT 
        DATE(s.sale_date) as data,
        COUNT(*) as total_vendas,
        SUM(s.total_amount) as total_valor,
        AVG(s.total_amount) as valor_medio,
        COUNT(DISTINCT s.user_id) as vendedores_ativos
      FROM sales s
      WHERE s.empresa_id = $1 AND s.status = 'completed'
    `;
    
    let params = [req.empresa_id];
    
    if (data_inicio) {
      query += ' AND DATE(s.sale_date) >= $' + (params.length + 1);
      params.push(data_inicio);
    }
    
    if (data_fim) {
      query += ' AND DATE(s.sale_date) <= $' + (params.length + 1);
      params.push(data_fim);
    }
    
    if (filial_id) {
      query += ' AND s.filial_id = $' + (params.length + 1);
      params.push(filial_id);
    }
    
    query += ' GROUP BY DATE(s.sale_date) ORDER BY data DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de vendas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.get('/api/relatorios/estoque', requireAuth, empresaContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.name as produto,
        p.stock_quantity as quantidade,
        p.min_stock as estoque_minimo,
        c.name as categoria,
        f.nome as filial,
        CASE 
          WHEN p.stock_quantity <= p.min_stock THEN 'CRÍTICO'
          WHEN p.stock_quantity <= p.min_stock * 2 THEN 'ALERTA'
          ELSE 'NORMAL'
        END as status_estoque
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN filiais f ON p.filial_id = f.id
      WHERE p.empresa_id = $1 AND p.is_active = true
      ORDER BY status_estoque, p.stock_quantity ASC`,
      [req.empresa_id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de estoque:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS DE BACKUP FASE 4 =================

app.get('/api/backups', requireAuth, checkPermission('backup', 'read'), empresaContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sb.*, u.full_name as usuario_nome
       FROM system_backups sb
       LEFT JOIN users u ON sb.user_id = u.id
       WHERE sb.empresa_id = $1
       ORDER BY sb.created_at DESC
       LIMIT 50`,
      [req.empresa_id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar backups:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/backups/gerar', requireAuth, checkPermission('backup', 'write'), empresaContext, async (req, res) => {
  try {
    const { backup_type, observacoes } = req.body;
    
    // Simular dados do backup (em produção, isso seria um dump real do banco)
    const backupData = {
      timestamp: new Date().toISOString(),
      empresa_id: req.empresa_id,
      usuario_id: req.user.id,
      tabelas: ['users', 'products', 'sales', 'financial_accounts'],
      registros: 1500,
      observacoes: observacoes || 'Backup automático do sistema'
    };
    
    const filename = `backup_${req.empresa_id}_${Date.now()}.json`;
    
    const result = await pool.query(
      `INSERT INTO system_backups (empresa_id, backup_type, filename, file_size, data, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [req.empresa_id, backup_type || 'automático', filename, JSON.stringify(backupData).length, backupData, req.user.id]
    );

    const newBackup = result.rows[0];

    // Registrar auditoria
    await logAudit('CREATE', 'system_backups', newBackup.id, null, { backup_type, filename }, req);

    // Enviar notificação
    await sendNotification(
      req.empresa_id,
      null,
      'Backup Gerado',
      `Backup do sistema gerado: ${filename}`,
      'info'
    );

    res.json({
      success: true,
      data: newBackup,
      message: "Backup gerado com sucesso!"
    });
  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS DE AUDITORIA FASE 4 =================

app.get('/api/auditoria', requireAuth, checkPermission('configuracoes', 'read'), empresaContext, async (req, res) => {
  try {
    const { limit = 50, offset = 0, acao, data_inicio, data_fim } = req.query;
    
    let query = `
      SELECT al.*, u.full_name as usuario_nome, u.username
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.empresa_id = $1
    `;
    
    let params = [req.empresa_id];
    
    if (acao) {
      query += ' AND al.action = $' + (params.length + 1);
      params.push(acao);
    }
    
    if (data_inicio) {
      query += ' AND DATE(al.created_at) >= $' + (params.length + 1);
      params.push(data_inicio);
    }
    
    if (data_fim) {
      query += ' AND DATE(al.created_at) <= $' + (params.length + 1);
      params.push(data_fim);
    }
    
    query += ' ORDER BY al.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar logs de auditoria:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= INICIALIZAÇÃO DO SERVIDOR FASE 4 =================
async function startServer() {
  try {
    console.log('🚀 Iniciando BizFlow Server FASE 4 COMPLETA...');
    
    // Inicializar banco de dados
    await initializeDatabase();
    
    // Iniciar servidor
    server.listen(PORT, HOST, () => {
      console.log(`
╔══════════════════════════════════════════════════╗
║              🚀 BIZFLOW API FASE 4              ║
║           SISTEMA EMPRESARIAL COMPLETO          ║
╠══════════════════════════════════════════════════╣
║ 📍 Porta: ${PORT}                                      ║
║ 🌐 Host: ${HOST}                                     ║
║ 🗄️  Banco: PostgreSQL                             ║
║ 🔌 WebSocket: ✅ ATIVADO                          ║
║ 🏢 Multi-empresa: ✅ ATIVADO                      ║
║ 🏪 Gestão de Filiais: ✅ ATIVADO                  ║
║ 🔐 Permissões Avançadas: ✅ ATIVADO               ║
║ 🌐 API REST: ✅ ATIVADO                           ║
║ 🔔 Notificações: ✅ ATIVADO                       ║
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
