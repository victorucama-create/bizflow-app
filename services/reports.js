// services/reports.js - SISTEMA BIZFLOW FASE 5 COMPLETA HÍBRIDO
import CacheService from './cache-service.js';
import BizFlowLogger from '../utils/logger.js';

// ✅ DETECÇÃO AUTOMÁTICA DE AMBIENTE
const IS_FRONTEND_MODE = typeof window !== 'undefined' || process.env.FRONTEND_MODE === 'true';
const IS_BROWSER = typeof window !== 'undefined';

// ✅ IMPORT DINÂMICO DO BACKEND (apenas se não for frontend)
let queryWithMetrics;

if (!IS_FRONTEND_MODE) {
  import('../core/server.js').then(module => {
    queryWithMetrics = module.queryWithMetrics;
  }).catch(error => {
    BizFlowLogger.errorLog(error, { context: 'ReportsService backend import' });
  });
}

// ✅ SISTEMA DE RELATÓRIOS FRONTEND
class FrontendReports {
  constructor() {
    this.demoData = this.generateDemoData();
    this.init();
  }

  init() {
    BizFlowLogger.businessLog('Sistema de relatórios frontend inicializado');
  }

  generateDemoData() {
    const now = new Date();
    const demoData = {
      sales: [],
      products: [],
      financial: [],
      customers: []
    };

    // Gerar dados de vendas demo
    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      demoData.sales.push({
        id: i + 1,
        sale_date: date.toISOString(),
        sale_code: `V${1000 + i}`,
        total_amount: Math.random() * 1000 + 50,
        total_items: Math.floor(Math.random() * 5) + 1,
        payment_method: ['cartão', 'dinheiro', 'pix'][Math.floor(Math.random() * 3)],
        empresa_id: 1
      });
    }

    // Gerar dados de produtos demo
    const products = [
      { id: 1, name: 'Smartphone Android', category: 'Eletrônicos', price: 899.90, stock_quantity: 15, min_stock: 5 },
      { id: 2, name: 'Notebook i5', category: 'Eletrônicos', price: 1899.90, stock_quantity: 8, min_stock: 3 },
      { id: 3, name: 'Café Premium', category: 'Alimentação', price: 24.90, stock_quantity: 50, min_stock: 10 },
      { id: 4, name: 'Detergente', category: 'Limpeza', price: 3.90, stock_quantity: 100, min_stock: 20 },
      { id: 5, name: 'Água Mineral', category: 'Bebidas', price: 2.50, stock_quantity: 200, min_stock: 50 }
    ];
    demoData.products = products;

