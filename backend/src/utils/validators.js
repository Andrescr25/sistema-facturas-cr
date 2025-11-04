/**
 * Validadores comunes
 * Funciones de validación reutilizables
 */

class Validators {
  /**
   * Validar que un campo no esté vacío
   */
  static required(value, fieldName) {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return `${fieldName} es requerido`;
    }
    return null;
  }

  /**
   * Validar email
   */
  static email(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'Email inválido';
    }
    return null;
  }

  /**
   * Validar número
   */
  static number(value, fieldName) {
    if (isNaN(value)) {
      return `${fieldName} debe ser un número`;
    }
    return null;
  }

  /**
   * Validar rango numérico
   */
  static range(value, min, max, fieldName) {
    const num = Number(value);
    if (num < min || num > max) {
      return `${fieldName} debe estar entre ${min} y ${max}`;
    }
    return null;
  }

  /**
   * Validar fecha
   */
  static date(value, fieldName) {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return `${fieldName} no es una fecha válida`;
    }
    return null;
  }

  /**
   * Validar longitud mínima
   */
  static minLength(value, length, fieldName) {
    if (value.length < length) {
      return `${fieldName} debe tener al menos ${length} caracteres`;
    }
    return null;
  }

  /**
   * Validar longitud máxima
   */
  static maxLength(value, length, fieldName) {
    if (value.length > length) {
      return `${fieldName} no puede tener más de ${length} caracteres`;
    }
    return null;
  }

  /**
   * Validar array no vacío
   */
  static arrayNotEmpty(value, fieldName) {
    if (!Array.isArray(value) || value.length === 0) {
      return `${fieldName} no puede estar vacío`;
    }
    return null;
  }

  /**
   * Ejecutar múltiples validaciones
   */
  static validate(validations) {
    const errors = {};

    for (const [field, rules] of Object.entries(validations)) {
      for (const rule of rules) {
        const error = rule();
        if (error) {
          if (!errors[field]) {
            errors[field] = [];
          }
          errors[field].push(error);
        }
      }
    }

    return Object.keys(errors).length > 0 ? errors : null;
  }
}

module.exports = Validators;
