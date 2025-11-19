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
    numbers = cnpj.substring(0, size
