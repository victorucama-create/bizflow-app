// fix-login.js - Correção de emergência
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixLoginIssues() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🛠️  Corrigindo problemas de login...');
    
    // Criar usuário admin se não existir
    const adminExists = await client.query(
      'SELECT id FROM users WHERE username = $1', 
      ['admin']
    );
    
    if (adminExists.rows.length === 0) {
      console.log('❌ Criando usuário admin...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await client.query(
        `INSERT INTO users (username, email, password_hash, full_name, role, empresa_id, filial_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['admin', 'admin@bizflow.com', passwordHash, 'Administrador', 'admin', 1, 1]
      );
      console.log('✅ Usuário admin criado!');
    } else {
      console.log('✅ Usuário admin já existe');
    }
    
    await client.query('COMMIT');
    console.log('🎉 Correção concluída! Use: admin / admin123');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixLoginIssues();
