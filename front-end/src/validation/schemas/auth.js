/**
 * Auth Validation Schemas
 * 
 * Zod schemas for authentication forms:
 * - Sign In
 * - Sign Up
 * - Password Reset
 * 
 * @module validation/schemas/auth
 */

import { z } from 'zod';

const emailRule = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email');

const passwordRule = z
  .string()
  .min(1, 'Password is required');

const passwordWithLengthRule = z
  .string()
  .min(1, 'Password is required')
  .min(6, 'Password must be at least 6 characters');

export const signInSchema = z.object({
  email: emailRule,
  password: passwordRule,
});

export const signUpSchema = z.object({
  displayName: z.string().optional(),
  email: emailRule,
  password: passwordWithLengthRule,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const resetPasswordSchema = z.object({
  email: emailRule,
});

export const authFieldSchemas = {
  email: emailRule,
  password: passwordRule,
  passwordSignUp: passwordWithLengthRule,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  displayName: z.string().optional(),
};

export default {
  signInSchema,
  signUpSchema,
  resetPasswordSchema,
  authFieldSchemas,
};
