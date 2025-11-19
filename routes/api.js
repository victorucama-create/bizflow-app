// routes/api.js - SISTEMA BIZFLOW FASE 5 COMPLETA - API OTIMIZADA
import express from 'express';
import { queryWithMetrics, redis, logger } from '../core/server.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = express.Router();

// ================= MIDDLEWARES FASE 5 COMPLETA =================

// Middleware de contexto empresarial com cache
async function empresaContext(req, res, next) {
  try {
    let empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || req.body.empresa_id;
    
    if (!empresaId && req.user) {
      empresaId = req.user.empresa_id;
    }
    
    if (!empresaId) {
      // Tentar cache primeiro
      const cacheKey = 'empresa:default';
      let defaultEmpresa = await redis.get(cacheKey);
      
      if (defaultEmpresa) {
        empresaId = JSON.parse(defaultEmpresa).id;
      } else {
        // Buscar do banco
        const empresaResult = await queryWithMetrics(
          'SELECT id FROM empresas WHERE is_active = true ORDER BY id LIMIT 1',
          [],
          'select',
          'empresas'
        );
        empresaId = empresaResult.rows.length > 0 ? empresaResult.rows[0].id : 1;
        
        // Salvar no cache
        await redis.setex(cacheKey, 300, JSON.stringify({ id: empresaId }));
      }
    }
    
    req.empresa_id = parseInt(empresaId);
    next();
  } catch (error) {
    logger.error('Erro no contexto empresarial:', error);
    req.empresa_id = 1;
    next();
  }
}

// Middleware de autenticação com cache Redis
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token de autenticação não fornecido' 
      });
    }

    // Tentar buscar do cache primeiro
    const cacheKey = `session:${token}`;
    let userSession = await redis.get(cacheKey);
    
    if (userSession) {
      req.user = JSON.parse(userSession);
      return next();
    }

    // Se não encontrou no cache, buscar no banco
    const sessionResult = await queryWithMetrics(
      `SELECT u.*, us.expires_at 
       FROM user_sessions us 
       JOIN users u ON us.user_id = u.id 
       WHERE us.session_token = $1 AND us.expires_at > NOW() AND u.is_active = true`,
      [token],
      'select',
      'user_sessions'
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Sessão expirada ou inválida' 
      });
    }

    req.user = sessionResult.rows[0];
    
    // Salvar no cache por 1 hora
    await redis.setex(cacheKey, 3600, JSON.stringify(req.user));
    
    next();
  } catch (error) {
    logger.error('Erro na autenticação:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
}

// Middleware de cache genérico
const cacheMiddleware = (duration = 300, keyPrefix = 'cache') => {
  return async (req, res, next) => {
    if (req.method !== 'GET' || req.query.nocache) {
      return next();
    }

    const cacheKey = `${keyPrefix}:${req.originalUrl}`;
    
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      // Sobrescrever res.json para capturar a resposta
      const originalJson = res.json;
      res.json = function(data) {
        if (data.success !== false) {
          redis.setex(cacheKey, duration, JSON.stringify(data))
            .catch(err => logger.error('Erro ao salvar cache:', err));
        }
        originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      logger.error('Erro no cache middleware:', error);
      next();
    }
  };
};

// Middleware de sanitização
function sanitizeInput(fields) {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = req.body[field].trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    });
    next();
  };
}

