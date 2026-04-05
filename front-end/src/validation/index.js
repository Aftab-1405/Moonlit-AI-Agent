/**
 * Validation Module - Barrel Export
 * 
 * @example
 * import { useFormValidation, signInSchema, authFieldSchemas } from '../validation';
 */
export { useFormValidation } from './useFormValidation';
export {
  signInSchema,
  signUpSchema,
  resetPasswordSchema,
  authFieldSchemas,
} from './schemas/auth';
export {
  credentialsSchema,
  connectionStringSchema,
  dbFieldSchemas,
} from './schemas/database';