    // Gerar dados financeiros demo
    for (let i = 0; i < 20; i++) {
      demoData.financial.push({
        id: i + 1,
        name: i % 2 === 0 ? `Venda Cliente ${i + 1}` : `Despesa ${i + 1}`,
        type: i % 2 === 0 ? 'receita' : 'despesa',
        amount: i % 2 === 0 ? Math.random() * 500 + 100 : Math.random() * 200 + 50,
        due_date: new Date(now.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: ['pendente', 'recebido', 'pago'][Math.floor(Math.random() * 3)],
        empresa_id: 1
      });
    }

    // Gerar dados de clientes demo
    for (let i = 0; i < 10; i++) {
      demoData.customers.push({
        id: i + 1,
        full_name: `Cliente Demo ${i + 1}`,
        email: `cliente${i + 1}@demo.com`,
        total_compras: Math.floor(Math.random() * 10) + 1,
        total_gasto: Math.random() * 2000 + 500,
        ticket_medio: Math.random() * 200 + 50,
        ultima_compra: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    return demoData;
  }

  async getSalesReport(empresa_id, periodo = '7', useCache = true) {
    try {
      const cacheKey = `report:sales:${empresa_id}:${periodo}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          BizFlowLogger.cacheLog('Relatório de vendas frontend do cache', true, { empresa_id, periodo });
          return cached;
        }
      }

      const dias = parseInt(periodo);
      const salesData = this.demoData.sales.filter(sale => {
        const saleDate = new Date(sale.sale_date);
        const limitDate = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
        return saleDate >= limitDate;
      });

      // Processar dados para o relatório
      const detalhes = this.processSalesDetails(salesData);
      const estatisticas = this.calculateSalesStats(salesData);
      const metodos_pagamento = this.calculatePaymentMethods(salesData);
      const vendas_por_categoria = this.calculateSalesByCategory(salesData);

      const report = {
        periodo: `${dias} dias`,
        data_inicio: new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        data_fim: new Date().toISOString().split('T')[0],
        detalhes: detalhes,
        estatisticas: estatisticas,
        metodos_pagamento: metodos_pagamento,
        vendas_por_categoria: vendas_por_categoria,
        tendencias: this.analyzeSalesTrends(detalhes),
        gerado_em: new Date().toISOString(),
        modo: 'frontend'
      };

      if (useCache) {
        await CacheService.set(cacheKey, report, 600);
      }

      BizFlowLogger.businessLog('Relatório de vendas frontend gerado', {
        empresaId: empresa_id,
        periodo: periodo,
        totalVendas: report.estatisticas.total_vendas_periodo,
        totalFaturado: report.estatisticas.total_faturado
      });

      return report;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendReports.getSalesReport' });
      throw error;
    }
  }

  processSalesDetails(salesData) {
    const dailySales = {};
    
    salesData.forEach(sale => {
      const date = sale.sale_date.split('T')[0];
      if (!dailySales[date]) {
        dailySales[date] = {
          data: date,
          total_vendas: 0,
          total_valor: 0,
          valor_medio: 0,
          payment_method: 'mixed'
        };
      }
      
      dailySales[date].total_vendas += 1;
      dailySales[date].total_valor += sale.total_amount;
    });

    // Calcular valor médio
    Object.values(dailySales).forEach(day => {
      day.valor_medio = day.total_valor / day.total_vendas;
    });

    return Object.values(dailySales).sort((a, b) => new Date(b.data) - new Date(a.data));
  }

  calculateSalesStats(salesData) {
    if (salesData.length === 0) {
      return {
        total_vendas_periodo: 0,
        total_faturado: 0,
        ticket_medio: 0,
        maior_venda: 0,
        menor_venda: 0,
        dias_com_venda: 0
      };
    }

    const totalVendas = salesData.length;
    const totalFaturado = salesData.reduce((sum, sale) => sum + sale.total_amount, 0);
    const ticketMedio = totalFaturado / totalVendas;
    const maiorVenda = Math.max(...salesData.map(s => s.total_amount));
    const menorVenda = Math.min(...salesData.map(s => s.total_amount));
    const diasComVenda = new Set(salesData.map(s => s.sale_date.split('T')[0])).size;

    return {
      total_vendas_periodo: totalVendas,
      total_faturado: parseFloat(totalFaturado.toFixed(2)),
      ticket_medio: parseFloat(ticketMedio.toFixed(2)),
      maior_venda: parseFloat(maiorVenda.toFixed(2)),
      menor_venda: parseFloat(menorVenda.toFixed(2)),
      dias_com_venda: diasComVenda
    };
  }

  calculatePaymentMethods(salesData) {
    const methods = {};
    
    salesData.forEach(sale => {
      if (!methods[sale.payment_method]) {
        methods[sale.payment_method] = { quantidade: 0, total: 0 };
      }
      methods[sale.payment_method].quantidade++;
      methods[sale.payment_method].total += sale.total_amount;
    });

    const totalVendas = salesData.length;
    
    return Object.entries(methods).map(([method, data]) => ({
      payment_method: method,
      quantidade: data.quantidade,
      total: parseFloat(data.total.toFixed(2)),
      percentual: parseFloat(((data.quantidade / totalVendas) * 100).toFixed(1))
    }));
  }

  calculateSalesByCategory(salesData) {
    // Simulação simplificada para frontend
    const categories = {
      'Eletrônicos': { total_itens: 15, total_valor: 4500, total_vendas: 8 },
      'Alimentação': { total_itens: 25, total_valor: 625, total_vendas: 12 },
      'Limpeza': { total_itens: 30, total_valor: 117, total_vendas: 15 },
      'Bebidas': { total_itens: 40, total_valor: 100, total_vendas: 20 }
    };

    return Object.entries(categories).map(([categoria, dados]) => ({
      categoria,
      total_itens: dados.total_itens,
      total_valor: dados.total_valor,
      total_vendas: dados.total_vendas
    }));
  }

  async getStockReport(empresa_id, useCache = true) {
    try {
      const cacheKey = `report:stock:${empresa_id}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          BizFlowLogger.cacheLog('Relatório de estoque frontend do cache', true, { empresa_id });
          return cached;
        }
      }

      const products = this.demoData.products;

      const produtos = products.map(product => ({
        id: product.id,
        produto: product.name,
        quantidade: product.stock_quantity,
        estoque_minimo: product.min_stock,
        preco: product.price,
        categoria: product.category,
        status_estoque: product.stock_quantity === 0 ? 'SEM ESTOQUE' : 
                       product.stock_quantity <= product.min_stock ? 'CRÍTICO' : 
                       product.stock_quantity <= product.min_stock * 2 ? 'ALERTA' : 'NORMAL',
        valor_total_estoque: product.stock_quantity * product.price
      }));

      const estatisticas = this.calculateStockStats(products);
      const reposicao_necessaria = this.calculateRestockNeeds(products);
      const alertas = this.generateStockAlerts(produtos);

      const report = {
        produtos: produtos,
        estatisticas: estatisticas,
        reposicao_necessaria: reposicao_necessaria,
        alertas: alertas,
        gerado_em: new Date().toISOString(),
        modo: 'frontend'
      };

      if (useCache) {
        await CacheService.set(cacheKey, report, 900);
      }

      BizFlowLogger.businessLog('Relatório de estoque frontend gerado', {
        empresaId: empresa_id,
        totalProdutos: report.estatisticas.total_produtos,
        valorTotalEstoque: report.estatisticas.valor_total_estoque
      });

      return report;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendReports.getStockReport' });
      throw error;
    }
  }

  calculateStockStats(products) {
    const totalProdutos = products.length;
    const totalItens = products.reduce((sum, p) => sum + p.stock_quantity, 0);
    const valorTotal = products.reduce((sum, p) => sum + (p.stock_quantity * p.price), 0);
    const produtosSemEstoque = products.filter(p => p.stock_quantity === 0).length;
    const produtosEstoqueBaixo = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock).length;
    const produtosEstoqueAdequado = totalProdutos - produtosSemEstoque - produtosEstoqueBaixo;

    return {
      total_produtos: totalProdutos,
      total_itens_estoque: totalItens,
      valor_total_estoque: parseFloat(valorTotal.toFixed(2)),
      preco_medio: totalProdutos > 0 ? parseFloat((valorTotal / totalItens).toFixed(2)) : 0,
      produtos_sem_estoque: produtosSemEstoque,
      produtos_estoque_baixo: produtosEstoqueBaixo,
      produtos_estoque_adequado: produtosEstoqueAdequado
    };
  }

