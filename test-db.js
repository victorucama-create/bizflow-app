// test-db.js - Teste de Conexão com Banco de Dados FASE 5.1
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Configurar variáveis de ambiente
dotenv.config();

console.log('🔍 BIZFLOW FASE 5.1 - TESTE DE CONEXÃO COM BANCO DE DADOS');
console.log('=' .repeat(60));

// Verificar se DATABASE_URL está configurada
if (!process.env.DATABASE_URL) {
  console.log('❌ ERRO: DATABASE_URL não está configurada!');
  console.log('💡 Configure a variável DATABASE_URL no Render.com');
  console.log('💡 Exemplo: postgresql://user:pass@host:port/database');
  process.exit(1);
}

console.log('✅ DATABASE_URL configurada');
console.log('📦 String de conexão:', process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@'));

// Configurar pool de conexão
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});

async function testConnection() {
  let client;
  try {
    console.log('\n🔄 Tentando conectar ao PostgreSQL...');
    
    // Testar conexão básica
    client = await pool.connect();
    console.log('✅ Conexão estabelecida com sucesso!');
    
    // Testar versão do PostgreSQL
    console.log('\n📊 Testando versão do PostgreSQL...');
    const versionResult = await client.query('SELECT version()');
    console.log('✅ Versão:', versionResult.rows[0].version.split(',')[0]);
    
    // Testar consulta básica
    console.log('\n🔍 Testando consulta básica...');
    const testResult = await client.query('SELECT 1 + 1 as result');
    console.log('✅ Consulta básica:', testResult.rows[0].result);
    
    // Listar tabelas
    console.log('\n📋 Listando tabelas existentes...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log('✅ Tabelas encontradas:');
      tablesResult.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.table_name}`);
      });
    } else {
      console.log('ℹ️  Nenhuma tabela encontrada no schema public');
    }
    
    // Testar tabelas específicas do BizFlow
    console.log('\n🏢 Testando tabelas do BizFlow...');
    const bizflowTables = ['empresas', 'users', 'products', 'sales', 'user_sessions'];
    
    for (const table of bizflowTables) {
      try {
        const tableCheck = await client.query(`
          SELECT COUNT(*) as count FROM ${table}
        `);
        console.log(`✅ ${table}: ${tableCheck.rows[0].count} registros`);
      } catch (error) {
        console.log(`❌ ${table}: Tabela não existe ou erro de acesso`);
      }
    }
    
    // Testar performance
    console.log('\n⚡ Testando performance...');
    const startTime = Date.now();
    await client.query('SELECT * FROM information_schema.tables LIMIT 5');
    const queryTime = Date.now() - startTime;
    console.log(`✅ Tempo de consulta: ${queryTime}ms`);
    
    // Verificar conexões ativas
    console.log('\n🔗 Verificando conexões ativas...');
    const connectionsResult = await client.query(`
      SELECT COUNT(*) as active_connections 
      FROM pg_stat_activity 
      WHERE state = 'active'
    `);
    console.log(`✅ Conexões ativas: ${connectionsResult.rows[0].active_connections}`);
    
    console.log('\n🎉 TODOS OS TESTES CONCLUÍDOS COM SUCESSO!');
    console.log('✅ O banco de dados está funcionando perfeitamente!');
    
  } catch (error) {
    console.log('\n💥 ERRO NA CONEXÃO COM O BANCO:');
    console.log('❌ Mensagem:', error.message);
    console.log('❌ Código:', error.code);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 SOLUÇÃO: Verifique:');
      console.log('   • Se o servidor PostgreSQL está rodando');
      console.log('   • Se a DATABASE_URL está correta');
      console.log('   • Se as credenciais estão corretas');
      console.log('   • Se o firewall permite a conexão');
    } else if (error.code === '28P01') {
      console.log('\n💡 SOLUÇÃO: Senha incorreta - verifique a DATABASE_URL');
    } else if (error.code === '3D000') {
      console.log('\n💡 SOLUÇÃO: Banco de dados não existe - verifique o nome do banco');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 SOLUÇÃO: Host não encontrado - verifique o host na DATABASE_URL');
    }
    
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Executar teste
testConnection().catch(error => {
  console.log('❌ Erro inesperado:', error);
  process.exit(1);
});
