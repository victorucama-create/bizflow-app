// deploy-fix.js - Correção para deploy no Render
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function deployFix() {
  console.log('🚀 Iniciando correção de deploy...');
  
  try {
    // Testar conexão com o banco
    await pool.query('SELECT 1');
    console.log('✅ Conexão com banco OK');
    
    // Criar usuário admin se não existir
    const result = await pool.query(
      'SELECT id FROM users WHERE username = $1', 
      ['admin']
    );
    
    if (result.rows.length === 0) {
      console.log('👤 Criando usuário admin...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, empresa_id, filial_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['admin', 'admin@bizflow.com', passwordHash, 'Administrador', 'admin', 1, 1]
      );
      console.log('✅ Usuário admin criado!');
    } else {
      console.log('✅ Usuário admin já existe');
    }
    
    console.log('🎉 Correção de deploy concluída!');
    
  } catch (error) {
    console.error('❌ Erro na correção:', error);
  } finally {
    await pool.end();
  }
}

deployFix();
