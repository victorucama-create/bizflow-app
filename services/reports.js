// services/reports.js - SISTEMA BIZFLOW FASE 5 COMPLETA - VERSÃO COMPLETA
import { queryWithMetrics, logger } from '../core/server.js';
import CacheService from './cache-service.js';

class ReportsService {
  // ✅ RELATÓRIO DE VENDAS POR PERÍODO COM CACHE SERVICE - COMPLETO
  async getSalesReport(empresa_id, periodo = '7', useCache = true) {
    try {
      const cacheKey = `report:sales:${empresa_id}:${periodo}`;
      
      if (useCache) {
        // ✅ TENTAR CACHE SERVICE PRIMEIRO
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          logger.cacheLog('Relatório de vendas do cache', true, { empresa_id, periodo });
          return cached;
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

      // Vendas por categoria de produto
      const salesByCategory = await queryWithMetrics(
        `SELECT 
          p.category as categoria,
          SUM(si.quantity) as total_itens,
          SUM(si.total_price) as total_valor,
          COUNT(DISTINCT s.id) as total_vendas
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.empresa_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'
        GROUP BY p.category
        ORDER BY total_valor DESC`,
        [empresa_id],
        'select',
        'sale_items'
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
        vendas_por_categoria: salesByCategory.rows,
        tendencias: this.analyzeSalesTrends(salesData.rows),
        gerado_em: new Date().toISOString()
      };

      // ✅ SALVAR NO CACHE SERVICE
      if (useCache) {
        await CacheService.set(cacheKey, report, 600); // 10 minutos
      }

      logger.businessLog('Relatório de vendas gerado', {
        empresaId: empresa_id,
        periodo: periodo,
        totalVendas: report.estatisticas.total_vendas_periodo,
        totalFaturado: report.estatisticas.total_faturado
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'ReportsService.getSalesReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO DE ESTOQUE COM CACHE SERVICE - COMPLETO
  async getStockReport(empresa_id, useCache = true) {
    try {
      const cacheKey = `report:stock:${empresa_id}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          logger.cacheLog('Relatório de estoque do cache', true, { empresa_id });
          return cached;
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
          (p.stock_quantity * p.price) as valor_total_estoque,
          p.created_at,
          p.updated_at
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
          COUNT(CASE WHEN p.stock_quantity > p.min_stock * 2 THEN 1 END) as produtos_estoque_adequado,
          MAX(p.stock_quantity) as maior_estoque,
          MIN(p.stock_quantity) as menor_estoque
        FROM products p
        WHERE p.empresa_id = $1 AND p.is_active = true`,
        [empresa_id],
        'select',
        'products'
      );

      // Produtos que precisam de reposição
      const needRestock = await queryWithMetrics(
        `SELECT 
          name as produto,
          stock_quantity as quantidade_atual,
          min_stock as estoque_minimo,
          (min_stock - stock_quantity) as quantidade_repor,
          price as preco,
          category as categoria
        FROM products 
        WHERE empresa_id = $1 AND is_active = true AND stock_quantity <= min_stock
        ORDER BY (min_stock - stock_quantity) DESC
        LIMIT 20`,
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
          produtos_estoque_adequado: 0,
          maior_estoque: 0,
          menor_estoque: 0
        },
        reposicao_necessaria: needRestock.rows,
        alertas: this.generateStockAlerts(productsData.rows),
        gerado_em: new Date().toISOString()
      };

      // ✅ SALVAR NO CACHE SERVICE
      if (useCache) {
        await CacheService.set(cacheKey, report, 900); // 15 minutos
      }

      logger.businessLog('Relatório de estoque gerado', {
        empresaId: empresa_id,
        totalProdutos: report.estatisticas.total_produtos,
        valorTotalEstoque: report.estatisticas.valor_total_estoque,
        produtosCriticos: report.estatisticas.produtos_estoque_baixo + report.estatisticas.produtos_sem_estoque
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'ReportsService.getStockReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO FINANCEIRO COM CACHE SERVICE - COMPLETO
  async getFinancialReport(empresa_id, mes = null, ano = null, useCache = true) {
    try {
      const mesAtual = mes || new Date().getMonth() + 1;
      const anoAtual = ano || new Date().getFullYear();
      
      const cacheKey = `report:financial:${empresa_id}:${mesAtual}:${anoAtual}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          logger.cacheLog('Relatório financeiro do cache', true, { empresa_id, mesAtual, anoAtual });
          return cached;
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
          COUNT(DISTINCT DATE(sale_date)) as dias_com_venda,
          MAX(total_amount) as maior_venda,
          MIN(total_amount) as menor_venda
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

      // Fluxo de caixa mensal
      const cashFlow = await queryWithMetrics(
        `SELECT 
          EXTRACT(DAY FROM due_date) as dia,
          type as tipo,
          SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) as receitas,
          SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) as despesas
        FROM financial_accounts 
        WHERE empresa_id = $1 AND EXTRACT(MONTH FROM due_date) = $2 
          AND EXTRACT(YEAR FROM due_date) = $3
        GROUP BY EXTRACT(DAY FROM due_date), type
        ORDER BY dia`,
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
          dias_com_venda: 0,
          maior_venda: 0,
          menor_venda: 0
        },
        resumo_contas: accountsSummary.rows,
        fluxo_caixa: this.processCashFlow(cashFlow.rows),
        saldo_previsto: this.calculateProjectedBalance(financialData.rows),
        indicadores: this.calculateFinancialIndicators(financialData.rows, salesData.rows[0]),
        gerado_em: new Date().toISOString()
      };

      // ✅ SALVAR NO CACHE SERVICE
      if (useCache) {
        await CacheService.set(cacheKey, report, 1800); // 30 minutos
      }

      logger.businessLog('Relatório financeiro gerado', {
        empresaId: empresa_id,
        periodo: report.periodo,
        totalVendas: report.vendas.total_vendas,
        saldoPrevisto: report.saldo_previsto.saldo
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'ReportsService.getFinancialReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO DE PRODUTOS MAIS VENDIDOS COM CACHE SERVICE - COMPLETO
  async getTopProductsReport(empresa_id, limite = 10, periodo = '30', useCache = true) {
    try {
      const cacheKey = `report:topproducts:${empresa_id}:${limite}:${periodo}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          logger.cacheLog('Relatório de top produtos do cache', true, { empresa_id, limite, periodo });
          return cached;
        }
      }

      const dias = parseInt(periodo);

      const result = await queryWithMetrics(
        `SELECT 
          p.name as produto,
          p.category as categoria,
          SUM(si.quantity) as total_vendido,
          SUM(si.total_price) as total_faturado,
          COUNT(DISTINCT si.sale_id) as vezes_vendido,
          AVG(si.quantity) as media_por_venda,
          ROUND((SUM(si.quantity) * 100.0 / (SELECT SUM(quantity) FROM sale_items si2 JOIN sales s2 ON si2.sale_id = s2.id WHERE s2.empresa_id = $1 AND s2.sale_date >= CURRENT_DATE - INTERVAL '${dias} days')), 2) as percentual_total,
          MAX(si.quantity) as maior_venda,
          MIN(si.quantity) as menor_venda
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.empresa_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'
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
        periodo: `${dias} dias`,
        estatisticas: this.calculateProductsStats(result.rows),
        gerado_em: new Date().toISOString()
      };

      // ✅ SALVAR NO CACHE SERVICE
      if (useCache) {
        await CacheService.set(cacheKey, report, 3600); // 1 hora
      }

      logger.businessLog('Relatório de top produtos gerado', {
        empresaId: empresa_id,
        limite: limite,
        periodo: periodo,
        totalProdutos: result.rows.length
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'ReportsService.getTopProductsReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO DE PERFORMANCE DO SISTEMA - COMPLETO
  async getSystemPerformanceReport() {
    try {
      const cacheKey = 'report:system:performance';
      const cached = await CacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Métricas do banco de dados
      const dbMetrics = await queryWithMetrics(
        `SELECT 
          COUNT(*) as total_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_transaction,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE wait_event_type IS NOT NULL) as waiting_connections
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

      // Performance de queries
      const queryStats = await queryWithMetrics(
        `SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows
        FROM pg_stat_statements 
        ORDER BY total_time DESC
        LIMIT 10`,
        [],
        'select',
        'pg_stat_statements'
      );

      // Informações do Cache Service
      const cacheStatus = await CacheService.status();

      const report = {
        database: {
          connections: dbMetrics.rows[0],
          table_statistics: tableStats.rows,
          query_performance: queryStats.rows,
          health: this.assessDatabaseHealth(dbMetrics.rows[0], tableStats.rows)
        },
        cache: cacheStatus,
        system: {
          uptime: process.uptime(),
          memory_usage: process.memoryUsage(),
          node_version: process.version,
          platform: process.platform,
          arch: process.arch
        },
        performance: {
          assessment: this.assessSystemPerformance(dbMetrics.rows[0], cacheStatus),
          recommendations: this.generatePerformanceRecommendations(dbMetrics.rows[0], tableStats.rows)
        },
        gerado_em: new Date().toISOString()
      };

      // ✅ SALVAR NO CACHE SERVICE
      await CacheService.set(cacheKey, report, 300); // 5 minutos

      logger.performanceLog('Relatório de performance do sistema gerado', 0, {
        activeConnections: report.database.connections.active_connections,
        cacheType: report.cache.type,
        memoryUsage: report.system.memory_usage.rss
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'ReportsService.getSystemPerformanceReport' });
      throw error;
    }
  }

  // ✅ RELATÓRIO DE CLIENTES - COMPLETO
  async getCustomersReport(empresa_id, periodo = '30') {
    try {
      const cacheKey = `report:customers:${empresa_id}:${periodo}`;
      const cached = await CacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const dias = parseInt(periodo);

      // Clientes que mais compram
      const topCustomers = await queryWithMetrics(
        `SELECT 
          u.full_name as cliente,
          u.email,
          COUNT(s.id) as total_compras,
          SUM(s.total_amount) as total_gasto,
          AVG(s.total_amount) as ticket_medio,
          MAX(s.sale_date) as ultima_compra
        FROM sales s
        JOIN users u ON s.empresa_id = u.empresa_id
        WHERE s.empresa_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'
        GROUP BY u.id, u.full_name, u.email
        ORDER BY total_gasto DESC
        LIMIT 20`,
        [empresa_id],
        'select',
        'sales'
      );

      // Frequência de compras
      const purchaseFrequency = await queryWithMetrics(
        `SELECT 
          COUNT(DISTINCT DATE(sale_date)) as dias_com_compra,
          COUNT(*) as total_vendas,
          ROUND(COUNT(*)::decimal / COUNT(DISTINCT DATE(sale_date)), 2) as media_vendas_por_dia
        FROM sales 
        WHERE empresa_id = $1 AND sale_date >= CURRENT_DATE - INTERVAL '${dias} days'`,
        [empresa_id],
        'select',
        'sales'
      );

      const report = {
        periodo: `${dias} dias`,
        top_clientes: topCustomers.rows,
        frequencia_compras: purchaseFrequency.rows[0] || {
          dias_com_compra: 0,
          total_vendas: 0,
          media_vendas_por_dia: 0
        },
        analise_clientes: this.analyzeCustomerBehavior(topCustomers.rows),
        gerado_em: new Date().toISOString()
      };

      // ✅ SALVAR NO CACHE SERVICE
      await CacheService.set(cacheKey, report, 1800); // 30 minutos

      logger.businessLog('Relatório de clientes gerado', {
        empresaId: empresa_id,
        periodo: periodo,
        totalClientes: topCustomers.rows.length
      });

      return report;

    } catch (error) {
      logger.errorLog(error, { context: 'ReportsService.getCustomersReport' });
      throw error;
    }
  }

  // ================= MÉTODOS AUXILIARES =================

  // ✅ ANALISAR TENDÊNCIAS DE VENDAS
  analyzeSalesTrends(salesData) {
    if (!salesData || salesData.length === 0) {
      return { tendencia: 'estavel', variacao: 0 };
    }

    const recentSales = salesData.slice(0, 7); // Últimos 7 dias
    const totalSales = recentSales.reduce((sum, day) => sum + day.total_vendas, 0);
    const avgSales = totalSales / recentSales.length;

    // Calcular variação
    const firstDay = recentSales[recentSales.length - 1]?.total_vendas || 0;
    const lastDay = recentSales[0]?.total_vendas || 0;
    const variation = firstDay > 0 ? ((lastDay - firstDay) / firstDay) * 100 : 0;

    let trend = 'estavel';
    if (variation > 10) trend = 'crescendo';
    if (variation < -10) trend = 'decrescendo';

    return {
      tendencia: trend,
      variacao: Math.round(variation * 100) / 100,
      media_diaria: Math.round(avgSales * 100) / 100
    };
  }

  // ✅ GERAR ALERTAS DE ESTOQUE
  generateStockAlerts(products) {
    const alerts = [];

    products.forEach(product => {
      if (product.status_estoque === 'SEM ESTOQUE') {
        alerts.push({
          nivel: 'critico',
          mensagem: `${product.produto} está sem estoque`,
          produto: product.produto,
          acao: 'repor_urgente'
        });
      } else if (product.status_estoque === 'CRÍTICO') {
        alerts.push({
          nivel: 'alto',
          mensagem: `${product.produto} está com estoque crítico (${product.quantidade} unidades)`,
          produto: product.produto,
          acao: 'repor_breve'
        });
      }
    });

    return alerts;
  }

  // ✅ PROCESSAR FLUXO DE CAIXA
  processCashFlow(cashFlowData) {
    const dailyFlow = {};

    cashFlowData.forEach(item => {
      const day = item.dia;
      if (!dailyFlow[day]) {
        dailyFlow[day] = { dia: day, receitas: 0, despesas: 0, saldo: 0 };
      }

      if (item.tipo === 'receita') {
        dailyFlow[day].receitas += parseFloat(item.receitas) || 0;
      } else {
        dailyFlow[day].despesas += parseFloat(item.despesas) || 0;
      }

      dailyFlow[day].saldo = dailyFlow[day].receitas - dailyFlow[day].despesas;
    });

    return Object.values(dailyFlow).sort((a, b) => a.dia - b.dia);
  }

  // ✅ CALCULAR SALDO PREVISTO
  calculateProjectedBalance(financialData) {
    let receitas = 0;
    let despesas = 0;
    let receitas_pendentes = 0;
    let despesas_pendentes = 0;

    financialData.forEach(item => {
      if (item.tipo === 'receita') {
        if (item.status === 'recebido') {
          receitas += parseFloat(item.total_valor);
        } else {
          receitas_pendentes += parseFloat(item.total_valor);
        }
      } else if (item.tipo === 'despesa') {
        if (item.status === 'pago') {
          despesas += parseFloat(item.total_valor);
        } else {
          despesas_pendentes += parseFloat(item.total_valor);
        }
      }
    });

    return {
      receitas: receitas,
      despesas: despesas,
      receitas_pendentes: receitas_pendentes,
      despesas_pendentes: despesas_pendentes,
      saldo_atual: receitas - despesas,
      saldo_previsto: (receitas + receitas_pendentes) - (despesas + despesas_pendentes)
    };
  }

  // ✅ CALCULAR INDICADORES FINANCEIROS
  calculateFinancialIndicators(financialData, salesData) {
    const balance = this.calculateProjectedBalance(financialData);
    
    const receitasTotais = balance.receitas + balance.receitas_pendentes;
    const despesasTotais = balance.despesas + balance.despesas_pendentes;
    
    const lucroBruto = receitasTotais - despesasTotais;
    const margemLucro = receitasTotais > 0 ? (lucroBruto / receitasTotais) * 100 : 0;

    return {
      lucro_bruto: lucroBruto,
      margem_lucro: Math.round(margemLucro * 100) / 100,
      eficiencia: receitasTotais > 0 ? Math.round((receitasTotais / despesasTotais) * 100) / 100 : 0,
      liquidez: balance.saldo_atual > 0 ? 'positiva' : 'negativa'
    };
  }

  // ✅ CALCULAR ESTATÍSTICAS DE PRODUTOS
  calculateProductsStats(products) {
    if (!products || products.length === 0) {
      return { total_vendido: 0, total_faturado: 0, media_vendas: 0 };
    }

    const totalVendido = products.reduce((sum, p) => sum + p.total_vendido, 0);
    const totalFaturado = products.reduce((sum, p) => sum + parseFloat(p.total_faturado), 0);
    const mediaVendas = products.reduce((sum, p) => sum + p.vezes_vendido, 0) / products.length;

    return {
      total_vendido: totalVendido,
      total_faturado: Math.round(totalFaturado * 100) / 100,
      media_vendas: Math.round(mediaVendas * 100) / 100,
      produto_mais_vendido: products[0]?.produto || 'N/A'
    };
  }

  // ✅ ANALISAR COMPORTAMENTO DO CLIENTE
  analyzeCustomerBehavior(customers) {
    if (!customers || customers.length === 0) {
      return { segmentacao: [], insights: [] };
    }

    const totalGasto = customers.reduce((sum, c) => sum + parseFloat(c.total_gasto), 0);
    const avgTicket = totalGasto / customers.length;

    const segmentacao = customers.map(customer => {
      const gasto = parseFloat(customer.total_gasto);
      let segmento = 'standard';
      
      if (gasto > avgTicket * 2) segmento = 'premium';
      else if (gasto > avgTicket * 1.5) segmento = 'vip';

      return {
        cliente: customer.cliente,
        segmento: segmento,
        gasto_total: gasto
      };
    });

    const insights = [
      `Ticket médio: R$ ${Math.round(avgTicket * 100) / 100}`,
      `Total de clientes ativos: ${customers.length}`,
      `Clientes premium: ${segmentacao.filter(s => s.segmento === 'premium').length}`
    ];

    return { segmentacao, insights };
  }

  // ✅ AVALIAR SAÚDE DO BANCO
  assessDatabaseHealth(connections, tables) {
    const health = {
      status: 'healthy',
      issues: []
    };

    // Verificar conexões
    if (connections.active_connections > 15) {
      health.issues.push('Muitas conexões ativas');
    }

    if (connections.idle_in_transaction > 5) {
      health.issues.push('Conexões idle em transação');
    }

    // Verificar tabelas
    const deadRows = tables.reduce((sum, table) => sum + parseInt(table.dead_rows), 0);
    if (deadRows > 1000) {
      health.issues.push('Muitas linhas mortas - considere VACUUM');
    }

    if (health.issues.length > 0) {
      health.status = 'degraded';
    }

    return health;
  }

  // ✅ AVALIAR PERFORMANCE DO SISTEMA
  assessSystemPerformance(dbMetrics, cacheStatus) {
    const assessment = {
      database: dbMetrics.active_connections < 10 ? 'optimal' : 'monitor',
      cache: cacheStatus.connected ? 'optimal' : 'degraded',
      overall: 'optimal'
    };

    if (dbMetrics.active_connections > 15 || !cacheStatus.connected) {
      assessment.overall = 'monitor';
    }

    return assessment;
  }

  // ✅ GERAR RECOMENDAÇÕES DE PERFORMANCE
  generatePerformanceRecommendations(dbMetrics, tables) {
    const recommendations = [];

    if (dbMetrics.active_connections > 10) {
      recommendations.push('Considerar aumentar o pool de conexões do PostgreSQL');
    }

    const deadRows = tables.reduce((sum, table) => sum + parseInt(table.dead_rows), 0);
    if (deadRows > 500) {
      recommendations.push('Executar VACUUM nas tabelas com muitas linhas mortas');
    }

    if (dbMetrics.idle_in_transaction > 3) {
      recommendations.push('Monitorar transações longas');
    }

    return recommendations;
  }

  // ✅ INVALIDAR CACHE DE RELATÓRIOS COM CACHE SERVICE - COMPLETO
  async invalidateReportsCache(empresa_id) {
    try {
      const patterns = [
        `report:sales:${empresa_id}:*`,
        `report:stock:${empresa_id}`,
        `report:financial:${empresa_id}:*`,
        `report:topproducts:${empresa_id}:*`,
        `report:customers:${empresa_id}:*`
      ];

      for (const pattern of patterns) {
        await CacheService.delPattern(pattern);
      }

      logger.cacheLog('Cache de relatórios invalidado', false, {
        empresaId: empresa_id,
        patterns: patterns.length
      });

    } catch (error) {
      logger.errorLog(error, { context: 'ReportsService.invalidateReportsCache' });
    }
  }
}

export default new ReportsService();
