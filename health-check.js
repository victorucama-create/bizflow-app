// health-check.js - Sistema de Monitoramento FASE 5.1
import { pool } from './server.js';

async function healthCheck() {
  const startTime = Date.now();
  
  try {
    // Testar conexão com o banco
    const dbResult = await pool.query('SELECT 1 as status, NOW() as timestamp');
    
    // Testar performance básica
    const performanceResult = await pool.query(`
      SELECT 
        COUNT(*) as total_empresas,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as total_usuarios,
        (SELECT COUNT(*) FROM products WHERE is_active = true) as total_produtos
      FROM empresas 
      WHERE is_active = true
    `);

    const responseTime = Date.now() - startTime;

    return {
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      version: '5.1.0',
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: 'CONNECTED',
        response_time: dbResult.rows[0].timestamp,
        connections: performanceResult.rows[0]
      },
      performance: {
        response_time_ms: responseTime,
        metrics: performanceResult.rows[0]
      }
    };
  } catch (error) {
    console.error('❌ Health Check Failed:', error);
    
    return {
      status: 'UNHEALTHY',
      timestamp: new Date().toISOString(),
      error: error.message,
      database: {
        status: 'DISCONNECTED',
        error: error.message
      }
    };
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  healthCheck().then(result => {
    console.log('🔍 Health Check Result:', JSON.stringify(result, null, 2));
    process.exit(result.status === 'HEALTHY' ? 0 : 1);
  });
}

export default healthCheck;
