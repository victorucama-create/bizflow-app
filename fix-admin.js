// fix-admin.js - Correção do usuário admin
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixAdminUser() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🛠️  Verificando e corrigindo usuário admin...');
    
    // Verificar se o usuário admin existe
    const checkResult = await client.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1', 
      ['admin']
    );
    
    if (checkResult.rows.length === 0) {
      console.log('❌ Usuário admin não encontrado. Criando...');
      
      // Criar usuário admin com senha correta
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await client.query(
        `INSERT INTO users (username, email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        ['admin', 'admin@bizflow.com', passwordHash, 'Administrador do Sistema', 'admin']
      );
      
      console.log('✅ Usuário admin criado com sucesso!');
    } else {
      console.log('✅ Usuário admin encontrado. Verificando senha...');
      
      const user = checkResult.rows[0];
      const testPassword = 'admin123';
      const isPasswordValid = await bcrypt.compare(testPassword, user.password_hash);
      
      if (!isPasswordValid) {
        console.log('🔄 Senha incorreta. Atualizando hash da senha...');
        
        const newPasswordHash = await bcrypt.hash('admin123', 10);
        await client.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [newPasswordHash, user.id]
        );
        
        console.log('✅ Senha do admin corrigida!');
      } else {
        console.log('✅ Senha do admin está correta!');
      }
    }
    
    await client.query('COMMIT');
    console.log('🎉 Verificação do admin concluída com sucesso!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao corrigir usuário admin:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar a correção
fixAdminUser();
