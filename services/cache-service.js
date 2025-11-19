// services/cache-service.js - SISTEMA DE CACHE HÍBRIDO FASE 5 COMPLETA
import BizFlowLogger from '../utils/logger.js';

class HybridCacheService {
  constructor() {
    this.memoryCache = new Map();
    this.redisEnabled = false;
    this.redis = null;
    this.hits = 0;
    this.misses = 0;
    this.isFrontendMode = typeof window !== 'undefined' || process.env.FRONTEND_MODE === 'true' || !process.env.DATABASE_URL;
    this.init();
  }

  async init() {
    try {
      // ✅ MODO FRONTEND - Usar apenas cache em memória
      if (this.isFrontendMode) {
        BizFlowLogger.businessLog('🔴 Cache Service: Modo Frontend - Cache em memória ativado');
        return;
      }

      // ✅ MODO BACKEND - Tentar conectar ao Redis se a URL estiver configurada
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

  // ✅ SET - Com fallback automático para memória
  async set(key, value, ttl = 3600) {
    try {
      // ✅ MODO FRONTEND - Sempre usar memória
      if (this.isFrontendMode) {
        this.memoryCache.set(key, {
          value,
          expires: Date.now() + (ttl * 1000)
        });
        this.cleanupMemoryCache();
        BizFlowLogger.cacheLog(`Cache SET na memória (Frontend): ${key}`, false);
        return true;
      }

      // ✅ MODO BACKEND - Tentar Redis primeiro
      if (this.redisEnabled && this.redis) {
        await this.redis.setex(key, ttl, JSON.stringify(value));
        BizFlowLogger.cacheLog(`Cache SET no Redis: ${key}`, true);
      } else {
        // Fallback para memória
        this.memoryCache.set(key, {
          value,
          expires: Date.now() + (ttl * 1000)
        });
        this.cleanupMemoryCache();
        BizFlowLogger.cacheLog(`Cache SET na memória: ${key}`, false);
      }
      return true;
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache set' });
      
      // Fallback garantido para memória em caso de erro
      this.memoryCache.set(key, {
        value,
        expires: Date.now() + (ttl * 1000)
      });
      return true;
    }
  }

  // ✅ GET - Com fallback automático para memória
  async get(key) {
    try {
      // ✅ MODO FRONTEND - Sempre usar memória
      if (this.isFrontendMode) {
        const cached = this.memoryCache.get(key);
        if (cached && cached.expires > Date.now()) {
          this.hits++;
          BizFlowLogger.cacheLog(`Cache HIT na memória (Frontend): ${key}`, false);
          return cached.value;
        } else if (cached) {
          this.memoryCache.delete(key);
        }
        this.misses++;
        BizFlowLogger.cacheLog(`Cache MISS (Frontend): ${key}`, false);
        return null;
      }

      // ✅ MODO BACKEND - Tentar Redis primeiro
      if (this.redisEnabled && this.redis) {
        const value = await this.redis.get(key);
        if (value) {
          this.hits++;
          BizFlowLogger.cacheLog(`Cache HIT no Redis: ${key}`, true);
          return JSON.parse(value);
        }
      } else {
        // Buscar na memória
        const cached = this.memoryCache.get(key);
        if (cached && cached.expires > Date.now()) {
          this.hits++;
          BizFlowLogger.cacheLog(`Cache HIT na memória: ${key}`, false);
          return cached.value;
        } else if (cached) {
          this.memoryCache.delete(key);
        }
      }
      
      this.misses++;
      BizFlowLogger.cacheLog(`Cache MISS: ${key}`, false);
      return null;
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache get' });
      
      // Fallback para memória em caso de erro
      const cached = this.memoryCache.get(key);
      if (cached && cached.expires > Date.now()) {
        return cached.value;
      }
      return null;
    }
  }

  // ✅ DELETE
  async del(key) {
    try {
      if (this.isFrontendMode) {
        this.memoryCache.delete(key);
      } else if (this.redisEnabled && this.redis) {
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
      if (this.isFrontendMode) {
        let deleted = 0;
        for (const key of this.memoryCache.keys()) {
          if (key.includes(pattern)) {
            this.memoryCache.delete(key);
            deleted++;
          }
        }
        BizFlowLogger.cacheLog(`Cache DEL pattern (Frontend): ${pattern} - ${deleted} keys`);
        return true;
      }

      if (this.redisEnabled && this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        BizFlowLogger.cacheLog(`Cache DEL pattern: ${pattern} - ${keys.length} keys`);
      } else {
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
      if (this.isFrontendMode) {
        this.memoryCache.clear();
        this.hits = 0;
        this.misses = 0;
      } else if (this.redisEnabled && this.redis) {
        await this.redis.flushdb();
      } else {
        this.memoryCache.clear();
        this.hits = 0;
        this.misses = 0;
      }
      BizFlowLogger.cacheLog('Cache FLUSH completo');
      return true;
    } catch (error) {
      BizFlowLogger.errorLog(error, { context: 'cache flush' });
      return false;
    }
  }

  // ✅ STATUS DO CACHE - ATUALIZADO PARA HÍBRIDO
  async status() {
    try {
      if (this.isFrontendMode) {
        const hitRatio = this.hits + this.misses > 0 ? 
          (this.hits / (this.hits + this.misses) * 100).toFixed(1) : 0;
        
        return {
          type: 'memory',
          mode: 'frontend',
          connected: true,
          total_keys: this.memoryCache.size,
          hits: this.hits,
          misses: this.misses,
          hit_ratio: hitRatio + '%',
          memory_used: 'Frontend Optimized'
        };
      }

      if (this.redisEnabled && this.redis) {
        const info = await this.redis.info();
        const keys = await this.redis.keys('*');
        const hitRatio = this.hits + this.misses > 0 ? 
          (this.hits / (this.hits + this.misses) * 100).toFixed(1) : 0;
        
        return {
          type: 'redis',
          mode: 'backend',
          connected: true,
          total_keys: keys.length,
          hits: this.hits,
          misses: this.misses,
          hit_ratio: hitRatio + '%',
          memory_used: info.split('\r\n').find(line => line.startsWith('used_memory_human'))?.split(':')[1] || 'unknown'
        };
      } else {
        const hitRatio = this.hits + this.misses > 0 ? 
          (this.hits / (this.hits + this.misses) * 100).toFixed(1) : 0;
        
        return {
          type: 'memory',
          mode: 'backend',
          connected: true,
          total_keys: this.memoryCache.size,
          hits: this.hits,
          misses: this.misses,
          hit_ratio: hitRatio + '%',
          memory_used: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
        };
      }
    } catch (error) {
      return {
        type: 'unknown',
        mode: this.isFrontendMode ? 'frontend' : 'backend',
        connected: false,
        error: error.message
      };
    }
  }

  // ✅ LIMPEZA PERIÓDICA DO CACHE EM MEMÓRIA
  cleanupMemoryCache() {
    if (this.memoryCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of this.memoryCache.entries()) {
        if (value.expires <= now) {
          this.memoryCache.delete(key);
        }
      }
    }
  }

  // ✅ CACHE DE SESSÕES (otimizado para híbrido)
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

    BizFlowLogger.businessLog('Cache da empresa invalidado', { 
      empresaId,
      mode: this.isFrontendMode ? 'frontend' : 'backend'
    });
  }

  // ✅ NOVO: GET MODE INFO
  getModeInfo() {
    return {
      isFrontendMode: this.isFrontendMode,
      redisEnabled: this.redisEnabled,
      totalMemoryKeys: this.memoryCache.size,
      cacheHits: this.hits,
      cacheMisses: this.misses
    };
  }

  // ✅ NOVO: RESET STATS
  resetStats() {
    this.hits = 0;
    this.misses = 0;
    BizFlowLogger.businessLog('Cache stats resetados');
  }
}

// Singleton pattern
export default new HybridCacheService();