  calculateRestockNeeds(products) {
    return products
      .filter(p => p.stock_quantity <= p.min_stock)
      .map(p => ({
        produto: p.name,
        quantidade_atual: p.stock_quantity,
        estoque_minimo: p.min_stock,
        quantidade_repor: p.min_stock - p.stock_quantity,
        preco: p.price,
        categoria: p.category
      }))
      .sort((a, b) => b.quantidade_repor - a.quantidade_repor);
  }

  async getFinancialReport(empresa_id, mes = null, ano = null, useCache = true) {
    try {
      const mesAtual = mes || new Date().getMonth() + 1;
      const anoAtual = ano || new Date().getFullYear();
      
      const cacheKey = `report:financial:${empresa_id}:${mesAtual}:${anoAtual}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          BizFlowLogger.cacheLog('Relatório financeiro frontend do cache', true, { empresa_id, mesAtual, anoAtual });
          return cached;
        }
      }

      const financialData = this.demoData.financial.filter(item => {
        const dueDate = new Date(item.due_date);
        return dueDate.getMonth() + 1 === mesAtual && dueDate.getFullYear() === anoAtual;
      });

      const salesData = this.demoData.sales.filter(sale => {
        const saleDate = new Date(sale.sale_date);
        return saleDate.getMonth() + 1 === mesAtual && saleDate.getFullYear() === anoAtual;
      });

      const financeiro = this.processFinancialData(financialData);
      const vendas = this.calculateSalesStats(salesData);
      const resumo_contas = this.calculateAccountsSummary(financialData);
      const fluxo_caixa = this.processCashFlow(financialData);
      const saldo_previsto = this.calculateProjectedBalance(financialData);
      const indicadores = this.calculateFinancialIndicators(financialData, vendas);

      const report = {
        periodo: `${mesAtual}/${anoAtual}`,
        financeiro: financeiro,
        vendas: vendas,
        resumo_contas: resumo_contas,
        fluxo_caixa: fluxo_caixa,
        saldo_previsto: saldo_previsto,
        indicadores: indicadores,
        gerado_em: new Date().toISOString(),
        modo: 'frontend'
      };

      if (useCache) {
        await CacheService.set(cacheKey, report, 1800);
      }

      BizFlowLogger.businessLog('Relatório financeiro frontend gerado', {
        empresaId: empresa_id,
        periodo: report.periodo,
        totalVendas: report.vendas.total_vendas
      });

      return report;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendReports.getFinancialReport' });
      throw error;
    }
  }

  processFinancialData(financialData) {
    const grouped = {};
    
    financialData.forEach(item => {
      const key = `${item.type}-${item.status}`;
      if (!grouped[key]) {
        grouped[key] = {
          tipo: item.type,
          status: item.status,
          total_contas: 0,
          total_valor: 0
        };
      }
      
      grouped[key].total_contas++;
      grouped[key].total_valor += item.amount;
    });

    // Calcular valor médio
    Object.values(grouped).forEach(group => {
      group.valor_medio = group.total_valor / group.total_contas;
    });

    return Object.values(grouped);
  }

  calculateAccountsSummary(financialData) {
    const summary = {};
    
    financialData.forEach(item => {
      const key = `${item.type}-${item.status}`;
      if (!summary[key]) {
        summary[key] = {
          type: item.type,
          status: item.status,
          quantidade: 0,
          valor_total: 0
        };
      }
      
      summary[key].quantidade++;
      summary[key].valor_total += item.amount;
    });

    return Object.values(summary);
  }

  processCashFlow(financialData) {
    const dailyFlow = {};
    
    financialData.forEach(item => {
      const day = new Date(item.due_date).getDate();
      if (!dailyFlow[day]) {
        dailyFlow[day] = { dia: day, receitas: 0, despesas: 0, saldo: 0 };
      }

      if (item.type === 'receita') {
        dailyFlow[day].receitas += item.amount;
      } else {
        dailyFlow[day].despesas += item.amount;
      }

      dailyFlow[day].saldo = dailyFlow[day].receitas - dailyFlow[day].despesas;
    });

    return Object.values(dailyFlow).sort((a, b) => a.dia - b.dia);
  }

  calculateProjectedBalance(financialData) {
    let receitas = 0;
    let despesas = 0;
    let receitas_pendentes = 0;
    let despesas_pendentes = 0;

    financialData.forEach(item => {
      if (item.type === 'receita') {
        if (item.status === 'recebido') {
          receitas += item.amount;
        } else {
          receitas_pendentes += item.amount;
        }
      } else {
        if (item.status === 'pago') {
          despesas += item.amount;
        } else {
          despesas_pendentes += item.amount;
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

  calculateFinancialIndicators(financialData, salesData) {
    const balance = this.calculateProjectedBalance(financialData);
    
    const receitasTotais = balance.receitas + balance.receitas_pendentes;
    const despesasTotais = balance.despesas + balance.despesas_pendentes;
    
    const lucroBruto = receitasTotais - despesasTotais;
    const margemLucro = receitasTotais > 0 ? (lucroBruto / receitasTotais) * 100 : 0;

    return {
      lucro_bruto: parseFloat(lucroBruto.toFixed(2)),
      margem_lucro: parseFloat(margemLucro.toFixed(2)),
      eficiencia: receitasTotais > 0 ? parseFloat((receitasTotais / despesasTotais).toFixed(2)) : 0,
      liquidez: balance.saldo_atual > 0 ? 'positiva' : 'negativa'
    };
  }

  async getTopProductsReport(empresa_id, limite = 10, periodo = '30', useCache = true) {
    try {
      const cacheKey = `report:topproducts:${empresa_id}:${limite}:${periodo}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          BizFlowLogger.cacheLog('Relatório de top produtos frontend do cache', true, { empresa_id, limite, periodo });
          return cached;
        }
      }

