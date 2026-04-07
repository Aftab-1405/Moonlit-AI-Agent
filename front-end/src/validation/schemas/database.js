/**
 * Database Connection Validation Schemas
 *
 * Zod schemas for database connection forms:
 * - Credentials (host, port, user, password)
 * - Connection String
 *
 * @module validation/schemas/database
 */

import { z } from 'zod';

export const credentialsSchema = z.object({
  host: z
    .string()
    .min(1, 'Host is required')
    .regex(/^[a-zA-Z0-9.-]+$/, 'Invalid host format'),
  port: z
    .string()
    .min(1, 'Port is required')
    .refine((val) => {
      const num = parseInt(val, 10);
      return !isNaN(num) && num >= 1 && num <= 65535;
    }, 'Port must be between 1 and 65535'),
  user: z
    .string()
    .min(1, 'Username is required'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export const connectionStringSchema = z.object({
  connectionString: z
    .string()
    .min(1, 'Connection string is required')
    .regex(
      /^(postgresql|mysql|sqlserver|oracle):\/\/.+/i,
      'Invalid connection string format'
    ),
});

export const dbFieldSchemas = {
  host: z
    .string()
    .min(1, 'Host is required')
    .regex(/^[a-zA-Z0-9.-]+$/, 'Invalid host format'),
  port: z
    .string()
    .min(1, 'Port is required')
    .refine((val) => {
      const num = parseInt(val, 10);
      return !isNaN(num) && num >= 1 && num <= 65535;
    }, 'Port must be between 1 and 65535'),
  user: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  connectionString: z
    .string()
    .min(1, 'Connection string is required'),
  database: z
    .string()
    .min(1, 'Database name is required'),
};
