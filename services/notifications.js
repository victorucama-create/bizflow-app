// services/notifications.js - SISTEMA BIZFLOW FASE 5 COMPLETA
import { queryWithMetrics, redis, logger, io } from '../core/server.js';

class NotificationService {
  // ✅ CRIAR NOTIFICAÇÃO
  async createNotification(notificationData) {
    try {
      const { 
        empresa_id, 
        user_id = null, 
        title, 
        message, 
        type = 'info',
        metadata = {} 
      } = notificationData;

      // Validar dados obrigatórios
      if (!empresa_id || !title || !message) {
        throw new Error('Empresa ID, título e mensagem são obrigatórios');
      }

      // Inserir notificação no banco
      const result = await queryWithMetrics(
        `INSERT INTO notifications (empresa_id, user_id, title, message, type, metadata) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [empresa_id, user_id, title, message, type, JSON.stringify(metadata)],
        'insert',
        'notifications'
      );

      const notification = result.rows[0];

      // Emitir via WebSocket em tempo real
      this.emitNotification(notification);

      // Invalidar cache de notificações
      await this.invalidateNotificationCache(empresa_id, user_id);

      logger.businessLog('Notificação criada', {
        notificationId: notification.id,
        empresaId: empresa_id,
        userId: user_id,
        type: type
      });

      return notification;

    } catch (error) {
      logger.errorLog(error, { context: 'createNotification' });
      throw error;
    }
  }

  // ✅ EMITIR NOTIFICAÇÃO VIA WEBSOCKET
  emitNotification(notification) {
    try {
      if (io) {
        // Notificação específica para usuário
        if (notification.user_id) {
          io.to(`user-${notification.user_id}`).emit('new-notification', notification);
        }
        
        // Notificação geral para a empresa
        io.to(`empresa-${notification.empresa_id}`).emit('company-notification', notification);
        
        logger.cacheLog('Notificação emitida via WebSocket', true, {
          notificationId: notification.id,
          empresaId: notification.empresa_id,
          userId: notification.user_id
        });
      }
    } catch (error) {
      logger.errorLog(error, { context: 'emitNotification' });
    }
  }

  // ✅ BUSCAR NOTIFICAÇÕES COM CACHE
  async getNotifications(empresa_id, user_id, limit = 20, offset = 0) {
    try {
      const cacheKey = `notifications:${empresa_id}:${user_id}:${limit}:${offset}`;
      
      // Tentar cache primeiro
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.cacheLog('Notificações recuperadas do cache', true, { empresa_id, user_id });
        return JSON.parse(cached);
      }

      // Query para buscar notificações
      let query = `
        SELECT * FROM notifications 
        WHERE empresa_id = $1 AND (user_id IS NULL OR user_id = $2)
        ORDER BY created_at DESC 
        LIMIT $3 OFFSET $4
      `;
      const params = [empresa_id, user_id, limit, offset];

      const result = await queryWithMetrics(
        query,
        params,
        'select',
        'notifications'
      );

      const notifications = result.rows;

      // Salvar no cache por 2 minutos
      await redis.setex(cacheKey, 120, JSON.stringify(notifications));

      logger.businessLog('Notificações buscadas do banco', {
        empresaId: empresa_id,
        userId: user_id,
        count: notifications.length
      });

      return notifications;

    } catch (error) {
      logger.errorLog(error, { context: 'getNotifications' });
      throw error;
    }
  }

  // ✅ MARCAR NOTIFICAÇÃO COMO LIDA
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

      // Invalidar cache
      await this.invalidateNotificationCache(notification.empresa_id, userId);

      // Emitir atualização via WebSocket
      if (io) {
        io.to(`user-${userId}`).emit('notification-read', notification);
      }

      logger.businessLog('Notificação marcada como lida', {
        notificationId: notification.id,
        userId: userId
      });

      return notification;

    } catch (error) {
      logger.errorLog(error, { context: 'markAsRead' });
      throw error;
    }
  }

  // ✅ MARCAR TODAS COMO LIDAS
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

      // Invalidar cache
      await this.invalidateNotificationCache(empresa_id, userId);

      // Emitir via WebSocket
      if (io) {
        io.to(`user-${userId}`).emit('all-notifications-read', { updatedCount });
      }

      logger.businessLog('Todas notificações marcadas como lidas', {
        empresaId: empresa_id,
        userId: userId,
        updatedCount: updatedCount
      });

      return { updatedCount };

    } catch (error) {
      logger.errorLog(error, { context: 'markAllAsRead' });
      throw error;
    }
  }

  // ✅ CONTAR NOTIFICAÇÕES NÃO LIDAS
  async getUnreadCount(empresa_id, userId) {
    try {
      const cacheKey = `notifications:unread:${empresa_id}:${userId}`;
      
      // Tentar cache primeiro
      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseInt(cached);
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

      // Salvar no cache por 1 minuto (dados frequentemente atualizados)
      await redis.setex(cacheKey, 60, unreadCount.toString());

      return unreadCount;

    } catch (error) {
      logger.errorLog(error, { context: 'getUnreadCount' });
      throw error;
    }
  }

  // ✅ NOTIFICAÇÃO DE ESTOQUE BAIXO
  async createLowStockNotification(product) {
    try {
      const notification = await this.createNotification({
        empresa_id: product.empresa_id,
        title: 'Estoque Baixo',
        message: `O produto "${product.name}" está com estoque baixo (${product.stock_quantity} unidades). Estoque mínimo: ${product.min_stock}`,
        type: 'warning',
        metadata: {
          product_id: product.id,
          product_name: product.name,
          current_stock: product.stock_quantity,
          min_stock: product.min_stock,
          category: 'stock'
        }
      });

      logger.businessLog('Notificação de estoque baixo criada', {
        productId: product.id,
        productName: product.name,
        notificationId: notification.id
      });

      return notification;

    } catch (error) {
      logger.errorLog(error, { context: 'createLowStockNotification' });
      throw error;
    }
  }

  // ✅ NOTIFICAÇÃO DE VENDA
  async createSaleNotification(sale, empresa_id) {
    try {
      const notification = await this.createNotification({
        empresa_id: empresa_id,
        title: 'Nova Venda Realizada',
        message: `Venda ${sale.sale_code} realizada - Total: R$ ${sale.total_amount}`,
        type: 'success',
        metadata: {
          sale_id: sale.id,
          sale_code: sale.sale_code,
          total_amount: sale.total_amount,
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
      logger.errorLog(error, { context: 'createSaleNotification' });
      throw error;
    }
  }

  // ✅ NOTIFICAÇÃO DE ERRO DO SISTEMA
  async createSystemErrorNotification(error, context, empresa_id = 1) {
    try {
      const notification = await this.createNotification({
        empresa_id: empresa_id,
        user_id: null, // Para todos os usuários
        title: 'Erro do Sistema',
        message: `Erro no sistema: ${error.message}. Contexto: ${context}`,
        type: 'error',
        metadata: {
          error_message: error.message,
          error_stack: error.stack,
          context: context,
          timestamp: new Date().toISOString(),
          category: 'system_error'
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
      logger.errorLog(error, { context: 'createSystemErrorNotification' });
    }
  }

  // ✅ INVALIDAR CACHE DE NOTIFICAÇÕES
  async invalidateNotificationCache(empresa_id, user_id) {
    try {
      const pattern = `notifications:${empresa_id}:${user_id}:*`;
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.cacheLog('Cache de notificações invalidado', false, {
          empresaId: empresa_id,
          userId: user_id,
          keysDeleted: keys.length
        });
      }

      // Invalidar contador de não lidas também
      await redis.del(`notifications:unread:${empresa_id}:${user_id}`);

    } catch (error) {
      logger.errorLog(error, { context: 'invalidateNotificationCache' });
    }
  }

  // ✅ LIMPAR NOTIFICAÇÕES ANTIGAS
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
      logger.errorLog(error, { context: 'cleanupOldNotifications' });
      throw error;
    }
  }
}

export default new NotificationService();