      // Simular dados de produtos mais vendidos
      const produtos = this.demoData.products.map((product, index) => ({
        produto: product.name,
        categoria: product.category,
        total_vendido: Math.floor(Math.random() * 100) + 10,
        total_faturado: (Math.floor(Math.random() * 100) + 10) * product.price,
        vezes_vendido: Math.floor(Math.random() * 20) + 1,
        media_por_venda: Math.floor(Math.random() * 5) + 1,
        percentual_total: Math.random() * 20 + 5,
        maior_venda: Math.floor(Math.random() * 10) + 1,
        menor_venda: 1
      })).sort((a, b) => b.total_vendido - a.total_vendido).slice(0, limite);

      const report = {
        produtos: produtos,
        limite: limite,
        periodo: `${periodo} dias`,
        estatisticas: this.calculateProductsStats(produtos),
        gerado_em: new Date().toISOString(),
        modo: 'frontend'
      };

      if (useCache) {
        await CacheService.set(cacheKey, report, 3600);
      }

      BizFlowLogger.businessLog('Relatório de top produtos frontend gerado', {
        empresaId: empresa_id,
        limite: limite,
        periodo: periodo
      });

      return report;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendReports.getTopProductsReport' });
      throw error;
    }
  }

  // ================= MÉTODOS AUXILIARES =================

  analyzeSalesTrends(salesData) {
    if (!salesData || salesData.length === 0) {
      return { tendencia: 'estavel', variacao: 0 };
    }

    const recentSales = salesData.slice(0, Math.min(7, salesData.length));
    const totalSales = recentSales.reduce((sum, day) => sum + day.total_vendas, 0);
    const avgSales = totalSales / recentSales.length;

    const firstDay = recentSales[recentSales.length - 1]?.total_vendas || 0;
    const lastDay = recentSales[0]?.total_vendas || 0;
    const variation = firstDay > 0 ? ((lastDay - firstDay) / firstDay) * 100 : 0;

    let trend = 'estavel';
    if (variation > 10) trend = 'crescendo';
    if (variation < -10) trend = 'decrescendo';

    return {
      tendencia: trend,
      variacao: parseFloat(variation.toFixed(2)),
      media_diaria: parseFloat(avgSales.toFixed(2))
    };
  }

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

  calculateProductsStats(products) {
    if (!products || products.length === 0) {
      return { total_vendido: 0, total_faturado: 0, media_vendas: 0 };
    }

    const totalVendido = products.reduce((sum, p) => sum + p.total_vendido, 0);
    const totalFaturado = products.reduce((sum, p) => sum + p.total_faturado, 0);
    const mediaVendas = products.reduce((sum, p) => sum + p.vezes_vendido, 0) / products.length;

    return {
      total_vendido: totalVendido,
      total_faturado: parseFloat(totalFaturado.toFixed(2)),
      media_vendas: parseFloat(mediaVendas.toFixed(2)),
      produto_mais_vendido: products[0]?.produto || 'N/A'
    };
  }

  // Métodos específicos do frontend
  exportReportToCSV(reportData, reportType) {
    if (typeof window === 'undefined') return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Implementar lógica de exportação CSV básica
    if (reportType === 'sales') {
      csvContent += "Data,Vendas,Valor Total\n";
      reportData.detalhes.forEach(row => {
        csvContent += `${row.data},${row.total_vendas},${row.total_valor}\n`;
      });
    }
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportType}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  getDemoDataInfo() {
    return {
      totalSales: this.demoData.sales.length,
      totalProducts: this.demoData.products.length,
      totalFinancial: this.demoData.financial.length,
      totalCustomers: this.demoData.customers.length,
      lastUpdated: new Date().toISOString()
    };
  }
}

