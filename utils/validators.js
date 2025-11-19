// utils/validators.js - SISTEMA BIZFLOW FASE 5 COMPLETA
import validator from 'validator';
import Joi from 'joi';

class BizFlowValidators {
  // ✅ VALIDAÇÃO DE EMAIL
  validateEmail(email) {
    if (!email) return { isValid: false, error: 'Email é obrigatório' };
    
    const isValid = validator.isEmail(email);
    return {
      isValid,
      error: isValid ? null : 'Email inválido',
      normalized: isValid ? validator.normalizeEmail(email) : null
    };
  }

  // ✅ VALIDAÇÃO DE SENHA FORTE
  validatePassword(password) {
    if (!password) return { isValid: false, error: 'Senha é obrigatória' };
    
    const checks = {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };

    const isValid = Object.values(checks).every(Boolean);
    const missing = Object.keys(checks).filter(key => !checks[key]);

    return {
      isValid,
      error: isValid ? null : `Senha fraca. Requisitos: ${missing.join(', ')}`,
      checks
    };
  }

  // ✅ VALIDAÇÃO DE CNPJ
  validateCNPJ(cnpj) {
    if (!cnpj) return { isValid: false, error: 'CNPJ é obrigatório' };
    
    const cleanCNPJ = cnpj.replace(/\D/g, '');
    
    if (cleanCNPJ.length !== 14) {
      return { isValid: false, error: 'CNPJ deve ter 14 dígitos' };
    }

    // Elimina CNPJs inválidos conhecidos
    if (/^(\d)\1+$/.test(cleanCNPJ)) {
      return { isValid: false, error: 'CNPJ inválido' };
    }

    // Valida dígitos verificadores
    let size = cleanCNPJ.length - 2;
    let numbers = cleanCNPJ.substring(0, size);
    const digits = cleanCNPJ.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += numbers.charAt(size - i) * pos--;
      if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0), 10)) {
      return { isValid: false, error: 'CNPJ inválido' };
    }

    size = size + 1;
    numbers = cleanCNPJ.substring(0, size);
    sum = 0;
    pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += numbers.charAt(size - i) * pos--;
      if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1), 10)) {
      return { isValid: false, error: 'CNPJ inválido' };
    }

    return { isValid: true, error: null, normalized: cleanCNPJ };
  }

  // ✅ VALIDAÇÃO DE TELEFONE
  validatePhone(phone) {
    if (!phone) return { isValid: false, error: 'Telefone é obrigatório' };
    
    const cleanPhone = phone.replace(/\D/g, '');
    const isValid = cleanPhone.length >= 10 && cleanPhone.length <= 11;
    
    return {
      isValid,
      error: isValid ? null : 'Telefone inválido',
      normalized: isValid ? cleanPhone : null
    };
  }

  // ✅ VALIDAÇÃO DE PREÇO
  validatePrice(price) {
    if (price === undefined || price === null) {
      return { isValid: false, error: 'Preço é obrigatório' };
    }

    const numPrice = parseFloat(price);
    const isValid = !isNaN(numPrice) && numPrice >= 0;

    return {
      isValid,
      error: isValid ? null : 'Preço deve ser um número positivo',
      normalized: isValid ? numPrice : null
    };
  }

  // ✅ VALIDAÇÃO DE ESTOQUE
  validateStockQuantity(quantity) {
    if (quantity === undefined || quantity === null) {
      return { isValid: false, error: 'Quantidade é obrigatória' };
    }

    const numQuantity = parseInt(quantity);
    const isValid = !isNaN(numQuantity) && numQuantity >= 0;

    return {
      isValid,
      error: isValid ? null : 'Quantidade deve ser um número inteiro positivo',
      normalized: isValid ? numQuantity : null
    };
  }

  // ✅ SANITIZAÇÃO DE STRING (prevenção XSS)
  sanitizeString(input) {
    if (typeof input !== 'string') return input;
    
    return validator.escape(
      validator.stripLow(
        input.trim()
      )
    );
  }

  // ✅ VALIDAÇÃO DE DATAS
  validateDate(dateString) {
    if (!dateString) return { isValid: false, error: 'Data é obrigatória' };
    
    const date = new Date(dateString);
    const isValid = !isNaN(date.getTime()) && date <= new Date();

    return {
      isValid,
      error: isValid ? null : 'Data inválida ou futura',
      normalized: isValid ? date.toISOString().split('T')[0] : null
    };
  }

  // ✅ SCHEMAS JOI PARA VALIDAÇÃO COMPLEXA
  get userSchema() {
    return Joi.object({
      username: Joi.string().alphanum().min(3).max(50).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
      full_name: Joi.string().min(2).max(100).required(),
      role: Joi.string().valid('user', 'manager', 'admin').default('user'),
      empresa_id: Joi.number().integer().positive().default(1)
    });
  }

  get productSchema() {
    return Joi.object({
      name: Joi.string().min(2).max(200).required(),
      description: Joi.string().max(1000).allow('').optional(),
      price: Joi.number().precision(2).positive().required(),
      stock_quantity: Joi.number().integer().min(0).default(0),
      category: Joi.string().max(100).optional(),
      min_stock: Joi.number().integer().min(0).default(5)
    });
  }

  get saleSchema() {
    return Joi.object({
      items: Joi.array().items(
        Joi.object({
          product_id: Joi.number().integer().positive().optional(),
          product_name: Joi.string().required(),
          quantity: Joi.number().integer().positive().required(),
          unit_price: Joi.number().precision(2).positive().required(),
          total_price: Joi.number().precision(2).positive().required()
        })
      ).min(1).required(),
      total_amount: Joi.number().precision(2).positive().required(),
      total_items: Joi.number().integer().positive().required(),
      payment_method: Joi.string().valid('dinheiro', 'cartão', 'pix', 'transferência').required()
    });
  }

  // ✅ VALIDAÇÃO COM JOI
  async validateWithJoi(data, schema) {
    try {
      const validated = await schema.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true
      });
      return { isValid: true, data: validated, errors: null };
    } catch (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return { isValid: false, data: null, errors };
    }
  }

  // ✅ VALIDAÇÃO EM LOTE
  validateBatch(data, validations) {
    const results = {};
    const errors = [];

    for (const [field, value] of Object.entries(data)) {
      if (validations[field]) {
        const validation = validations[field](value);
        results[field] = validation;
        
        if (!validation.isValid) {
          errors.push({
            field,
            message: validation.error
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      results,
      errors
    };
  }
}

export default new BizFlowValidators();
