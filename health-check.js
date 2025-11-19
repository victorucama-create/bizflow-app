// health-check.js - Sistema de Monitoramento FASE 5.1
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Configurar variáveis de ambiente
dotenv.config();

// Configurar pool de conexão
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function healthCheck() {
  const startTime = Date.now();
  const healthReport = {
    status: 'UNKNOWN',
    timestamp: new Date().toISOString(),
    version: '5.1.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {},
    performance: {},
    metrics: {}
  };

  try {
    // Teste de conexão com o banco
    const dbStartTime = Date.now();
    await pool.query('SELECT 1');
    healthReport.checks.database = {
      status: 'HEALTHY',
      response_time: Date.now() - dbStartTime
    };

    // Coletar métricas do banco
    const metricsStartTime = Date.now();
    const [connectionsResult, tablesResult, performanceResult] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
        FROM pg_stat_activity
      `),
      pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM empresas WHERE is_active = true) as total_empresas,
          (SELECT COUNT(*) FROM users WHERE is_active = true) as total_usuarios,
          (SELECT COUNT(*) FROM products WHERE is_active = true) as total_produtos,
          (SELECT COUNT(*) FROM sales) as total_vendas,
          (SELECT COALESCE(SUM(total_amount), 0) FROM sales) as total_faturado
      `),
      pool.query(`
        SELECT 
          xact_commit + xact_rollback as total_transactions,
          blks_read + blks_hit as total_blocks,
          tup_inserted + tup_updated + tup_deleted as total_operations
        FROM pg_stat_database 
        WHERE datname = current_database()
      `)
    ]);

    healthReport.metrics.database = {
      connections: {
        total: parseInt(connectionsResult.rows[0].total_connections),
        active: parseInt(connectionsResult.rows[0].active_connections)
      },
      business: tablesResult.rows[0],
      performance: performanceResult.rows[0] || {}
    };

    healthReport.checks.metrics = {
      status: 'HEALTHY',
      response_time: Date.now() - metricsStartTime
    };

    // Verificar tabelas críticas
    const criticalTables = ['empresas', 'users', 'products', 'sales', 'user_sessions'];
    const tablesCheck = {};
    
    for (const table of criticalTables) {
      try {
        await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
        tablesCheck[table] = 'ACCESSIBLE';
      } catch (error) {
        tablesCheck[table] = 'INACCESSIBLE';
      }
    }

    healthReport.checks.tables = {
      status: Object.values(tablesCheck).every(status => status === 'ACCESSIBLE') ? 'HEALTHY' : 'DEGRADED',
      details: tablesCheck
    };

    // Status geral
    const allHealthy = Object.values(healthReport.checks).every(check => check.status === 'HEALTHY');
    healthReport.status = allHealthy ? 'HEALTHY' : 'DEGRADED';
    
    // Performance
    healthReport.performance = {
      total_response_time: Date.now() - startTime,
      environment: process.env.NODE_ENV || 'development',
      node_version: process.version,
      memory_usage: process.memoryUsage()
    };

    console.log('✅ Health Check completed:', healthReport.status);
    return healthReport;

  } catch (error) {
    console.error('❌ Health Check failed:', error.message);
    
    healthReport.status = 'UNHEALTHY';
    healthReport.checks.database = {
      status: 'UNHEALTHY',
      error: error.message
    };
    
    healthReport.error = {
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };

    return healthReport;
  } finally {
    await pool.end();
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  healthCheck().then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'HEALTHY' ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default healthCheck;