// ✅ SISTEMA DE RELATÓRIOS BACKEND (mantém a implementação original)
class BackendReports {
  async getSalesReport(empresa_id, periodo = '7', useCache = true) {
    try {
      const cacheKey = `report:sales:${empresa_id}:${periodo}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          BizFlowLogger.cacheLog('Relatório de vendas backend do cache', true, { empresa_id, periodo });
          return cached;
        }
      }

      const dias = parseInt(periodo);
      
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
        gerado_em: new Date().toISOString(),
        modo: 'backend'
      };

      if (useCache) {
        await CacheService.set(cacheKey, report, 600);
      }

      BizFlowLogger.businessLog('Relatório de vendas backend gerado', {
        empresaId: empresa_id,
        periodo: periodo,
        totalVendas: report.estatisticas.total_vendas_periodo,
        totalFaturado: report.estatisticas.total_faturado
      });

      return report;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendReports.getSalesReport' });
      throw error;
    }
  }

  async getStockReport(empresa_id, useCache = true) {
    try {
      const cacheKey = `report:stock:${empresa_id}`;
      
      if (useCache) {
        const cached = await CacheService.get(cacheKey);
        if (cached) {
          BizFlowLogger.cacheLog('Relatório de estoque backend do cache', true, { empresa_id });
          return cached;
        }
      }

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
        gerado_em: new Date().toISOString(),
        modo: 'backend'
      };

      if (useCache) {
        await CacheService.set(cacheKey, report, 900);
      }

      BizFlowLogger.businessLog('Relatório de estoque backend gerado', {
        empresaId: empresa_id,
        totalProdutos: report.estatisticas.total_produtos,
        valorTotalEstoque: report.estatisticas.valor_total_estoque
      });

      return report;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendReports.getStockReport' });
      throw error;
    }
  }

  // ... (manter todos os outros métodos do backend reports)

  analyzeSalesTrends(salesData) {
    if (!salesData || salesData.length === 0) {
      return { tendencia: 'estavel', variacao: 0 };
    }

    const recentSales = salesData.slice(0, 7);
    const totalSales = recentSales.reduce((sum, day) => sum + day.total_vendas, 0);
    const avgSales = totalSales / recentSales.length;

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
}

// ✅ SERVIÇO DE RELATÓRIOS HÍBRIDO PRINCIPAL
class HybridReportsService {
  constructor() {
    this.frontendReports = new FrontendReports();
    this.backendReports = new BackendReports();
    this.mode = IS_FRONTEND_MODE ? 'frontend' : 'backend';
  }

  async getSalesReport(empresa_id, periodo = '7', useCache = true) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendReports.getSalesReport(empresa_id, periodo, useCache);
    } else {
      return await this.backendReports.getSalesReport(empresa_id, periodo, useCache);
    }
  }

  async getStockReport(empresa_id, useCache = true) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendReports.getStockReport(empresa_id, useCache);
    } else {
      return await this.backendReports.getStockReport(empresa_id, useCache);
    }
  }

  async getFinancialReport(empresa_id, mes = null, ano = null, useCache = true) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendReports.getFinancialReport(empresa_id, mes, ano, useCache);
    } else {
      return await this.backendReports.getFinancialReport(empresa_id, mes, ano, useCache);
    }
  }

  async getTopProductsReport(empresa_id, limite = 10, periodo = '30', useCache = true) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendReports.getTopProductsReport(empresa_id, limite, periodo, useCache);
    } else {
      return await this.backendReports.getTopProductsReport(empresa_id, limite, periodo, useCache);
    }
  }

  async getSystemPerformanceReport() {
    if (IS_FRONTEND_MODE) {
      return {
        message: 'Relatório de performance do sistema não disponível em modo frontend',
        modo: 'frontend',
        gerado_em: new Date().toISOString()
      };
    } else {
      return await this.backendReports.getSystemPerformanceReport();
    }
  }

  async getCustomersReport(empresa_id, periodo = '30') {
    if (IS_FRONTEND_MODE) {
      return {
        message: 'Relatório de clientes não disponível em modo frontend',
        modo: 'frontend',
        gerado_em: new Date().toISOString()
      };
    } else {
      return await this.backendReports.getCustomersReport(empresa_id, periodo);
    }
  }

  // ✅ MÉTODOS ESPECÍFICOS DO FRONTEND
  exportReportToCSV(reportData, reportType) {
    if (IS_FRONTEND_MODE) {
      this.frontendReports.exportReportToCSV(reportData, reportType);
    }
  }

  getDemoDataInfo() {
    if (IS_FRONTEND_MODE) {
      return this.frontendReports.getDemoDataInfo();
    }
    return null;
  }

  // ✅ OBTER MODO ATUAL
  getCurrentMode() {
    return this.mode;
  }

  // ✅ VERIFICAR SE É FRONTEND
  isFrontendMode() {
    return IS_FRONTEND_MODE;
  }
}

// ✅ EXPORTAR INSTÂNCIA ÚNICA
const reportsService = new HybridReportsService();
export default reportsService;

// ✅ EXPORTAR PARA USO NO BROWSER
if (IS_BROWSER) {
  window.BizFlowReports = reportsService;
}
