// utils/helpers.js - SISTEMA BIZFLOW FASE 5 COMPLETA
import crypto from 'crypto';

class BizFlowHelpers {
  // ✅ FORMATAR MOEDA
  formatCurrency(value, currency = 'BRL', locale = 'pt-BR') {
    if (value === null || value === undefined || isNaN(value)) {
      return 'R$ 0,00';
    }

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(value);
  }

  // ✅ FORMATAR DATA
  formatDate(date, includeTime = false) {
    if (!date) return '-';
    
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return 'Data inválida';
    }

    const options = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    };

    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }

    return dateObj.toLocaleDateString('pt-BR', options);
  }

  // ✅ CALCULAR DIFERENÇA ENTRE DATAS
  dateDiff(startDate, endDate = new Date(), unit = 'days') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);

    const units = {
      milliseconds: diffTime,
      seconds: Math.floor(diffTime / 1000),
      minutes: Math.floor(diffTime / (1000 * 60)),
      hours: Math.floor(diffTime / (1000 * 60 * 60)),
      days: Math.floor(diffTime / (1000 * 60 * 60 * 24))
    };

    return units[unit] || units.days;
  }

  // ✅ GERAR CÓDIGO ALEATÓRIO
  generateRandomCode(length = 8, type = 'alphanumeric') {
    const chars = {
      numeric: '0123456789',
      alphabetic: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      hex: '0123456789ABCDEF'
    };

    const characterSet = chars[type] || chars.alphanumeric;
    let result = '';

    for (let i = 0; i < length; i++) {
      result += characterSet.charAt(Math.floor(Math.random() * characterSet.length));
    }

    return result;
  }

  // ✅ VALIDAR E-MAIL
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // ✅ VALIDAR CPF/CNPJ
  isValidCPFCNPJ(value) {
    if (!value) return false;

    const cleanValue = value.replace(/\D/g, '');

    if (cleanValue.length === 11) {
      return this.isValidCPF(cleanValue);
    } else if (cleanValue.length === 14) {
      return this.isValidCNPJ(cleanValue);
    }

    return false;
  }

  // ✅ VALIDAR CPF
  isValidCPF(cpf) {
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
      return false;
    }

    let sum = 0;
    let remainder;

    for (let i = 1; i <= 9; i++) {
      sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }

    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++) {
      sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }

    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(10, 11))) return false;

    return true;
  }

  // ✅ VALIDAR CNPJ
  isValidCNPJ(cnpj) {
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
      return false;
    }

    let size = cnpj.length - 2;
    let numbers = cnpj.substring(0, size);
    const digits = cnpj.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += numbers.charAt(size - i) * pos--;
      if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0), 10)) return false;

    size = size + 1;
    numbers = cnpj.substring(0, size);
    sum = 0;
    pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += numbers.charAt(size - i) * pos--;
      if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1), 10)) return false;

    return true;
  }

  // ✅ MASCARAR DADOS SENSÍVEIS
  maskData(data, type = 'email') {
    if (!data) return '';

    switch (type) {
      case 'email':
        const [username, domain] = data.split('@');
        return `${username.substring(0, 2)}***@${domain}`;
      
      case 'cpf':
        return data.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.$3-**');
      
      case 'cnpj':
        return data.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.***/$4-$5');
      
      case 'phone':
        return data.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-****');
      
      default:
        return data;
    }
  }

  // ✅ CALCULAR IDADE
  calculateAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }

  // ✅ TRUNCAR TEXTO
  truncateText(text, maxLength = 100, suffix = '...') {
    if (!text || text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  // ✅ CONVERTER STRING PARA SLUG
  stringToSlug(text) {
    return text
      .toString()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }

  // ✅ GERAR HASH SEGURO
  generateHash(data, algorithm = 'sha256') {
    return crypto
      .createHash(algorithm)
      .update(data + process.env.HASH_SALT || 'bizflow-secret')
      .digest('hex');
  }

  // ✅ DEEP CLONE OBJECT
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (obj instanceof Object) {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  }

  // ✅ MERGE OBJECTS DEEP
  deepMerge(target, source) {
    const output = Object.assign({}, target);
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  // ✅ VERIFICAR SE É OBJECT
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  // ✅ DELAY PROMISE
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ✅ RETRY OPERATION COM BACKOFF
  async retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await this.delay(delay);
      }
    }
    
    throw lastError;
  }

  // ✅ CALCULAR PORCENTAGEM
  calculatePercentage(part, total, decimals = 2) {
    if (total === 0) return 0;
    return ((part / total) * 100).toFixed(decimals);
  }

  // ✅ FORMATAR BYTES PARA LEGÍVEL
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // ✅ VALIDAR URL
  isValidURL(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ✅ EXTRAIR PARÂMETROS DE URL
  getURLParams(url) {
    try {
      const urlObj = new URL(url);
      const params = {};
      
      urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      
      return params;
    } catch (error) {
      return {};
    }
  }

  // ✅ GERAR UUID
  generateUUID() {
    return crypto.randomUUID();
  }

  // ✅ CALCULAR DIGITO VERIFICADOR
  calculateCheckDigit(number) {
    let sum = 0;
    let isEven = false;

    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number.charAt(i), 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return (10 - (sum % 10)) % 10;
  }
}

export default new BizFlowHelpers();
