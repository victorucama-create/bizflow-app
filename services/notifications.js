// services/notifications.js - SISTEMA BIZFLOW FASE 5 COMPLETA HÍBRIDO
import CacheService from './cache-service.js';
import BizFlowLogger from '../utils/logger.js';

// ✅ DETECÇÃO AUTOMÁTICA DE AMBIENTE
const IS_FRONTEND_MODE = typeof window !== 'undefined' || process.env.FRONTEND_MODE === 'true';
const IS_BROWSER = typeof window !== 'undefined';

// ✅ IMPORT DINÂMICO DO BACKEND (apenas se não for frontend)
let queryWithMetrics;
let io;

if (!IS_FRONTEND_MODE) {
  import('../core/server.js').then(module => {
    queryWithMetrics = module.queryWithMetrics;
    io = module.io;
  }).catch(error => {
    BizFlowLogger.errorLog(error, { context: 'NotificationService backend import' });
  });
}

// ✅ SISTEMA DE NOTIFICAÇÕES FRONTEND
class FrontendNotifications {
  constructor() {
    this.notifications = [];
    this.init();
  }

  init() {
    // Carregar notificações do localStorage se existirem
    this.loadFromStorage();
    BizFlowLogger.businessLog('Sistema de notificações frontend inicializado');
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem('bizflow_notifications');
      if (stored) {
        this.notifications = JSON.parse(stored);
      }
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.loadFromStorage' });
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('bizflow_notifications', JSON.stringify(this.notifications));
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.saveToStorage' });
    }
  }

  async createNotification(notificationData) {
    try {
      const { 
        empresa_id, 
        user_id = null, 
        title, 
        message, 
        type = 'info',
        metadata = {},
        priority = 'medium'
      } = notificationData;

      if (!empresa_id || !title || !message) {
        throw new Error('Empresa ID, título e mensagem são obrigatórios');
      }

      const notification = {
        id: Date.now(),
        empresa_id,
        user_id,
        title,
        message,
        type,
        metadata,
        priority,
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.notifications.unshift(notification);
      this.saveToStorage();

      // Emitir evento para UI
      this.emitNotification(notification);

      // Invalidar cache
      await this.invalidateNotificationCache(empresa_id, user_id);

      BizFlowLogger.businessLog('Notificação frontend criada', {
        notificationId: notification.id,
        empresaId: empresa_id,
        userId: user_id,
        type: type,
        priority: priority
      });

      return notification;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.createNotification' });
      throw error;
    }
  }

  emitNotification(notification) {
    try {
      // Emitir evento customizado para a UI
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        const event = new CustomEvent('bizflow-notification', {
          detail: {
            ...notification,
            real_time: true,
            source: 'frontend'
          }
        });
        window.dispatchEvent(event);
      }

      // Também usar console para desenvolvimento
      BizFlowLogger.businessLog('Notificação frontend emitida', {
        notificationId: notification.id,
        title: notification.title
      });

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.emitNotification' });
    }
  }

  async getNotifications(empresa_id, user_id, limit = 20, offset = 0, filters = {}) {
    try {
      const cacheKey = `notifications:${empresa_id}:${user_id}:${limit}:${offset}:${JSON.stringify(filters)}`;
      
      // Tentar cache primeiro
      const cached = await CacheService.get(cacheKey);
      if (cached) {
        BizFlowLogger.cacheLog('Notificações frontend recuperadas do cache', true, { 
          empresa_id, 
          user_id,
          count: cached.length 
        });
        return cached;
      }

      let filtered = this.notifications.filter(notif => 
        notif.empresa_id === empresa_id && 
        (notif.user_id === null || notif.user_id === user_id)
      );

      // Aplicar filtros
      if (filters.type) {
        filtered = filtered.filter(notif => notif.type === filters.type);
      }

      if (filters.is_read !== undefined) {
        filtered = filtered.filter(notif => notif.is_read === filters.is_read);
      }

      if (filters.priority) {
        filtered = filtered.filter(notif => notif.priority === filters.priority);
      }

      // Ordenar por prioridade e data
      filtered.sort((a, b) => {
        const priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 };
        const aPriority = priorityOrder[a.priority] || 4;
        const bPriority = priorityOrder[b.priority] || 4;
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        return new Date(b.created_at) - new Date(a.created_at);
      });

      // Aplicar paginação
      const paginated = filtered.slice(offset, offset + limit);

      // Salvar no cache
      await CacheService.set(cacheKey, paginated, 120);

      BizFlowLogger.businessLog('Notificações frontend buscadas', {
        empresaId: empresa_id,
        userId: user_id,
        count: paginated.length,
        filters: filters
      });

      return paginated;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.getNotifications' });
      throw error;
    }
  }

  async markAsRead(notificationId, userId) {
    try {
      const notification = this.notifications.find(notif => 
        notif.id === notificationId && 
        (notif.user_id === null || notif.user_id === userId)
      );

      if (!notification) {
        throw new Error('Notificação não encontrada ou acesso negado');
      }

      notification.is_read = true;
      notification.updated_at = new Date().toISOString();
      this.saveToStorage();

      // Invalidar cache
      await this.invalidateNotificationCache(notification.empresa_id, userId);

      // Emitir atualização
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        const event = new CustomEvent('bizflow-notification-read', {
          detail: {
            ...notification,
            real_time: true
          }
        });
        window.dispatchEvent(event);
      }

      BizFlowLogger.businessLog('Notificação frontend marcada como lida', {
        notificationId: notification.id,
        userId: userId
      });

      return notification;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.markAsRead' });
      throw error;
    }
  }

  async markAllAsRead(empresa_id, userId) {
    try {
      let updatedCount = 0;

      this.notifications.forEach(notification => {
        if (notification.empresa_id === empresa_id && 
            (notification.user_id === null || notification.user_id === userId) &&
            !notification.is_read) {
          notification.is_read = true;
          notification.updated_at = new Date().toISOString();
          updatedCount++;
        }
      });

      this.saveToStorage();

      // Invalidar cache
      await this.invalidateNotificationCache(empresa_id, userId);

      // Emitir evento
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        const event = new CustomEvent('bizflow-all-notifications-read', {
          detail: { updatedCount, real_time: true }
        });
        window.dispatchEvent(event);
      }

      BizFlowLogger.businessLog('Todas notificações frontend marcadas como lidas', {
        empresaId: empresa_id,
        userId: userId,
        updatedCount: updatedCount
      });

      return { updatedCount };

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.markAllAsRead' });
      throw error;
    }
  }

  async getUnreadCount(empresa_id, userId) {
    try {
      const cacheKey = `notifications:unread:${empresa_id}:${userId}`;
      
      // Tentar cache primeiro
      const cached = await CacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const unreadCount = this.notifications.filter(notif => 
        notif.empresa_id === empresa_id && 
        (notif.user_id === null || notif.user_id === userId) &&
        !notif.is_read
      ).length;

      // Salvar no cache (1 minuto)
      await CacheService.set(cacheKey, unreadCount, 60);

      return unreadCount;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.getUnreadCount' });
      throw error;
    }
  }

  async createLowStockNotification(product) {
    try {
      const notification = await this.createNotification({
        empresa_id: product.empresa_id,
        title: '⚠️ Estoque Baixo',
        message: `O produto "${product.name}" está com estoque baixo (${product.stock_quantity} unidades). Estoque mínimo: ${product.min_stock}`,
        type: 'warning',
        priority: 'high',
        metadata: {
          product_id: product.id,
          product_name: product.name,
          current_stock: product.stock_quantity,
          min_stock: product.min_stock,
          category: 'stock',
          action_required: true
        }
      });

      BizFlowLogger.businessLog('Notificação de estoque baixo frontend criada', {
        productId: product.id,
        productName: product.name,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.createLowStockNotification' });
      throw error;
    }
  }

  async createSaleNotification(sale, empresa_id) {
    try {
      const notification = await this.createNotification({
        empresa_id: empresa_id,
        title: '💰 Nova Venda Realizada',
        message: `Venda ${sale.sale_code} realizada - Total: R$ ${sale.total_amount}`,
        type: 'success',
        priority: 'medium',
        metadata: {
          sale_id: sale.id,
          sale_code: sale.sale_code,
          total_amount: sale.total_amount,
          items_count: sale.total_items,
          category: 'sales'
        }
      });

      BizFlowLogger.businessLog('Notificação de venda frontend criada', {
        saleId: sale.id,
        saleCode: sale.sale_code,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.createSaleNotification' });
      throw error;
    }
  }

  async invalidateNotificationCache(empresa_id, user_id) {
    try {
      const patterns = [
        `notifications:${empresa_id}:${user_id}:*`,
        `notifications:unread:${empresa_id}:${user_id}`
      ];

      for (const pattern of patterns) {
        await CacheService.delPattern(pattern);
      }

      BizFlowLogger.cacheLog('Cache de notificações frontend invalidado', false, {
        empresaId: empresa_id,
        userId: user_id,
        patterns: patterns.length
      });

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'FrontendNotifications.invalidateNotificationCache' });
    }
  }

  // Métodos específicos do frontend
  clearAllNotifications() {
    this.notifications = [];
    this.saveToStorage();
    BizFlowLogger.businessLog('Todas notificações frontend limpas');
  }

  getNotificationStats(empresa_id, days = 7) {
    const now = new Date();
    const startDate = new Date(now.setDate(now.getDate() - days));

    const recent = this.notifications.filter(notif => 
      notif.empresa_id === empresa_id && 
      new Date(notif.created_at) >= startDate
    );

    const stats = {
      period: `${days} dias`,
      total: recent.length,
      by_type: {},
      by_priority: {},
      read_rate: 0
    };

    recent.forEach(notif => {
      stats.by_type[notif.type] = (stats.by_type[notif.type] || 0) + 1;
      stats.by_priority[notif.priority] = (stats.by_priority[notif.priority] || 0) + 1;
    });

    if (stats.total > 0) {
      const readCount = recent.filter(notif => notif.is_read).length;
      stats.read_rate = (readCount / stats.total) * 100;
    }

    return stats;
  }
}

// ✅ SISTEMA DE NOTIFICAÇÕES BACKEND
class BackendNotifications {
  async createNotification(notificationData) {
    try {
      const { 
        empresa_id, 
        user_id = null, 
        title, 
        message, 
        type = 'info',
        metadata = {},
        priority = 'medium'
      } = notificationData;

      if (!empresa_id || !title || !message) {
        throw new Error('Empresa ID, título e mensagem são obrigatórios');
      }

      const result = await queryWithMetrics(
        `INSERT INTO notifications (empresa_id, user_id, title, message, type, metadata, priority) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING *`,
        [empresa_id, user_id, title, message, type, JSON.stringify(metadata), priority],
        'insert',
        'notifications'
      );

      const notification = result.rows[0];

      this.emitNotification(notification);

      await this.invalidateNotificationCache(empresa_id, user_id);

      BizFlowLogger.businessLog('Notificação backend criada', {
        notificationId: notification.id,
        empresaId: empresa_id,
        userId: user_id,
        type: type,
        priority: priority
      });

      return notification;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.createNotification' });
      throw error;
    }
  }

  emitNotification(notification) {
    try {
      if (io) {
        if (notification.user_id) {
          io.to(`user-${notification.user_id}`).emit('new-notification', {
            ...notification,
            real_time: true
          });
        }
        
        io.to(`empresa-${notification.empresa_id}`).emit('company-notification', {
          ...notification,
          real_time: true
        });
        
        BizFlowLogger.cacheLog('Notificação backend emitida via WebSocket', true, {
          notificationId: notification.id,
          empresaId: notification.empresa_id,
          userId: notification.user_id
        });
      }
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.emitNotification' });
    }
  }

  async getNotifications(empresa_id, user_id, limit = 20, offset = 0, filters = {}) {
    try {
      const cacheKey = `notifications:${empresa_id}:${user_id}:${limit}:${offset}:${JSON.stringify(filters)}`;
      
      const cached = await CacheService.get(cacheKey);
      if (cached) {
        BizFlowLogger.cacheLog('Notificações backend recuperadas do cache', true, { 
          empresa_id, 
          user_id,
          count: cached.length 
        });
        return cached;
      }

      let query = `
        SELECT * FROM notifications 
        WHERE empresa_id = $1 AND (user_id IS NULL OR user_id = $2)
      `;
      const params = [empresa_id, user_id];
      let paramCount = 2;

      if (filters.type) {
        paramCount++;
        query += ` AND type = $${paramCount}`;
        params.push(filters.type);
      }

      if (filters.is_read !== undefined) {
        paramCount++;
        query += ` AND is_read = $${paramCount}`;
        params.push(filters.is_read);
      }

      if (filters.priority) {
        paramCount++;
        query += ` AND priority = $${paramCount}`;
        params.push(filters.priority);
      }

      query += ` ORDER BY 
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END,
        created_at DESC 
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;

      params.push(limit, offset);

      const result = await queryWithMetrics(
        query,
        params,
        'select',
        'notifications'
      );

      const notifications = result.rows;

      await CacheService.set(cacheKey, notifications, 120);

      BizFlowLogger.businessLog('Notificações backend buscadas do banco', {
        empresaId: empresa_id,
        userId: user_id,
        count: notifications.length,
        filters: filters
      });

      return notifications;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.getNotifications' });
      throw error;
    }
  }

  async markAsRead(notificationId, userId) {
    try {
      const result = await queryWithMetrics(
        `UPDATE notifications 
         SET is_read = true, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND (user_id IS NULL OR user_id = $2)
         RETURNING *`,
        [notificationId, userId],
        'update',
        'notifications'
      );

      if (result.rows.length === 0) {
        throw new Error('Notificação não encontrada ou acesso negado');
      }

      const notification = result.rows[0];

      await this.invalidateNotificationCache(notification.empresa_id, userId);

      if (io) {
        io.to(`user-${userId}`).emit('notification-read', {
          ...notification,
          real_time: true
        });
      }

      BizFlowLogger.businessLog('Notificação backend marcada como lida', {
        notificationId: notification.id,
        userId: userId
      });

      return notification;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.markAsRead' });
      throw error;
    }
  }

  async markAllAsRead(empresa_id, userId) {
    try {
      const result = await queryWithMetrics(
        `UPDATE notifications 
         SET is_read = true, updated_at = CURRENT_TIMESTAMP 
         WHERE empresa_id = $1 AND (user_id IS NULL OR user_id = $2) AND is_read = false
         RETURNING COUNT(*) as updated_count`,
        [empresa_id, userId],
        'update',
        'notifications'
      );

      const updatedCount = parseInt(result.rows[0].updated_count);

      await this.invalidateNotificationCache(empresa_id, userId);

      if (io) {
        io.to(`user-${userId}`).emit('all-notifications-read', { 
          updatedCount,
          real_time: true 
        });
      }

      BizFlowLogger.businessLog('Todas notificações backend marcadas como lidas', {
        empresaId: empresa_id,
        userId: userId,
        updatedCount: updatedCount
      });

      return { updatedCount };

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.markAllAsRead' });
      throw error;
    }
  }

  async getUnreadCount(empresa_id, userId) {
    try {
      const cacheKey = `notifications:unread:${empresa_id}:${userId}`;
      
      const cached = await CacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const result = await queryWithMetrics(
        `SELECT COUNT(*) as unread_count 
         FROM notifications 
         WHERE empresa_id = $1 AND (user_id IS NULL OR user_id = $2) AND is_read = false`,
        [empresa_id, userId],
        'select',
        'notifications'
      );

      const unreadCount = parseInt(result.rows[0].unread_count);

      await CacheService.set(cacheKey, unreadCount, 60);

      return unreadCount;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.getUnreadCount' });
      throw error;
    }
  }

  async createLowStockNotification(product) {
    try {
      const notification = await this.createNotification({
        empresa_id: product.empresa_id,
        title: '⚠️ Estoque Baixo',
        message: `O produto "${product.name}" está com estoque baixo (${product.stock_quantity} unidades). Estoque mínimo: ${product.min_stock}`,
        type: 'warning',
        priority: 'high',
        metadata: {
          product_id: product.id,
          product_name: product.name,
          current_stock: product.stock_quantity,
          min_stock: product.min_stock,
          category: 'stock',
          action_required: true
        }
      });

      BizFlowLogger.businessLog('Notificação de estoque baixo backend criada', {
        productId: product.id,
        productName: product.name,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.createLowStockNotification' });
      throw error;
    }
  }

  async createSaleNotification(sale, empresa_id) {
    try {
      const notification = await this.createNotification({
        empresa_id: empresa_id,
        title: '💰 Nova Venda Realizada',
        message: `Venda ${sale.sale_code} realizada - Total: R$ ${sale.total_amount}`,
        type: 'success',
        priority: 'medium',
        metadata: {
          sale_id: sale.id,
          sale_code: sale.sale_code,
          total_amount: sale.total_amount,
          items_count: sale.total_items,
          category: 'sales'
        }
      });

      BizFlowLogger.businessLog('Notificação de venda backend criada', {
        saleId: sale.id,
        saleCode: sale.sale_code,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.createSaleNotification' });
      throw error;
    }
  }

  async invalidateNotificationCache(empresa_id, user_id) {
    try {
      const patterns = [
        `notifications:${empresa_id}:${user_id}:*`,
        `notifications:unread:${empresa_id}:${user_id}`
      ];

      for (const pattern of patterns) {
        await CacheService.delPattern(pattern);
      }

      BizFlowLogger.cacheLog('Cache de notificações backend invalidado', false, {
        empresaId: empresa_id,
        userId: user_id,
        patterns: patterns.length
      });

    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'BackendNotifications.invalidateNotificationCache' });
    }
  }
}

// ✅ SERVIÇO DE NOTIFICAÇÕES HÍBRIDO PRINCIPAL
class HybridNotificationService {
  constructor() {
    this.frontendNotifications = new FrontendNotifications();
    this.backendNotifications = new BackendNotifications();
    this.mode = IS_FRONTEND_MODE ? 'frontend' : 'backend';
  }

  async createNotification(notificationData) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendNotifications.createNotification(notificationData);
    } else {
      return await this.backendNotifications.createNotification(notificationData);
    }
  }

  async getNotifications(empresa_id, user_id, limit = 20, offset = 0, filters = {}) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendNotifications.getNotifications(empresa_id, user_id, limit, offset, filters);
    } else {
      return await this.backendNotifications.getNotifications(empresa_id, user_id, limit, offset, filters);
    }
  }

  async markAsRead(notificationId, userId) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendNotifications.markAsRead(notificationId, userId);
    } else {
      return await this.backendNotifications.markAsRead(notificationId, userId);
    }
  }

  async markAllAsRead(empresa_id, userId) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendNotifications.markAllAsRead(empresa_id, userId);
    } else {
      return await this.backendNotifications.markAllAsRead(empresa_id, userId);
    }
  }

  async getUnreadCount(empresa_id, userId) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendNotifications.getUnreadCount(empresa_id, userId);
    } else {
      return await this.backendNotifications.getUnreadCount(empresa_id, userId);
    }
  }

  async createLowStockNotification(product) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendNotifications.createLowStockNotification(product);
    } else {
      return await this.backendNotifications.createLowStockNotification(product);
    }
  }

  async createSaleNotification(sale, empresa_id) {
    if (IS_FRONTEND_MODE) {
      return await this.frontendNotifications.createSaleNotification(sale, empresa_id);
    } else {
      return await this.backendNotifications.createSaleNotification(sale, empresa_id);
    }
  }

  // ✅ MÉTODOS ESPECÍFICOS DO FRONTEND
  clearAllFrontendNotifications() {
    if (IS_FRONTEND_MODE) {
      this.frontendNotifications.clearAllNotifications();
    }
  }

  getFrontendNotificationStats(empresa_id, days = 7) {
    if (IS_FRONTEND_MODE) {
      return this.frontendNotifications.getNotificationStats(empresa_id, days);
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
const notificationService = new HybridNotificationService();
export default notificationService;

// ✅ EXPORTAR PARA USO NO BROWSER
if (IS_BROWSER) {
  window.BizFlowNotifications = notificationService;
}
