// utils/logger.js - SISTEMA BIZFLOW FASE 5 COMPLETA
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ FORMATO DE LOG ESTRUTURADO
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
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` | ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// ✅ CONFIGURAÇÃO DO LOGGER
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'bizflow-api',
    version: '5.5.0',
    environment: process.env.NODE_ENV || 'development'
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

// ✅ MÉTODOS PERSONALIZADOS
class BizFlowLogger {
  // Log de autenticação
  authLog(message, meta = {}) {
    logger.info(message, { ...meta, category: 'auth' });
  }

  // Log de negócio
  businessLog(message, meta = {}) {
    logger.info(message, { ...meta, category: 'business' });
  }

  // Log de performance
  performanceLog(message, duration, meta = {}) {
    logger.info(message, { ...meta, category: 'performance', duration });
  }

  // Log de segurança
  securityLog(message, meta = {}) {
    logger.warn(message, { ...meta, category: 'security' });
  }

  // Log de cache
  cacheLog(message, hit = false, meta = {}) {
    logger.debug(message, { ...meta, category: 'cache', hit });
  }

  // Log de auditoria
  auditLog(action, userId, meta = {}) {
    logger.info(`AUDIT: ${action}`, { 
      ...meta, 
      category: 'audit', 
      userId,
      timestamp: new Date().toISOString()
    });
  }

  // Log de erro estruturado
  errorLog(error, context = {}, meta = {}) {
    logger.error(error.message, {
      ...meta,
      category: 'error',
      context,
      stack: error.stack,
      name: error.name
    });
  }
}

// ✅ CRIAR PASTA DE LOGS SE NÃO EXISTIR
import fs from 'fs';
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export default new BizFlowLogger();
export { logger as winstonLogger };
