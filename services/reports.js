// services/reports.js - SISTEMA BIZFLOW FASE 5 COMPLETA
import { queryWithMetrics, redis, logger } from '../core/server.js';

class ReportsService {
  // ✅ RELATÓRIO DE VENDAS POR PERÍODO
  async getSalesReport(empresa_id, periodo = '7', useCache = true) {
    try {
      const cacheKey = `report:sales:${empresa_id}:${periodo}`;
      
      if (useCache) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger.cacheLog('Relatório de vendas do cache', true, { empresa_id, periodo });
          return JSON.parse(cached);
        }
      }

      const dias = parseInt(periodo);
      
      // Dados detalhados de vendas
      const salesData = await queryWithMetrics(
        `SELECT 
          DATE(s.sale_date) as data,
          COUNT(*) as total_vendas,
          SUM(s.total_amount) as total_valor,
          AVG(s.total_amount) as valor_medio,
          s.payment_method,
          COUNT(DISTINCT s.id) as vendas_por_dia
        FROM sales s
        WHERE s.empresa_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'
        GROUP BY DATE(s.sale_date), s.payment_method
        ORDER BY data DESC, s.payment_method`,
        [empresa_id],
        'select',
        'sales'
      );

      // Estatísticas resumidas
      const statsData = await queryWithMetrics(
        `SELECT 
          COUNT(*) as total_vendas_periodo,
          SUM(s.total_amount) as total_faturado,
          AVG(s.total_amount) as ticket_medio,
          MAX(s.total_amount) as maior_venda,
          MIN(s.total_amount) as menor_venda,
          COUNT(DISTINCT DATE(s.sale_date)) as dias_com_venda
        FROM sales s
        WHERE s.empresa_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'`,
        [empresa_id],
        'select',
        'sales'
      );

      // Métodos de pagamento
      const paymentMethods = await queryWithMetrics(
        `SELECT 
          payment_method,
          COUNT(*) as quantidade,
          SUM(total_amount) as total,
          ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM sales WHERE empresa_id = $1 AND sale_date >= CURRENT_DATE - INTERVAL '${dias} days')), 2) as percentual
        FROM sales 
        WHERE empresa_id = $1 AND sale_date >= CURRENT_DATE - INTERVAL '${dias} days'
        GROUP BY payment_method
        ORDER BY total DESC`,
        [empresa_id],
        'select',
        'sales'
      );

      const report = {
        periodo: `${dias} dias`,
        data_inicio: new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        data_fim: new Date().toISOString().split('T')[0],
        detalhes: salesData.rows,
        estatisticas: statsData.rows[0] || {
          total_vendas_periodo: 0,
          total_faturado: 0,
          ticket_medio: 0,
          maior_venda: 0,
          menor_venda: 0,
          dias_com_venda: 0
        },
        metodos_pagamento: paymentMethods.rows,
        gerado_em: new Date().toISOString()
      };

      // Salvar no cache por 10 minutos
      if (useCache) {
        await redis.setex(cacheKey, 600, JSON.stringify(report));
      }

