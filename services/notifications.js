// services/notifications.js - SISTEMA BIZFLOW FASE 5 COMPLETA - VERSÃO COMPLETA
import { queryWithMetrics, logger, io } from '../core/server.js';
import CacheService from './cache-service.js';

class NotificationService {
  // ✅ CRIAR NOTIFICAÇÃO COM CACHE SERVICE - COMPLETO
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

      // Validar dados obrigatórios
      if (!empresa_id || !title || !message) {
        throw new Error('Empresa ID, título e mensagem são obrigatórios');
      }

      // Inserir notificação no banco
      const result = await queryWithMetrics(
        `INSERT INTO notifications (empresa_id, user_id, title, message, type, metadata, priority) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING *`,
        [empresa_id, user_id, title, message, type, JSON.stringify(metadata), priority],
        'insert',
        'notifications'
      );

      const notification = result.rows[0];

      // Emitir via WebSocket em tempo real
      this.emitNotification(notification);

      // ✅ INVALIDAR CACHE USANDO CACHE SERVICE
      await this.invalidateNotificationCache(empresa_id, user_id);

      logger.businessLog('Notificação criada', {
        notificationId: notification.id,
        empresaId: empresa_id,
        userId: user_id,
        type: type,
        priority: priority
      });

      return notification;

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.createNotification' });
      throw error;
    }
  }

  // ✅ EMITIR NOTIFICAÇÃO VIA WEBSOCKET - COMPLETO
  emitNotification(notification) {
    try {
      if (io) {
        // Notificação específica para usuário
        if (notification.user_id) {
          io.to(`user-${notification.user_id}`).emit('new-notification', {
            ...notification,
            real_time: true
          });
        }
        
        // Notificação geral para a empresa
        io.to(`empresa-${notification.empresa_id}`).emit('company-notification', {
          ...notification,
          real_time: true
        });
        
        logger.cacheLog('Notificação emitida via WebSocket', true, {
          notificationId: notification.id,
          empresaId: notification.empresa_id,
          userId: notification.user_id
        });
      }
    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.emitNotification' });
    }
  }

  // ✅ BUSCAR NOTIFICAÇÕES COM CACHE SERVICE - COMPLETO
  async getNotifications(empresa_id, user_id, limit = 20, offset = 0, filters = {}) {
    try {
      const cacheKey = `notifications:${empresa_id}:${user_id}:${limit}:${offset}:${JSON.stringify(filters)}`;
      
      // ✅ TENTAR CACHE SERVICE PRIMEIRO
      const cached = await CacheService.get(cacheKey);
      if (cached) {
        logger.cacheLog('Notificações recuperadas do cache', true, { 
          empresa_id, 
          user_id,
          count: cached.length 
        });
        return cached;
      }

      // Construir query com filtros
      let query = `
        SELECT * FROM notifications 
        WHERE empresa_id = $1 AND (user_id IS NULL OR user_id = $2)
      `;
      const params = [empresa_id, user_id];
      let paramCount = 2;

      // Aplicar filtros
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

      // Ordenação e paginação
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

      // ✅ SALVAR NO CACHE SERVICE
      await CacheService.set(cacheKey, notifications, 120); // 2 minutos

      logger.businessLog('Notificações buscadas do banco', {
        empresaId: empresa_id,
        userId: user_id,
        count: notifications.length,
        filters: filters
      });

      return notifications;

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.getNotifications' });
      throw error;
    }
  }

  // ✅ MARCAR NOTIFICAÇÃO COMO LIDA - COMPLETO
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

      // ✅ INVALIDAR CACHE
      await this.invalidateNotificationCache(notification.empresa_id, userId);

      // Emitir atualização via WebSocket
      if (io) {
        io.to(`user-${userId}`).emit('notification-read', {
          ...notification,
          real_time: true
        });
      }

      logger.businessLog('Notificação marcada como lida', {
        notificationId: notification.id,
        userId: userId
      });

      return notification;

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.markAsRead' });
      throw error;
    }
  }

  // ✅ MARCAR TODAS COMO LIDAS - COMPLETO
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

      // ✅ INVALIDAR CACHE
      await this.invalidateNotificationCache(empresa_id, userId);

      // Emitir via WebSocket
      if (io) {
        io.to(`user-${userId}`).emit('all-notifications-read', { 
          updatedCount,
          real_time: true 
        });
      }

      logger.businessLog('Todas notificações marcadas como lidas', {
        empresaId: empresa_id,
        userId: userId,
        updatedCount: updatedCount
      });

      return { updatedCount };

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.markAllAsRead' });
      throw error;
    }
  }

  // ✅ CONTAR NOTIFICAÇÕES NÃO LIDAS COM CACHE SERVICE - COMPLETO
  async getUnreadCount(empresa_id, userId) {
    try {
      const cacheKey = `notifications:unread:${empresa_id}:${userId}`;
      
      // ✅ TENTAR CACHE SERVICE PRIMEIRO
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

      // ✅ SALVAR NO CACHE SERVICE (1 minuto - dados frequentes)
      await CacheService.set(cacheKey, unreadCount, 60);

      return unreadCount;

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.getUnreadCount' });
      throw error;
    }
  }

  // ✅ NOTIFICAÇÃO DE ESTOQUE BAIXO - COMPLETO
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

      logger.businessLog('Notificação de estoque baixo criada', {
        productId: product.id,
        productName: product.name,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.createLowStockNotification' });
      throw error;
    }
  }

  // ✅ NOTIFICAÇÃO DE VENDA - COMPLETO
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

      logger.businessLog('Notificação de venda criada', {
        saleId: sale.id,
        saleCode: sale.sale_code,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.createSaleNotification' });
      throw error;
    }
  }

  // ✅ NOTIFICAÇÃO DE ERRO DO SISTEMA - COMPLETO
  async createSystemErrorNotification(error, context, empresa_id = 1) {
    try {
      const notification = await this.createNotification({
        empresa_id: empresa_id,
        user_id: null, // Para todos os usuários
        title: '🚨 Erro do Sistema',
        message: `Erro no sistema: ${error.message}. Contexto: ${context}`,
        type: 'error',
        priority: 'high',
        metadata: {
          error_message: error.message,
          error_stack: error.stack,
          context: context,
          timestamp: new Date().toISOString(),
          category: 'system_error',
          urgent: true
        }
      });

      logger.securityLog('Notificação de erro do sistema criada', {
        error: error.message,
        context: context,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      // Fallback para log se o sistema de notificações estiver com problemas
      logger.errorLog(error, { context: 'NotificationService.createSystemErrorNotification' });
    }
  }

  // ✅ NOTIFICAÇÃO DE BACKUP - COMPLETO
  async createBackupNotification(backupResult, empresa_id = 1) {
    try {
      const notification = await this.createNotification({
        empresa_id: empresa_id,
        user_id: null,
        title: backupResult.success ? '✅ Backup Realizado' : '❌ Falha no Backup',
        message: backupResult.success 
          ? `Backup realizado com sucesso. Tamanho: ${backupResult.size}`
          : `Falha no backup: ${backupResult.error}`,
        type: backupResult.success ? 'info' : 'error',
        priority: backupResult.success ? 'low' : 'high',
        metadata: {
          backup_type: 'system',
          success: backupResult.success,
          size: backupResult.size,
          timestamp: new Date().toISOString(),
          category: 'backup'
        }
      });

      logger.businessLog('Notificação de backup criada', {
        success: backupResult.success,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.createBackupNotification' });
    }
  }

  // ✅ INVALIDAR CACHE USANDO CACHE SERVICE - COMPLETO
  async invalidateNotificationCache(empresa_id, user_id) {
    try {
      const patterns = [
        `notifications:${empresa_id}:${user_id}:*`,
        `notifications:unread:${empresa_id}:${user_id}`
      ];

      for (const pattern of patterns) {
        await CacheService.delPattern(pattern);
      }

      logger.cacheLog('Cache de notificações invalidado', false, {
        empresaId: empresa_id,
        userId: user_id,
        patterns: patterns.length
      });

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.invalidateNotificationCache' });
    }
  }

  // ✅ LIMPAR NOTIFICAÇÕES ANTIGAS - COMPLETO
  async cleanupOldNotifications(daysToKeep = 30) {
    try {
      const result = await queryWithMetrics(
        `DELETE FROM notifications 
         WHERE created_at < CURRENT_DATE - INTERVAL '${daysToKeep} days' 
         AND is_read = true
         RETURNING COUNT(*) as deleted_count`,
        [],
        'delete',
        'notifications'
      );

      const deletedCount = parseInt(result.rows[0].deleted_count);

      logger.businessLog('Notificações antigas limpas', {
        daysToKeep: daysToKeep,
        deletedCount: deletedCount
      });

      return { deletedCount };

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.cleanupOldNotifications' });
      throw error;
    }
  }

  // ✅ ESTATÍSTICAS DE NOTIFICAÇÕES - COMPLETO
  async getNotificationStats(empresa_id, days = 7) {
    try {
      const result = await queryWithMetrics(
        `SELECT 
          type,
          priority,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_read = true) as read_count,
          COUNT(*) FILTER (WHERE is_read = false) as unread_count
        FROM notifications
        WHERE empresa_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY type, priority
        ORDER BY total DESC`,
        [empresa_id],
        'select',
        'notifications'
      );

      const stats = {
        period: `${days} dias`,
        total: 0,
        by_type: {},
        by_priority: {},
        read_rate: 0
      };

      result.rows.forEach(row => {
        stats.total += row.total;
        stats.by_type[row.type] = (stats.by_type[row.type] || 0) + row.total;
        stats.by_priority[row.priority] = (stats.by_priority[row.priority] || 0) + row.total;
      });

      if (stats.total > 0) {
        const totalRead = result.rows.reduce((sum, row) => sum + row.read_count, 0);
        stats.read_rate = (totalRead / stats.total) * 100;
      }

      return stats;

    } catch (error) {
      logger.errorLog(error, { context: 'NotificationService.getNotificationStats' });
      throw error;
    }
  }
}

export default new NotificationService();
