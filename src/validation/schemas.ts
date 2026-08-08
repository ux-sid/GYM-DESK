import { z } from 'zod';

export const phoneRegex = /^[6-9]\d{9}$/; // Standard 10-digit Indian mobile numbers starting with 6-9

export const profileSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().regex(phoneRegex, 'Invalid Indian phone number (10 digits, e.g. 9876543210)'),
  alternatePhone: z.string().regex(phoneRegex, 'Invalid Indian phone number').optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other']).optional(),
  addressLine1: z.string().max(100).optional().or(z.literal('')),
  addressLine2: z.string().max(100).optional().or(z.literal('')),
  locality: z.string().max(50).optional().or(z.literal('')),
  city: z.string().max(50).optional().or(z.literal('')),
  state: z.string().max(50).optional().or(z.literal('')),
  pincode: z.string().regex(/^\d{6}$/, 'Must be a 6-digit Indian PIN code').optional().or(z.literal('')),
  emergencyContactName: z.string().optional().or(z.literal('')),
  emergencyContactPhone: z.string().regex(phoneRegex, 'Invalid phone number').optional().or(z.literal('')),
  tags: z.array(z.string()).default([]),
  notes: z.string().max(500).optional().or(z.literal('')),
  isMinor: z.boolean().default(false),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  identityType: z.enum(['aadhaar', 'voter_id', 'driving_licence', 'passport', 'other', 'none']).default('none'),
  identityLast4: z.string().regex(/^\d{4}$/, 'Must be exactly last 4 digits').optional().or(z.literal('')),
  privacyConsent: z.boolean().refine(val => val === true, 'You must accept the privacy notice'),
  photoConsent: z.boolean().default(false),
}).refine((data) => {
  if (data.isMinor) {
    return !!data.guardianName && !!data.guardianPhone && phoneRegex.test(data.guardianPhone);
  }
  return true;
}, {
  message: 'Guardian name and phone are required for minors',
  path: ['guardianName'],
});

export const planSchema = z.object({
  name: z.string().min(2, 'Plan name must be at least 2 characters').max(30),
  description: z.string().max(200).optional().or(z.literal('')),
  durationValue: z.number().int().positive('Duration must be positive'),
  durationUnit: z.enum(['days', 'months', 'years']),
  standardPrice: z.number().nonnegative('Price must be non-negative'),
  joiningFee: z.number().nonnegative('Joining fee must be non-negative'),
  billingFrequency: z.enum(['upfront', 'monthly']),
  optionalTaxRate: z.number().min(0).max(100).optional(),
  active: z.boolean().default(true),
  branchIds: z.array(z.string()).min(1, 'Select at least one branch'),
});

export const paymentSchema = z.object({
  amount: z.number().positive('Payment amount must be positive'),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other']),
  transactionReference: z.string().max(50).optional().or(z.literal('')),
  note: z.string().max(200).optional().or(z.literal('')),
});

export const gymSetupSchema = z.object({
  name: z.string().min(2, 'Gym name must be at least 2 characters').max(50),
  phone: z.string().regex(phoneRegex, 'Invalid Indian phone number'),
  email: z.string().email('Invalid email address'),
  address: z.string().max(200).optional().or(z.literal('')),
  defaultBranchName: z.string().min(2, 'Branch name must be at least 2 characters').max(30),
  receiptPrefix: z.string().min(2, 'Receipt prefix must be at least 2 characters').max(10).default('RCPT'),
  taxEnabled: z.boolean().default(false),
  optionalGSTIN: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/, 'Invalid Indian GSTIN format').optional().or(z.literal('')),
  optionalTaxRate: z.number().min(0).max(100).default(18),
});

export const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'manager', 'staff', 'viewer']),
});