      logger.businessLog('Relatório de vendas gerado', {
        empresaId: empresa_id,
        periodo: periodo,
        totalVendas: report.estatisticas.total_vendas_periodo,
        totalFaturado: report.estatisticas.total_faturado
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'getSalesReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO DE ESTOQUE
  async getStockReport(empresa_id, useCache = true) {
    try {
      const cacheKey = `report:stock:${empresa_id}`;
      
      if (useCache) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger.cacheLog('Relatório de estoque do cache', true, { empresa_id });
          return JSON.parse(cached);
        }
      }

      // Produtos com status de estoque
      const productsData = await queryWithMetrics(
        `SELECT 
          p.id,
          p.name as produto,
          p.stock_quantity as quantidade,
          p.min_stock as estoque_minimo,
          p.price as preco,
          p.category as categoria,
          CASE 
            WHEN p.stock_quantity = 0 THEN 'SEM ESTOQUE'
            WHEN p.stock_quantity <= p.min_stock THEN 'CRÍTICO'
            WHEN p.stock_quantity <= p.min_stock * 2 THEN 'ALERTA' 
            ELSE 'NORMAL'
          END as status_estoque,
          (p.stock_quantity * p.price) as valor_total_estoque
        FROM products p
        WHERE p.empresa_id = $1 AND p.is_active = true
        ORDER BY 
          CASE 
            WHEN p.stock_quantity = 0 THEN 1
            WHEN p.stock_quantity <= p.min_stock THEN 2
            WHEN p.stock_quantity <= p.min_stock * 2 THEN 3
            ELSE 4
          END,
          p.stock_quantity ASC`,
        [empresa_id],
        'select',
        'products'
      );

      // Estatísticas do estoque
      const statsData = await queryWithMetrics(
        `SELECT 
          COUNT(*) as total_produtos,
          SUM(p.stock_quantity) as total_itens_estoque,
          SUM(p.stock_quantity * p.price) as valor_total_estoque,
          AVG(p.price) as preco_medio,
          COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END) as produtos_sem_estoque,
          COUNT(CASE WHEN p.stock_quantity <= p.min_stock AND p.stock_quantity > 0 THEN 1 END) as produtos_estoque_baixo,
          COUNT(CASE WHEN p.stock_quantity > p.min_stock * 2 THEN 1 END) as produtos_estoque_adequado
        FROM products p
        WHERE p.empresa_id = $1 AND p.is_active = true`,
        [empresa_id],
        'select',
        'products'
      );

      const report = {
        produtos: productsData.rows,
        estatisticas: statsData.rows[0] || {
          total_produtos: 0,
          total_itens_estoque: 0,
          valor_total_estoque: 0,
          preco_medio: 0,
          produtos_sem_estoque: 0,
          produtos_estoque_baixo: 0,
          produtos_estoque_adequado: 0
        },
        gerado_em: new Date().toISOString()
      };

      // Salvar no cache por 15 minutos
      if (useCache) {
        await redis.setex(cacheKey, 900, JSON.stringify(report));
      }

      logger.businessLog('Relatório de estoque gerado', {
        empresaId: empresa_id,
        totalProdutos: report.estatisticas.total_produtos,
        valorTotalEstoque: report.estatisticas.valor_total_estoque
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'getStockReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO FINANCEIRO
  async getFinancialReport(empresa_id, mes = null, ano = null, useCache = true) {
    try {
      const mesAtual = mes || new Date().getMonth() + 1;
      const anoAtual = ano || new Date().getFullYear();
      
      const cacheKey = `report:financial:${empresa_id}:${mesAtual}:${anoAtual}`;
      
      if (useCache) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger.cacheLog('Relatório financeiro do cache', true, { empresa_id, mesAtual, anoAtual });
          return JSON.parse(cached);
        }
      }

      // Receitas e Despesas
      const financialData = await queryWithMetrics(
        `SELECT 
          type as tipo,
          status,
          COUNT(*) as total_contas,
          SUM(amount) as total_valor,
          AVG(amount) as valor_medio
        FROM financial_accounts 
        WHERE empresa_id = $1 AND EXTRACT(MONTH FROM due_date) = $2 
          AND EXTRACT(YEAR FROM due_date) = $3
        GROUP BY type, status
        ORDER BY type, status`,
        [empresa_id, mesAtual, anoAtual],
        'select',
        'financial_accounts'
      );

      // Vendas do período
      const salesData = await queryWithMetrics(
        `SELECT 
          SUM(total_amount) as total_vendas,
          COUNT(*) as total_vendas_quantidade,
          AVG(total_amount) as ticket_medio,
          COUNT(DISTINCT DATE(sale_date)) as dias_com_venda
        FROM sales 
        WHERE empresa_id = $1 AND EXTRACT(MONTH FROM sale_date) = $2 
          AND EXTRACT(YEAR FROM sale_date) = $3`,
        [empresa_id, mesAtual, anoAtual],
        'select',
        'sales'
      );

      // Contas a receber/pagar
      const accountsSummary = await queryWithMetrics(
        `SELECT 
          type,
          status,
          COUNT(*) as quantidade,
          SUM(amount) as valor_total
        FROM financial_accounts 
        WHERE empresa_id = $1 AND EXTRACT(MONTH FROM due_date) = $2 
          AND EXTRACT(YEAR FROM due_date) = $3
        GROUP BY type, status`,
        [empresa_id, mesAtual, anoAtual],
        'select',
        'financial_accounts'
      );

      const report = {
        periodo: `${mesAtual}/${anoAtual}`,
        financeiro: financialData.rows,
        vendas: salesData.rows[0] || { 
          total_vendas: 0, 
          total_vendas_quantidade: 0, 
          ticket_medio: 0,
          dias_com_venda: 0
        },
        resumo_contas: accountsSummary.rows,
        saldo_previsto: this.calculateProjectedBalance(financialData.rows),
        gerado_em: new Date().toISOString()
      };

      // Salvar no cache por 30 minutos
      if (useCache) {
        await redis.setex(cacheKey, 1800, JSON.stringify(report));
      }

      logger.businessLog('Relatório financeiro gerado', {
        empresaId: empresa_id,
        periodo: report.periodo,
        totalVendas: report.vendas.total_vendas
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'getFinancialReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO DE PRODUTOS MAIS VENDIDOS
  async getTopProductsReport(empresa_id, limite = 10, useCache = true) {
    try {
      const cacheKey = `report:topproducts:${empresa_id}:${limite}`;
      
      if (useCache) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger.cacheLog('Relatório de top produtos do cache', true, { empresa_id, limite });
          return JSON.parse(cached);
        }
      }

      const result = await queryWithMetrics(
        `SELECT 
          p.name as produto,
          p.category as categoria,
          SUM(si.quantity) as total_vendido,
          SUM(si.total_price) as total_faturado,
          COUNT(DISTINCT si.sale_id) as vezes_vendido,
          AVG(si.quantity) as media_por_venda,
          ROUND((SUM(si.quantity) * 100.0 / (SELECT SUM(quantity) FROM sale_items si2 JOIN sales s2 ON si2.sale_id = s2.id WHERE s2.empresa_id = $1)), 2) as percentual_total
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.empresa_id = $1
        GROUP BY p.id, p.name, p.category
        ORDER BY total_vendido DESC
        LIMIT $2`,
        [empresa_id, limite],
        'select',
        'sale_items'
      );

      const report = {
        produtos: result.rows,
        limite: limite,
        gerado_em: new Date().toISOString()
      };

      // Salvar no cache por 1 hora
      if (useCache) {
        await redis.setex(cacheKey, 3600, JSON.stringify(report));
      }

      logger.businessLog('Relatório de top produtos gerado', {
        empresaId: empresa_id,
        limite: limite,
        totalProdutos: result.rows.length
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'getTopProductsReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO DE PERFORMANCE DO SISTEMA
  async getSystemPerformanceReport() {
    try {
      const cacheKey = 'report:system:performance';
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Métricas do banco de dados
      const dbMetrics = await queryWithMetrics(
        `SELECT 
          COUNT(*) as total_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_transaction
        FROM pg_stat_activity`,
        [],
        'select',
        'pg_stat_activity'
      );

      // Estatísticas de tabelas
      const tableStats = await queryWithMetrics(
        `SELECT 
          schemaname,
          relname as table_name,
          n_live_tup as row_count,
          n_dead_tup as dead_rows,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables 
        ORDER BY n_live_tup DESC
        LIMIT 10`,
        [],
        'select',
        'pg_stat_user_tables'
      );

      // Informações do Redis
      const redisInfo = await redis.info();
      const redisStats = this.parseRedisInfo(redisInfo);

      const report = {
        database: {
          connections: dbMetrics.rows[0],
          table_statistics: tableStats.rows
        },
        cache: redisStats,
        system: {
          uptime: process.uptime(),
          memory_usage: process.memoryUsage(),
          node_version: process.version,
          timestamp: new Date().toISOString()
        },
        gerado_em: new Date().toISOString()
      };

      // Salvar no cache por 5 minutos
      await redis.setex(cacheKey, 300, JSON.stringify(report));

      logger.performanceLog('Relatório de performance do sistema gerado', 0, {
        activeConnections: report.database.connections.active_connections,
        redisUsedMemory: report.cache.used_memory_human
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'getSystemPerformanceReport' });
      throw error;
    }
  }

  // ✅ CALCULAR SALDO PREVISTO
  calculateProjectedBalance(financialData) {
    let receitas = 0;
    let despesas = 0;

    financialData.forEach(item => {
      if (item.tipo === 'receita') {
        if (item.status === 'recebido') {
          receitas += parseFloat(item.total_valor);
        }
      } else if (item.tipo === 'despesa') {
        if (item.status === 'pago') {
          despesas += parseFloat(item.total_valor);
        }
      }
    });

    return {
      receitas: receitas,
      despesas: despesas,
      saldo: receitas - despesas
    };
  }

  // ✅ PARSER DE INFORMAÇÕES DO REDIS
  parseRedisInfo(infoString) {
    const lines = infoString.split('\r\n');
    const stats = {};
    
    lines.forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    });

    return {
      connected_clients: stats.connected_clients,
      used_memory_human: stats.used_memory_human,
      used_memory_peak_human: stats.used_memory_peak_human,
      keyspace_hits: stats.keyspace_hits,
      keyspace_misses: stats.keyspace_misses,
      hit_rate: stats.keyspace_hits && stats.keyspace_misses ? 
        (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses)) * 100).toFixed(2) + '%' : '0%'
    };
  }

  // ✅ INVALIDAR CACHE DE RELATÓRIOS
  async invalidateReportsCache(empresa_id) {
    try {
      const patterns = [
        `report:sales:${empresa_id}:*`,
        `report:stock:${empresa_id}`,
        `report:financial:${empresa_id}:*`,
        `report:topproducts:${empresa_id}:*`
      ];

      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }

      logger.cacheLog('Cache de relatórios invalidado', false, {
        empresaId: empresa_id,
        patterns: patterns.length
      });

    } catch (error) {
      logger.errorLog(error, { context: 'invalidateReportsCache' });
    }
  }
}

export default new ReportsService();