// Middleware de validação
function validateRequiredFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Campos obrigatórios faltando: ${missing.join(', ')}`
      });
    }
    next();
  };
}

// ================= ROTAS DE AUTENTICAÇÃO FASE 5 =================

// Login com rate limiting e sanitização
router.post('/auth/login', 
  sanitizeInput(['username', 'password']),
  validateRequiredFields(['username', 'password']),
  async (req, res) => {
    try {
      const { username, password } = req.body;

      // Buscar usuário
      const userResult = await queryWithMetrics(
        `SELECT id, username, email, password_hash, full_name, role, empresa_id 
         FROM users 
         WHERE username = $1 AND is_active = true 
         LIMIT 1`,
        [username],
        'select',
        'users'
      );

      if (userResult.rows.length === 0) {
        logger.warn('Tentativa de login com usuário inválido:', username);
        return res.status(401).json({ 
          success: false, 
          error: 'Credenciais inválidas' 
        });
      }

      const user = userResult.rows[0];

      // Verificar senha
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        logger.warn('Tentativa de login com senha inválida para:', username);
        return res.status(401).json({ 
          success: false, 
          error: 'Credenciais inválidas' 
        });
      }

      // Gerar token de sessão seguro
      const sessionToken = 'bizflow_' + Date.now() + '_' + crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Salvar sessão
      await queryWithMetrics(
        `INSERT INTO user_sessions (user_id, session_token, expires_at) 
         VALUES ($1, $2, $3)`,
        [user.id, sessionToken, expiresAt],
        'insert',
        'user_sessions'
      );

      // Salvar sessão no cache
      const cacheKey = `session:${sessionToken}`;
      await redis.setex(cacheKey, 3600, JSON.stringify(user));

      // Remover password hash da resposta
      const { password_hash, ...userWithoutPassword } = user;

      logger.info('Login realizado com sucesso para:', username);

      res.json({
        success: true,
        message: 'Login realizado com sucesso!',
        data: {
          user: userWithoutPassword,
          session_token: sessionToken,
          expires_at: expiresAt
        }
      });

    } catch (error) {
      logger.error('ERRO CRÍTICO NO LOGIN:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor: ' + error.message
      });
    }
  }
);

// Logout com limpeza de cache
router.post('/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // Remover do cache
      await redis.del(`session:${token}`);
      
      // Invalidar sessão no banco
      await queryWithMetrics(
        'DELETE FROM user_sessions WHERE session_token = $1',
        [token],
        'delete',
        'user_sessions'
      );
    }

    res.json({
      success: true,
      message: 'Logout realizado com sucesso!'
    });
  } catch (error) {
    logger.error('Erro no logout:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// ================= ROTAS DE EMPRESAS COM CACHE =================

// Listar empresas
router.get('/empresas', 
  requireAuth, 
  cacheMiddleware(300, 'empresas'),
  async (req, res) => {
    try {
      const result = await queryWithMetrics(
        'SELECT * FROM empresas WHERE is_active = true ORDER BY nome',
        [],
        'select',
        'empresas'
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Erro ao buscar empresas:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// Criar empresa
router.post('/empresas', 
  requireAuth, 
  sanitizeInput(['nome', 'cnpj', 'email', 'telefone']),
  validateRequiredFields(['nome']),
  async (req, res) => {
    try {
      const { nome, cnpj, email, telefone } = req.body;
      
      const result = await queryWithMetrics(
        `INSERT INTO empresas (nome, cnpj, email, telefone) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [nome, cnpj, email, telefone],
        'insert',
        'empresas'
      );

      // Invalidar cache de empresas
      await redis.del('cache:empresas:/api/empresas');

      res.json({
        success: true,
        data: result.rows[0],
        message: "Empresa criada com sucesso!"
      });
    } catch (error) {
      logger.error('Erro ao criar empresa:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// ================= ROTAS DE PRODUTOS COM CACHE =================

// Listar produtos
router.get('/produtos', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(120, 'produtos'),
  async (req, res) => {
    try {
      const result = await queryWithMetrics(
        'SELECT * FROM products WHERE empresa_id = $1 AND is_active = true ORDER BY name',
        [req.empresa_id],
        'select',
        'products'
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Erro ao buscar produtos:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// Criar produto
router.post('/produtos', 
  requireAuth, 
  empresaContext, 
  sanitizeInput(['name', 'description', 'category']),
  validateRequiredFields(['name', 'price']),
  async (req, res) => {
    try {
      const { name, description, price, stock_quantity, category } = req.body;
      
      const result = await queryWithMetrics(
        `INSERT INTO products (empresa_id, name, description, price, stock_quantity, category) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [req.empresa_id, name, description, price, stock_quantity || 0, category],
        'insert',
        'products'
      );

      // Invalidar cache de produtos
      const cacheKey = `cache:produtos:/api/produtos?empresa_id=${req.empresa_id}`;
      await redis.del(cacheKey);

      res.json({
        success: true,
        data: result.rows[0],
        message: "Produto adicionado com sucesso!"
      });
    } catch (error) {
      logger.error('Erro ao criar produto:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// ================= ROTAS DE VENDAS OTIMIZADAS =================

// Listar vendas
router.get('/vendas', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(180, 'vendas'),
  async (req, res) => {
    try {
      const result = await queryWithMetrics(
        `SELECT s.*, 
                COUNT(si.id) as items_count
         FROM sales s
         LEFT JOIN sale_items si ON s.id = si.sale_id
         WHERE s.empresa_id = $1
         GROUP BY s.id
         ORDER BY s.sale_date DESC 
         LIMIT 50`,
        [req.empresa_id],
        'select',
        'sales'
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Erro ao buscar vendas:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// Criar venda
router.post('/vendas', 
  requireAuth, 
  empresaContext, 
  validateRequiredFields(['items', 'total_amount', 'payment_method']),
  async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { items, total_amount, total_items, payment_method } = req.body;
      const sale_code = 'V' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
      
      // Inserir venda
      const saleResult = await client.query(
        `INSERT INTO sales (empresa_id, sale_code, total_amount, total_items, payment_method) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [req.empresa_id, sale_code, total_amount, total_items, payment_method]
      );
      
      const sale = saleResult.rows[0];
      
      // Inserir itens da venda
      for (const item of items) {
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total_price) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sale.id, item.product_id, item.product_name, item.quantity, item.unit_price, item.total_price]
        );

        // Atualizar estoque
        if (item.product_id) {
          await client.query(
            `UPDATE products SET stock_quantity = stock_quantity - $1 
             WHERE id = $2 AND empresa_id = $3`,
            [item.quantity, item.product_id, req.empresa_id]
          );
        }
      }
      
      await client.query('COMMIT');

      // Invalidar caches relacionados
      await Promise.all([
        redis.del(`cache:vendas:/api/vendas?empresa_id=${req.empresa_id}`),
        redis.del(`cache:produtos:/api/produtos?empresa_id=${req.empresa_id}`),
        redis.del(`cache:dashboard:/api/dashboard?empresa_id=${req.empresa_id}`)
      ]);

      // Emitir evento WebSocket
      if (req.app.get('io')) {
        req.app.get('io').to(`empresa-${req.empresa_id}`).emit('nova-venda', {
          empresa_id: req.empresa_id,
          venda: sale,
          items: items
        });
      }

      res.json({
        success: true,
        data: sale,
        message: "Venda registrada com sucesso!"
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Erro ao registrar venda:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    } finally {
      client.release();
    }
  }
);

// ================= ROTAS DE NOTIFICAÇÕES =================

// Listar notificações
router.get('/notifications', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(60, 'notifications'),
  async (req, res) => {
    try {
      const result = await queryWithMetrics(
        `SELECT * FROM notifications 
         WHERE empresa_id = $1 AND (user_id IS NULL OR user_id = $2)
         ORDER BY created_at DESC 
         LIMIT 20`,
        [req.empresa_id, req.user.id],
        'select',
        'notifications'
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Erro ao buscar notificações:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// Marcar notificação como lida
router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await queryWithMetrics(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND (user_id IS NULL OR user_id = $2)',
      [req.params.id, req.user.id],
      'update',
      'notifications'
    );

    // Invalidar cache de notificações
    await redis.del(`cache:notifications:/api/notifications`);

    res.json({
      success: true,
      message: 'Notificação marcada como lida'
    });
  } catch (error) {
    logger.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ================= ROTAS FINANCEIRAS COM CACHE =================

// Listar contas financeiras
router.get('/financeiro', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(300, 'financeiro'),
  async (req, res) => {
    try {
      const result = await queryWithMetrics(
        'SELECT * FROM financial_accounts WHERE empresa_id = $1 ORDER BY due_date, created_at DESC',
        [req.empresa_id],
        'select',
        'financial_accounts'
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Erro ao buscar contas financeiras:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// Criar conta financeira
router.post('/financeiro', 
  requireAuth, 
  empresaContext, 
  sanitizeInput(['name']),
  validateRequiredFields(['name', 'type', 'amount']),
  async (req, res) => {
    try {
      const { name, type, amount, due_date } = req.body;
      
      const result = await queryWithMetrics(
        `INSERT INTO financial_accounts (empresa_id, name, type, amount, due_date) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [req.empresa_id, name, type, amount, due_date],
        'insert',
        'financial_accounts'
      );

      // Invalidar cache financeiro
      await redis.del(`cache:financeiro:/api/financeiro?empresa_id=${req.empresa_id}`);

      res.json({
        success: true,
        data: result.rows[0],
        message: "Conta financeira registrada com sucesso!"
      });
    } catch (error) {
      logger.error('Erro ao criar conta financeira:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// ================= ROTAS DE RELATÓRIOS COM CACHE =================

// Relatório de Vendas
router.get('/relatorios/vendas', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(600, 'relatorios'),
  async (req, res) => {
    try {
      const { periodo = '7' } = req.query;
      const dias = parseInt(periodo);
      
      const result = await queryWithMetrics(
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
        [req.empresa_id],
        'select',
        'sales'
      );
      
      // Estatísticas resumidas
      const statsResult = await queryWithMetrics(
        `SELECT 
          COUNT(*) as total_vendas_periodo,
          SUM(s.total_amount) as total_faturado,
          AVG(s.total_amount) as ticket_medio,
          MAX(s.total_amount) as maior_venda,
          MIN(s.total_amount) as menor_venda
        FROM sales s
        WHERE s.empresa_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${dias} days'`,
        [req.empresa_id],
        'select',
        'sales'
      );
      
      res.json({
        success: true,
        data: {
          detalhes: result.rows,
          estatisticas: statsResult.rows[0] || {
            total_vendas_periodo: 0,
            total_faturado: 0,
            ticket_medio: 0,
            maior_venda: 0,
            menor_venda: 0
          }
        }
      });
    } catch (error) {
      logger.error('Erro ao gerar relatório de vendas:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// Relatório de Estoque
router.get('/relatorios/estoque', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(600, 'relatorios'),
  async (req, res) => {
    try {
      const result = await queryWithMetrics(
        `SELECT 
          p.name as produto,
          p.stock_quantity as quantidade,
          p.min_stock as estoque_minimo,
          p.price as preco,
          p.category as categoria,
          CASE 
            WHEN p.stock_quantity <= p.min_stock THEN 'CRÍTICO'
            WHEN p.stock_quantity <= p.min_stock * 2 THEN 'ALERTA' 
            ELSE 'NORMAL'
          END as status_estoque,
          (p.stock_quantity * p.price) as valor_total_estoque
        FROM products p
        WHERE p.empresa_id = $1 AND p.is_active = true
        ORDER BY status_estoque, p.stock_quantity ASC`,
        [req.empresa_id],
        'select',
        'products'
      );
      
      // Estatísticas do estoque
      const statsResult = await queryWithMetrics(
        `SELECT 
          COUNT(*) as total_produtos,
          SUM(p.stock_quantity) as total_itens_estoque,
          SUM(p.stock_quantity * p.price) as valor_total_estoque,
          AVG(p.price) as preco_medio,
          COUNT(CASE WHEN p.stock_quantity <= p.min_stock THEN 1 END) as produtos_estoque_baixo,
          COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END) as produtos_sem_estoque
        FROM products p
        WHERE p.empresa_id = $1 AND p.is_active = true`,
        [req.empresa_id],
        'select',
        'products'
      );
      
      res.json({
        success: true,
        data: {
          produtos: result.rows,
          estatisticas: statsResult.rows[0] || {
            total_produtos: 0,
            total_itens_estoque: 0,
            valor_total_estoque: 0,
            preco_medio: 0,
            produtos_estoque_baixo: 0,
            produtos_sem_estoque: 0
          }
        }
      });
    } catch (error) {
      logger.error('Erro ao gerar relatório de estoque:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// Relatório Financeiro
router.get('/relatorios/financeiro', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(600, 'relatorios'),
  async (req, res) => {
    try {
      const { mes, ano } = req.query;
      const mesAtual = mes || new Date().getMonth() + 1;
      const anoAtual = ano || new Date().getFullYear();
      
      // Receitas e Despesas
      const financeiroResult = await queryWithMetrics(
        `SELECT 
          type as tipo,
          COUNT(*) as total_contas,
          SUM(amount) as total_valor,
          AVG(amount) as valor_medio,
          status
        FROM financial_accounts 
        WHERE empresa_id = $1 AND EXTRACT(MONTH FROM due_date) = $2 
          AND EXTRACT(YEAR FROM due_date) = $3
        GROUP BY type, status
        ORDER BY type, status`,
        [req.empresa_id, mesAtual, anoAtual],
        'select',
        'financial_accounts'
      );
      
      // Vendas do período
      const vendasResult = await queryWithMetrics(
        `SELECT 
          SUM(total_amount) as total_vendas,
          COUNT(*) as total_vendas_quantidade,
          AVG(total_amount) as ticket_medio
        FROM sales 
        WHERE empresa_id = $1 AND EXTRACT(MONTH FROM sale_date) = $2 
          AND EXTRACT(YEAR FROM sale_date) = $3`,
        [req.empresa_id, mesAtual, anoAtual],
        'select',
        'sales'
      );
      
      res.json({
        success: true,
        data: {
          financeiro: financeiroResult.rows,
          vendas: vendasResult.rows[0] || { 
            total_vendas: 0, 
            total_vendas_quantidade: 0, 
            ticket_medio: 0 
          }
        }
      });
    } catch (error) {
      logger.error('Erro ao gerar relatório financeiro:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// Relatório de Produtos Mais Vendidos
router.get('/relatorios/produtos-mais-vendidos', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(600, 'relatorios'),
  async (req, res) => {
    try {
      const { limite = '10' } = req.query;
      
      const result = await queryWithMetrics(
        `SELECT 
          p.name as produto,
          p.category as categoria,
          SUM(si.quantity) as total_vendido,
          SUM(si.total_price) as total_faturado,
          COUNT(DISTINCT si.sale_id) as vezes_vendido,
          AVG(si.quantity) as media_por_venda
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.empresa_id = $1
        GROUP BY p.id, p.name, p.category
        ORDER BY total_vendido DESC
        LIMIT $2`,
        [req.empresa_id, limite],
        'select',
        'sale_items'
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Erro ao gerar relatório de produtos mais vendidos:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// ================= ROTA DE DASHBOARD COM CACHE =================

// Dashboard Data
router.get('/dashboard', 
  requireAuth, 
  empresaContext, 
  cacheMiddleware(300, 'dashboard'),
  async (req, res) => {
    try {
      const [
        empresasResult,
        produtosResult,
        vendasResult,
        usuariosResult,
        financeiroResult,
        notificacoesResult
      ] = await Promise.all([
        queryWithMetrics('SELECT COUNT(*) as total FROM empresas WHERE is_active = true', [], 'select', 'empresas'),
        queryWithMetrics('SELECT COUNT(*) as total FROM products WHERE empresa_id = $1 AND is_active = true', [req.empresa_id], 'select', 'products'),
        queryWithMetrics('SELECT COUNT(*) as total, COALESCE(SUM(total_amount), 0) as total_vendas FROM sales WHERE empresa_id = $1', [req.empresa_id], 'select', 'sales'),
        queryWithMetrics('SELECT COUNT(*) as total FROM users WHERE empresa_id = $1 AND is_active = true', [req.empresa_id], 'select', 'users'),
        queryWithMetrics(`SELECT 
          COUNT(*) as total_contas,
          SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) as total_receitas,
          SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) as total_despesas
          FROM financial_accounts WHERE empresa_id = $1`, [req.empresa_id], 'select', 'financial_accounts'),
        queryWithMetrics('SELECT COUNT(*) as total FROM notifications WHERE empresa_id = $1 AND is_read = false', [req.empresa_id], 'select', 'notifications')
      ]);

      res.json({
        success: true,
        data: {
          total_empresas: parseInt(empresasResult.rows[0].total),
          total_produtos: parseInt(produtosResult.rows[0].total),
          total_vendas: parseInt(vendasResult.rows[0].total),
          total_usuarios: parseInt(usuariosResult.rows[0].total),
          faturamento_total: parseFloat(vendasResult.rows[0].total_vendas),
          total_contas: parseInt(financeiroResult.rows[0].total_contas),
          total_receitas: parseFloat(financeiroResult.rows[0].total_receitas || 0),
          total_despesas: parseFloat(financeiroResult.rows[0].total_despesas || 0),
          notificacoes_nao_lidas: parseInt(notificacoesResult.rows[0].total)
        }
      });
    } catch (error) {
      logger.error('Erro ao buscar dados do dashboard:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
);

// ================= ROTA DE TESTE FASE 5 =================

// Teste da API
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'API BizFlow FASE 5 COMPLETA funcionando!',
    timestamp: new Date().toISOString(),
    version: '5.5.0',
    features: [
      'Redis Cache Integration',
      'Prometheus Metrics',
      'Rate Limiting',
      'Advanced Security',
      'WebSocket Real-time',
      'Structured Logging',
      'Input Sanitization',
      'Cache Invalidation'
    ]
  });
});

// ================= ROTA DE STATUS DO CACHE =================

// Status do cache
router.get('/cache/status', requireAuth, async (req, res) => {
  try {
    const keys = await redis.keys('*');
    const cacheInfo = {
      total_keys: keys.length,
      memory_usage: await redis.info('memory'),
      connected: redis.status === 'ready'
    };

    res.json({
      success: true,
      data: cacheInfo
    });
  } catch (error) {
    logger.error('Erro ao verificar status do cache:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Limpar cache
router.delete('/cache/clear', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Acesso negado. Apenas administradores podem limpar o cache.' 
      });
    }

    await redis.flushdb();
    
    res.json({
      success: true,
      message: 'Cache limpo com sucesso!'
    });
  } catch (error) {
    logger.error('Erro ao limpar cache:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

export default router;
