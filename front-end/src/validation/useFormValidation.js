/**
 * useFormValidation Hook
 * 
 * A reusable hook for form validation using Zod schemas.
 * 
 * Features:
 * - Field-level validation (onBlur)
 * - Form-level validation (onSubmit)
 * - Error state management
 * - Auto-clear errors on field change
 * 
 * @example
 * const { errors, validateField, validateForm, clearError } = useFormValidation(schema);
 * 
 * // In TextField
 * <TextField
 *   error={!!errors.email}
 *   helperText={errors.email}
 *   onBlur={() => validateField('email', email)}
 *   onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
 * />
 * 
 * // On submit
 * const isValid = validateForm({ email, password });
 * if (isValid) { ... }
 * 
 * @module validation/useFormValidation
 */

import { useState, useCallback } from 'react';

/**
 * Form validation hook using Zod schemas.
 * 
 * @param {Object} fieldSchemas - Object mapping field names to Zod schemas
 * @returns {Object} Validation state and methods
 */
export function useFormValidation(fieldSchemas = {}) {
  const [errors, setErrors] = useState({});

  /**
   * Validate a single field using Zod v4 API.
   * 
   * @param {string} name - Field name
   * @param {any} value - Field value
   * @returns {boolean} True if valid
   */
  const validateField = useCallback((name, value) => {
    const schema = fieldSchemas[name];
    
    if (!schema) {
      return true;
    }

    const result = schema.safeParse(value);
    
    if (!result.success) {
      // Zod v4 uses 'issues' property (non-enumerable)
      const issues = result.error?.issues || [];
      const message = issues[0]?.message || 'Invalid value';
      setErrors(prev => ({ ...prev, [name]: message }));
      return false;
    }
    setErrors(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    return true;
  }, [fieldSchemas]);

  /**
   * Validate entire form using Zod v4 schema.
   * 
   * @param {Object} formSchema - Full Zod schema for form
   * @param {Object} data - Form data object
   * @returns {boolean} True if all fields valid
   */
  const validateForm = useCallback((formSchema, data) => {
    const result = formSchema.safeParse(data);
    
    if (!result.success) {
      const newErrors = {};
      // Zod v4 uses 'issues' property (non-enumerable)
      const issues = result.error?.issues || [];
      issues.forEach(err => {
        const field = err.path?.[0];
        if (field && !newErrors[field]) {
          newErrors[field] = err.message;
        }
      });
      setErrors(newErrors);
      return false;
    }
    
    setErrors({});
    return true;
  }, []);

  /**
   * Clear error for a specific field.
   */
  const clearError = useCallback((name) => {
    setErrors(prev => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  /**
   * Clear all errors.
   */
  const resetErrors = useCallback(() => {
    setErrors({});
  }, []);

  /**
   * Check if form has any errors.
   */
  const hasErrors = Object.keys(errors).length > 0;

  return {
    errors,
    validateField,
    validateForm,
    clearError,
    resetErrors,
    hasErrors,
  };
}
