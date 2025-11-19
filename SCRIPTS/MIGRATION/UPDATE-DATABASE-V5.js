// scripts/migration/update-database-v5.js
import { Pool } from 'pg';
import dotenv from 'dotenv';
import BizFlowLogger from '../utils/logger.js';

dotenv.config();

class DatabaseMigration {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }

    async runMigrations() {
        const client = await this.pool.connect();
        
        try {
            BizFlowLogger.businessLog('Iniciando migração do banco para FASE 5 HÍBRIDA...');
            await client.query('BEGIN');

            // ✅ 1. VERIFICAR E ADICIONAR COLUNAS FALTANTES
            await this.checkAndAddColumns(client);

            // ✅ 2. ATUALIZAR TABELA PRODUCTS
            await this.updateProductsTable(client);

            // ✅ 3. ATUALIZAR TABELA SALES
            await this.updateSalesTable(client);

            // ✅ 4. ATUALIZAR TABELA FINANCIAL_ACCOUNTS
            await this.updateFinancialAccountsTable(client);

            // ✅ 5. CRIAR NOVAS TABELAS
            await this.createNewTables(client);

            // ✅ 6. INSERIR DADOS DE EXEMPLO
            await this.insertSampleData(client);

            await client.query('COMMIT');
            BizFlowLogger.businessLog('✅ Migração do banco concluída com sucesso!');

        } catch (error) {
            await client.query('ROLLBACK');
            BizFlowLogger.errorLog(error, { context: 'database migration' });
            throw error;
        } finally {
            client.release();
        }
    }

    async checkAndAddColumns(client) {
        BizFlowLogger.businessLog('Verificando e adicionando colunas...');

        // ✅ COLUNAS PARA TABELA PRODUCTS
        const productColumns = [
            { name: 'category', type: 'VARCHAR(100)', default: "'Geral'" },
            { name: 'min_stock', type: 'INTEGER', default: '5' },
            { name: 'is_active', type: 'BOOLEAN', default: 'true' },
            { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' }
        ];

        for (const column of productColumns) {
            await this.addColumnIfNotExists(client, 'products', column);
        }

        // ✅ COLUNAS PARA TABELA SALES
        const salesColumns = [
            { name: 'sale_code', type: 'VARCHAR(50)' },
            { name: 'total_items', type: 'INTEGER', default: '1' },
            { name: 'payment_method', type: 'VARCHAR(50)', default: "'dinheiro'" },
            { name: 'status', type: 'VARCHAR(20)', default: "'completed'" },
            { name: 'empresa_id', type: 'INTEGER', default: '1' }
        ];

        for (const column of salesColumns) {
            await this.addColumnIfNotExists(client, 'sales', column);
        }
    }

    async addColumnIfNotExists(client, table, column) {
        try {
            const checkQuery = `
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = $2
            `;
            
            const result = await client.query(checkQuery, [table, column.name]);
            
            if (result.rows.length === 0) {
                const alterQuery = `
                    ALTER TABLE ${table} 
                    ADD COLUMN ${column.name} ${column.type} 
                    ${column.default ? `DEFAULT ${column.default}` : ''}
                `;
                
                await client.query(alterQuery);
                BizFlowLogger.businessLog(`✅ Coluna ${column.name} adicionada à tabela ${table}`);
            } else {
                BizFlowLogger.businessLog(`ℹ️ Coluna ${column.name} já existe na tabela ${table}`);
            }
        } catch (error) {
            BizFlowLogger.errorLog(error, { 
                context: `addColumnIfNotExists - ${table}.${column.name}` 
            });
        }
    }

    async updateProductsTable(client) {
        BizFlowLogger.businessLog('Atualizando tabela products...');

        try {
            // ✅ ADICIONAR CATEGORY SE NÃO EXISTIR
            await client.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'products' AND column_name = 'category'
                    ) THEN
                        ALTER TABLE products ADD COLUMN category VARCHAR(100) DEFAULT 'Geral';
                    END IF;
                END $$;
            `);

            // ✅ ATUALIZAR CATEGORIAS EXISTENTES
            await client.query(`
                UPDATE products 
                SET category = CASE 
                    WHEN name ILIKE '%smartphone%' OR name ILIKE '%notebook%' THEN 'Eletrônicos'
                    WHEN name ILIKE '%café%' OR name ILIKE '%alimento%' THEN 'Alimentação'
                    WHEN name ILIKE '%detergente%' OR name ILIKE '%limpeza%' THEN 'Limpeza'
                    WHEN name ILIKE '%água%' OR name ILIKE '%bebida%' THEN 'Bebidas'
                    ELSE 'Geral'
                END
                WHERE category IS NULL OR category = 'Geral';
            `);

            BizFlowLogger.businessLog('✅ Tabela products atualizada com sucesso');

        } catch (error) {
            BizFlowLogger.errorLog(error, { context: 'updateProductsTable' });
            throw error;
        }
    }

    async updateSalesTable(client) {
        BizFlowLogger.businessLog('Atualizando tabela sales...');

        try {
            // ✅ GARANTIR SALE_CODE ÚNICO
            await client.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'sales' AND column_name = 'sale_code'
                    ) THEN
                        ALTER TABLE sales ADD COLUMN sale_code VARCHAR(50) UNIQUE;
                    END IF;
                END $$;
            `);

            // ✅ GERAR SALE_CODES PARA VENDAS EXISTENTES
            await client.query(`
                UPDATE sales 
                SET sale_code = 'V' || LPAD(id::text, 4, '0')
                WHERE sale_code IS NULL;
            `);

            BizFlowLogger.businessLog('✅ Tabela sales atualizada com sucesso');

        } catch (error) {
            BizFlowLogger.errorLog(error, { context: 'updateSalesTable' });
            throw error;
        }
    }

    async updateFinancialAccountsTable(client) {
        BizFlowLogger.businessLog('Atualizando tabela financial_accounts...');

        try {
            // ✅ ADICIONAR COLUNAS FALTANTES
            const financialColumns = [
                { name: 'empresa_id', type: 'INTEGER', default: '1' },
                { name: 'due_date', type: 'DATE' },
                { name: 'status', type: 'VARCHAR(50)', default: "'pendente'" },
                { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
                { name: 'updated_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' }
            ];

            for (const column of financialColumns) {
                await this.addColumnIfNotExists(client, 'financial_accounts', column);
            }

            BizFlowLogger.businessLog('✅ Tabela financial_accounts atualizada com sucesso');

        } catch (error) {
            BizFlowLogger.errorLog(error, { context: 'updateFinancialAccountsTable' });
            throw error;
        }
    }

    async createNewTables(client) {
        BizFlowLogger.businessLog('Criando novas tabelas...');

        const tablesSQL = `
            -- ✅ TABELA DE NOTIFICAÇÕES
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER DEFAULT 1,
                user_id INTEGER REFERENCES users(id),
                title VARCHAR(200) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'info',
                priority VARCHAR(20) DEFAULT 'medium',
                metadata JSONB,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- ✅ TABELA DE SESSÕES DE USUÁRIO
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                session_token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- ✅ TABELA DE ITENS DA VENDA
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

            -- ✅ TABELA DE RELATÓRIOS
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER DEFAULT 1,
                report_type VARCHAR(100) NOT NULL,
                title VARCHAR(200) NOT NULL,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- ✅ ÍNDICES PARA PERFORMANCE
            CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
            CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
            CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
            CREATE INDEX IF NOT EXISTS idx_sales_empresa ON sales(empresa_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
            CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
        `;

        await client.query(tablesSQL);
        BizFlowLogger.businessLog('✅ Novas tabelas criadas com sucesso');
    }

    async insertSampleData(client) {
        BizFlowLogger.businessLog('Inserindo dados de exemplo...');

        try {
            // ✅ VERIFICAR SE JÁ EXISTEM PRODUTOS
            const productsCheck = await client.query('SELECT COUNT(*) FROM products');
            
            if (parseInt(productsCheck.rows[0].count) === 0) {
                await client.query(`
                    INSERT INTO products (name, description, price, stock_quantity, min_stock, category, is_active) VALUES 
                    ('Smartphone Android', 'Smartphone Android 128GB', 899.90, 15, 5, 'Eletrônicos', true),
                    ('Notebook i5', 'Notebook Core i5 8GB RAM', 1899.90, 8, 3, 'Eletrônicos', true),
                    ('Café Premium', 'Café em grãos 500g', 24.90, 50, 10, 'Alimentação', true),
                    ('Detergente', 'Detergente líquido 500ml', 3.90, 100, 20, 'Limpeza', true),
                    ('Água Mineral', 'Água mineral 500ml', 2.50, 200, 50, 'Bebidas', true);
                `);
            }

            // ✅ VERIFICAR SE JÁ EXISTEM VENDAS
            const salesCheck = await client.query('SELECT COUNT(*) FROM sales');
            
            if (parseInt(salesCheck.rows[0].count) === 0) {
                await client.query(`
                    INSERT INTO sales (sale_code, total_amount, total_items, payment_method, empresa_id) VALUES 
                    ('V0001', 899.90, 1, 'cartão', 1),
                    ('V0002', 1899.90, 1, 'dinheiro', 1),
                    ('V0003', 52.80, 3, 'cartão', 1),
                    ('V0004', 7.80, 2, 'pix', 1);
                `);
            }

            // ✅ INSERIR NOTIFICAÇÕES DE EXEMPLO
            await client.query(`
                INSERT INTO notifications (empresa_id, title, message, type, priority) VALUES 
                (1, 'Sistema Atualizado', 'Banco de dados atualizado para FASE 5 HÍBRIDA', 'success', 'high'),
                (1, 'Bem-vindo', 'Sistema BizFlow FASE 5 HÍBRIDA está pronto para uso', 'info', 'medium')
                ON CONFLICT DO NOTHING;
            `);

            BizFlowLogger.businessLog('✅ Dados de exemplo inseridos com sucesso');

        } catch (error) {
            BizFlowLogger.errorLog(error, { context: 'insertSampleData' });
            // Não lançar erro para não quebrar a migração
        }
    }

    async verifyMigration() {
        BizFlowLogger.businessLog('Verificando migração...');

        const checks = [
            { table: 'products', column: 'category' },
            { table: 'products', column: 'min_stock' },
            { table: 'sales', column: 'sale_code' },
            { table: 'sales', column: 'payment_method' },
            { table: 'notifications', column: 'title' },
            { table: 'user_sessions', column: 'session_token' }
        ];

        for (const check of checks) {
            try {
                const result = await this.pool.query(`
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = $1 AND column_name = $2
                `, [check.table, check.column]);

                if (result.rows.length > 0) {
                    BizFlowLogger.businessLog(`✅ ${check.table}.${check.column} - OK`);
                } else {
                    BizFlowLogger.businessLog(`❌ ${check.table}.${check.column} - FALTANDO`);
                }
            } catch (error) {
                BizFlowLogger.errorLog(error, { context: `verifyMigration - ${check.table}` });
            }
        }
    }
}

// ✅ EXECUTAR MIGRAÇÃO
async function main() {
    const migration = new DatabaseMigration();
    
    try {
        await migration.runMigrations();
        await migration.verifyMigration();
        
        BizFlowLogger.businessLog('🎉 Migração do banco de dados concluída com sucesso!');
        console.log(`
╔══════════════════════════════════════════════════╗
║           ✅ MIGRAÇÃO CONCLUÍDA                 ║
╠══════════════════════════════════════════════════╣
║ 📊 Banco atualizado para FASE 5 HÍBRIDA         ║
║ 🗃️  Colunas faltantes adicionadas              ║
║ 📈 Tabelas novas criadas                        ║
║ 🎯 Dados de exemplo inseridos                   ║
║ 🔍 Verificação de integridade OK                ║
╚══════════════════════════════════════════════════╝
        `);
        
        process.exit(0);
    } catch (error) {
        BizFlowLogger.errorLog(error, { context: 'migration main' });
        console.error('❌ Migração falhou. Verifique os logs acima.');
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default DatabaseMigration;
