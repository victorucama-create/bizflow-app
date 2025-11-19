// services/cache-service.js - SISTEMA DE CACHE COM FALLBACK FASE 5 COMPLETA
import BizFlowLogger from '../utils/logger.js';

class CacheService {
  constructor() {
    this.memoryCache = new Map();
    this.redisEnabled = false;
    this.redis = null;
    this.init();
  }

  async init() {
    try {
      // Tentar conectar ao Redis se a URL estiver configurada
      if (process.env.REDIS_URL) {
        const Redis = (await import('ioredis')).default;
        this.redis = new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryDelayOnFailover: 100
        });

        this.redis.on('connect', () => {
          this.redisEnabled = true;
          BizFlowLogger.businessLog('✅ Redis conectado - cache distribuído ativado');
        });

        this.redis.on('error', (error) => {
          this.redisEnabled = false;
          BizFlowLogger.errorLog(error, { context: 'Redis connection' });
        });

        await this.redis.connect();
      } else {
        BizFlowLogger.businessLog('⚠️  Redis não configurado - usando cache em memória');
      }
    } catch (error) {
      this.redisEnabled = false;
      BizFlowLogger.errorLog(error, { context: 'Cache service init' });
    }
  }

  // ✅ SET - Com fallback para memória
  async set(key, value, ttl = 3600) {
    try {
      if (this.redisEnabled && this.redis) {
        await this.redis.setex(key, ttl, JSON.stringify(value));
        BizFlowLogger.cacheLog(`Cache SET no Redis: ${key}`, true);
      } else {
        // Cache em memória com TTL
        this.memoryCache.set(key, {
          value,
          expires: Date.now() + (ttl * 1000)
        });
        
        // Limpar expired entries periodicamente
        this.cleanupMemoryCache();
        
        BizFlowLogger.cacheLog(`Cache SET na memória: ${key}`, false);
      }
      return true;
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache set' });
      return false;
    }
  }

  // ✅ GET - Com fallback para memória
  async get(key) {
    try {
      if (this.redisEnabled && this.redis) {
        const value = await this.redis.get(key);
        if (value) {
          BizFlowLogger.cacheLog(`Cache HIT no Redis: ${key}`, true);
          return JSON.parse(value);
        }
      } else {
        // Buscar na memória
        const cached = this.memoryCache.get(key);
        if (cached && cached.expires > Date.now()) {
          BizFlowLogger.cacheLog(`Cache HIT na memória: ${key}`, false);
          return cached.value;
        } else if (cached) {
          // Remover expired
          this.memoryCache.delete(key);
        }
      }
      
      BizFlowLogger.cacheLog(`Cache MISS: ${key}`, false);
      return null;
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache get' });
      return null;
    }
  }

  // ✅ DELETE
  async del(key) {
    try {
      if (this.redisEnabled && this.redis) {
        await this.redis.del(key);
      } else {
        this.memoryCache.delete(key);
      }
      BizFlowLogger.cacheLog(`Cache DEL: ${key}`);
      return true;
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache del' });
      return false;
    }
  }

  // ✅ DELETE MULTIPLAS CHAVES
  async delPattern(pattern) {
    try {
      if (this.redisEnabled && this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        BizFlowLogger.cacheLog(`Cache DEL pattern: ${pattern} - ${keys.length} keys`);
      } else {
        // Para memória, precisamos iterar
        let deleted = 0;
        for (const key of this.memoryCache.keys()) {
          if (key.includes(pattern)) {
            this.memoryCache.delete(key);
            deleted++;
          }
        }
        BizFlowLogger.cacheLog(`Cache DEL pattern: ${pattern} - ${deleted} keys`);
      }
      return true;
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache del pattern' });
      return false;
    }
  }

  // ✅ FLUSH ALL
  async flush() {
    try {
      if (this.redisEnabled && this.redis) {
        await this.redis.flushdb();
      } else {
        this.memoryCache.clear();
      }
      BizFlowLogger.cacheLog('Cache FLUSH completo');
      return true;
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache flush' });
      return false;
    }
  }

  // ✅ STATUS DO CACHE
  async status() {
    try {
      if (this.redisEnabled && this.redis) {
        const info = await this.redis.info();
        const keys = await this.redis.keys('*');
        
        return {
          type: 'redis',
          connected: true,
          total_keys: keys.length,
          memory_used: info.split('\r\n').find(line => line.startsWith('used_memory_human'))?.split(':')[1] || 'unknown'
        };
      } else {
        return {
          type: 'memory',
          connected: true,
          total_keys: this.memoryCache.size,
          memory_used: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
        };
      }
    } catch (error) {
      return {
        type: 'unknown',
        connected: false,
        error: error.message
      };
    }
  }

  // ✅ LIMPEZA PERIÓDICA DO CACHE EM MEMÓRIA
  cleanupMemoryCache() {
    // Limpar a cada 100 operações para performance
    if (this.memoryCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of this.memoryCache.entries()) {
        if (value.expires <= now) {
          this.memoryCache.delete(key);
        }
      }
    }
  }

  // ✅ CACHE DE SESSÕES (otimizado)
  async cacheSession(token, userData, ttl = 3600) {
    return await this.set(`session:${token}`, userData, ttl);
  }

  async getSession(token) {
    return await this.get(`session:${token}`);
  }

  async deleteSession(token) {
    return await this.del(`session:${token}`);
  }

  // ✅ CACHE DE DADOS (estratégias específicas)
  async cacheDashboard(empresaId, data, ttl = 300) {
    return await this.set(`cache:dashboard:${empresaId}`, data, ttl);
  }

  async getDashboard(empresaId) {
    return await this.get(`cache:dashboard:${empresaId}`);
  }

  async cacheProducts(empresaId, data, ttl = 120) {
    return await this.set(`cache:products:${empresaId}`, data, ttl);
  }

  async getProducts(empresaId) {
    return await this.get(`cache:products:${empresaId}`);
  }

  async cacheReports(empresaId, reportType, data, ttl = 600) {
    return await this.set(`cache:reports:${empresaId}:${reportType}`, data, ttl);
  }

  async getReports(empresaId, reportType) {
    return await this.get(`cache:reports:${empresaId}:${reportType}`);
  }

  // ✅ INVALIDAR CACHE POR EMPRESA
  async invalidateEmpresaCache(empresaId) {
    const patterns = [
      `cache:dashboard:${empresaId}`,
      `cache:products:${empresaId}`,
      `cache:reports:${empresaId}:*`
    ];

    for (const pattern of patterns) {
      await this.delPattern(pattern);
    }

    BizFlowLogger.businessLog('Cache da empresa invalidado', { empresaId });
  }
}

// Singleton pattern
export default new CacheService();
