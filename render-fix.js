// render-fix.js - Correção específica para Render.com
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function renderFix() {
  console.log('🚀 INICIANDO CORREÇÃO PARA RENDER.COM...');
  
  try {
    // 1. Testar conexão com banco
    console.log('🔌 Testando conexão com o banco...');
    await pool.query('SELECT 1');
    console.log('✅ Conexão com banco: OK');
    
    // 2. Verificar se tabela users existe
    console.log('📊 Verificando tabela users...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ Tabela users não existe! Criando...');
      
      await pool.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          full_name VARCHAR(100) NOT NULL,
          role VARCHAR(20) DEFAULT 'user',
          empresa_id INTEGER DEFAULT 1,
          filial_id INTEGER DEFAULT 1,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ Tabela users criada!');
    } else {
      console.log('✅ Tabela users: OK');
    }
    
    // 3. Verificar/Criar usuário admin
    console.log('👤 Verificando usuário admin...');
    const adminCheck = await pool.query(
      'SELECT id, username FROM users WHERE username = $1', 
      ['admin']
    );
    
    if (adminCheck.rows.length === 0) {
      console.log('❌ Usuário admin não existe! Criando...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, empresa_id, filial_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin', 1, 1]
      );
      console.log('✅ Usuário admin criado!');
    } else {
      console.log('✅ Usuário admin: OK');
    }
    
    // 4. Listar todos os usuários (para debug)
    console.log('📋 Listando todos os usuários...');
    const allUsers = await pool.query('SELECT id, username, email FROM users');
    console.log('👥 Usuários no sistema:', allUsers.rows);
    
    console.log('🎉 CORREÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('🔑 Use: admin / admin123 para fazer login');
    
  } catch (error) {
    console.error('💥 ERRO NA CORREÇÃO:', error);
    console.error('📝 Detalhes:', error.message);
  } finally {
    await pool.end();
    console.log('🔚 Conexão com banco fechada.');
  }
}

renderFix();
