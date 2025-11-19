// utils/logger.js - SISTEMA BIZFLOW FASE 5 COMPLETA HÍBRIDO
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ DETECÇÃO AUTOMÁTICA DE AMBIENTE
const IS_FRONTEND_MODE = typeof window !== 'undefined' || process.env.FRONTEND_MODE === 'true';
const IS_BROWSER = typeof window !== 'undefined';
const MODE = IS_FRONTEND_MODE ? 'FRONTEND' : 'BACKEND';

// ✅ FORMATO DE LOG ESTRUTURADO (Backend)
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ✅ FORMATO PARA CONSOLE (mais legível)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}] [${MODE}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` | ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// ✅ LOGGER DO BACKEND (Winston)
let backendLogger;

if (!IS_FRONTEND_MODE) {
  // ✅ CONFIGURAÇÃO DO LOGGER BACKEND
  backendLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: {
      service: 'bizflow-api',
      version: '5.6.0',
      environment: process.env.NODE_ENV || 'development',
      mode: 'backend'
    },
    transports: [
      // Console transport (desenvolvimento)
      new winston.transports.Console({
        format: consoleFormat,
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
      }),

      // File transport - Errors
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true
      }),

      // File transport - Combined (produção)
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/combined.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 3,
        tailable: true
      }),

      // File transport - Audit (ações importantes)
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/audit.log'),
        level: 'info',
        maxsize: 5 * 1024 * 1024, // 5MB
        maxFiles: 3,
        tailable: true
      })
    ],

    // ✅ TRATAMENTO DE EXCEÇÕES NÃO CAPTURADAS
    exceptionHandlers: [
      new winston.transports.File({ 
        filename: path.join(__dirname, '../logs/exceptions.log') 
      }),
      new winston.transports.Console()
    ],

    rejectionHandlers: [
      new winston.transports.File({ 
        filename: path.join(__dirname, '../logs/rejections.log') 
      }),
      new winston.transports.Console()
    ]
  });

  // ✅ CRIAR PASTA DE LOGS SE NÃO EXISTIR (Backend)
  import fs from 'fs';
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// ✅ LOGGER DO FRONTEND (Console + LocalStorage)
class FrontendLogger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    this.maxLogs = 1000; // Máximo de logs no localStorage
    this.init();
  }

  init() {
    // Inicializar estrutura de logs no localStorage
    if (!this.getLogs()) {
      this.saveLogs([]);
    }
  }

  getLogs() {
    try {
      const logs = localStorage.getItem('bizflow_logs');
      return logs ? JSON.parse(logs) : null;
    } catch (error) {
      return null;
    }
  }

  saveLogs(logs) {
    try {
      localStorage.setItem('bizflow_logs', JSON.stringify(logs));
    } catch (error) {
      console.error('Erro ao salvar logs:', error);
    }
  }

  addLog(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta: { ...meta, mode: 'frontend' },
      id: Date.now() + Math.random().toString(36).substr(2, 9)
    };

    // Adicionar ao console
    const colors = {
      error: '🔴',
      warn: '🟡',
      info: '🔵',
      debug: '🟢'
    };

    console.log(
      `${colors[level] || '⚪'} [${logEntry.timestamp}] [FRONTEND] [${level.toUpperCase()}]: ${message}`,
      meta
    );

    // Salvar no localStorage
    const logs = this.getLogs() || [];
    logs.push(logEntry);

    // Manter apenas os últimos N logs
    if (logs.length > this.maxLogs) {
      logs.splice(0, logs.length - this.maxLogs);
    }

    this.saveLogs(logs);
  }

  error(message, meta = {}) {
    this.addLog('error', message, meta);
  }

  warn(message, meta = {}) {
    this.addLog('warn', message, meta);
  }

  info(message, meta = {}) {
    this.addLog('info', message, meta);
  }

  debug(message, meta = {}) {
    this.addLog('debug', message, meta);
  }

  // Exportar logs
  exportLogs() {
    const logs = this.getLogs() || [];
    const blob = new Blob([JSON.stringify(logs, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bizflow-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Limpar logs
  clearLogs() {
    this.saveLogs([]);
  }

  // Estatísticas dos logs
  getStats() {
    const logs = this.getLogs() || [];
    const stats = {
      total: logs.length,
      byLevel: {},
      last24h: 0
    };

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    logs.forEach(log => {
      // Contar por nível
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      
      // Contar últimas 24h
      if (new Date(log.timestamp) > dayAgo) {
        stats.last24h++;
      }
    });

    return stats;
  }
}

// ✅ LOGGER PRINCIPAL HÍBRIDO
class BizFlowLogger {
  constructor() {
    this.frontendLogger = IS_BROWSER ? new FrontendLogger() : null;
    this.mode = MODE;
  }

  // ✅ LOG DE AUTENTICAÇÃO
  authLog(message, meta = {}) {
    const enhancedMeta = { ...meta, category: 'auth', mode: this.mode.toLowerCase() };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.info(`🔐 ${message}`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.info(message, enhancedMeta);
    } else {
      console.log(`🔐 [${this.mode}] ${message}`, enhancedMeta);
    }
  }

  // ✅ LOG DE NEGÓCIO
  businessLog(message, meta = {}) {
    const enhancedMeta = { ...meta, category: 'business', mode: this.mode.toLowerCase() };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.info(`📊 ${message}`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.info(message, enhancedMeta);
    } else {
      console.log(`📊 [${this.mode}] ${message}`, enhancedMeta);
    }
  }

  // ✅ LOG DE PERFORMANCE
  performanceLog(message, duration, meta = {}) {
    const enhancedMeta = { ...meta, category: 'performance', duration, mode: this.mode.toLowerCase() };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.info(`⚡ ${message} (${duration}ms)`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.info(`${message} (${duration}ms)`, enhancedMeta);
    } else {
      console.log(`⚡ [${this.mode}] ${message} (${duration}ms)`, enhancedMeta);
    }
  }

  // ✅ LOG DE SEGURANÇA
  securityLog(message, meta = {}) {
    const enhancedMeta = { ...meta, category: 'security', mode: this.mode.toLowerCase() };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.warn(`🛡️ ${message}`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.warn(message, enhancedMeta);
    } else {
      console.warn(`🛡️ [${this.mode}] ${message}`, enhancedMeta);
    }
  }

  // ✅ LOG DE CACHE
  cacheLog(message, hit = false, meta = {}) {
    const cacheType = hit ? 'HIT' : 'MISS';
    const enhancedMeta = { ...meta, category: 'cache', hit, mode: this.mode.toLowerCase() };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.debug(`🔴 ${cacheType} ${message}`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.debug(`${cacheType} ${message}`, enhancedMeta);
    } else {
      console.debug(`🔴 [${this.mode}] ${cacheType} ${message}`, enhancedMeta);
    }
  }

  // ✅ LOG DE AUDITORIA
  auditLog(action, userId, meta = {}) {
    const message = `AUDIT: ${action}`;
    const enhancedMeta = { 
      ...meta, 
      category: 'audit', 
      userId,
      timestamp: new Date().toISOString(),
      mode: this.mode.toLowerCase()
    };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.info(`📝 ${message}`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.info(message, enhancedMeta);
    } else {
      console.log(`📝 [${this.mode}] ${message}`, enhancedMeta);
    }
  }

  // ✅ LOG DE ERRO ESTRUTURADO
  errorLog(error, context = {}, meta = {}) {
    const enhancedMeta = {
      ...meta,
      category: 'error',
      context,
      stack: error.stack,
      name: error.name,
      mode: this.mode.toLowerCase()
    };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.error(`❌ ${error.message}`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.error(error.message, enhancedMeta);
    } else {
      console.error(`❌ [${this.mode}] ${error.message}`, enhancedMeta);
    }
  }

  // ✅ LOG DE SUCESSO
  successLog(message, meta = {}) {
    const enhancedMeta = { ...meta, category: 'success', mode: this.mode.toLowerCase() };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.info(`✅ ${message}`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.info(message, enhancedMeta);
    } else {
      console.log(`✅ [${this.mode}] ${message}`, enhancedMeta);
    }
  }

  // ✅ LOG DE INFORMAÇÃO
  infoLog(message, meta = {}) {
    const enhancedMeta = { ...meta, category: 'info', mode: this.mode.toLowerCase() };
    
    if (IS_FRONTEND_MODE && this.frontendLogger) {
      this.frontendLogger.info(`ℹ️ ${message}`, enhancedMeta);
    } else if (backendLogger) {
      backendLogger.info(message, enhancedMeta);
    } else {
      console.log(`ℹ️ [${this.mode}] ${message}`, enhancedMeta);
    }
  }

  // ✅ MÉTODOS ESPECÍFICOS DO FRONTEND
  exportFrontendLogs() {
    if (this.frontendLogger) {
      this.frontendLogger.exportLogs();
    }
  }

  clearFrontendLogs() {
    if (this.frontendLogger) {
      this.frontendLogger.clearLogs();
    }
  }

  getFrontendLogStats() {
    if (this.frontendLogger) {
      return this.frontendLogger.getStats();
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
const bizFlowLogger = new BizFlowLogger();
export default bizFlowLogger;

// ✅ EXPORTAR LOGGER DO WINSTON (apenas backend)
export { backendLogger as winstonLogger };

// ✅ EXPORTAR PARA USO NO BROWSER
if (IS_BROWSER) {
  window.BizFlowLogger = bizFlowLogger;
}
