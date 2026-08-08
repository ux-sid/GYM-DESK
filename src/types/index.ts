export type RecordStatus = 'draft' | 'current' | 'archived';
export type BaseStatus = 'active' | 'frozen' | 'inactive' | 'cancelled';
export type DueStatus = 'unpaid' | 'partial' | 'paid' | 'waived';
export type PaymentType = 'payment' | 'refund' | 'adjustment' | 'void';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other';
export type UserRole = 'owner' | 'manager' | 'staff' | 'viewer';
export type IdentityType = 'aadhaar' | 'voter_id' | 'driving_licence' | 'passport' | 'other' | 'none';

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  photoURL?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Gym {
  id: string;
  name: string;
  logoStoragePath?: string;
  phone: string;
  email: string;
  address?: string;
  timezone: string; // Asia/Kolkata
  currency: string; // INR
  locale: string; // en-IN
  defaultBranchId: string;
  receiptPrefix: string; // e.g., RCPT
  optionalGSTIN?: string;
  optionalTaxRate?: number; // e.g. 18
  taxEnabled: boolean; // default false
  privacyNoticeVersion: string;
  reminderTemplates: {
    feeDueEnglish: string;
    feeDueHindi: string;
    expiryEnglish: string;
    expiryHindi: string;
  };
  retentionSettings: {
    archivedRetentionDays: number;
    enableRetentionReminders: boolean;
  };
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

export interface Branch {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  createdAt: any;
}

export interface Staff {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  invitedBy?: string;
  invitedAt?: any;
  joinedAt: any;
  lastActiveAt?: any;
  status: 'active' | 'revoked';
}

export interface Invite {
  id: string;
  email: string;
  role: UserRole;
  status: 'pending' | 'accepted' | 'expired';
  invitedBy: string;
  createdAt: any;
  acceptedAt?: any;
  acceptedBy?: string;
}

export interface Member {
  id: string;
  memberCode: string; // Unique sequential e.g. GYM-2026-0001
  branchId: string;
  fullName: string;
  searchName: string; // Normalized lowercase
  photoStoragePath?: string;
  phone: string;
  phoneNormalised: string;
  alternatePhone?: string;
  email?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: string; // male | female | other
  addressLine1?: string;
  addressLine2?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  tags: string[];
  notes?: string;
  joinDate: string; // YYYY-MM-DD
  recordStatus: RecordStatus;
  archivedAt?: any;
  archivedBy?: string;
  privacyConsentAt: any;
  photoConsentAt?: any;
  consentVersion: string;
  isMinor: boolean;
  guardianName?: string;
  guardianPhone?: string;
  guardianConsentAt?: any;
  identityVerification: {
    type: IdentityType;
    last4?: string; // Store last 4 digits only
    verified: boolean;
    verifiedAt?: any;
    verifiedBy?: string;
    consentAt?: any;
  };
  createdBy: string;
  updatedBy: string;
  createdAt: any;
  updatedAt: any;
  version: number;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  durationValue: number;
  durationUnit: 'days' | 'months' | 'years';
  standardPrice: number;
  joiningFee: number;
  billingFrequency: 'upfront' | 'monthly';
  optionalTaxRate?: number;
  active: boolean;
  branchIds: string[];
  createdAt: any;
  updatedAt: any;
}

export interface FreezePeriod {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason?: string;
  recordedBy: string;
  createdAt: any;
}

export interface Membership {
  id: string;
  memberId: string;
  branchId: string;
  planId: string;
  planNameSnapshot: string;
  planPriceSnapshot: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  grossAmount: number;
  joiningFee: number;
  discountType: 'fixed' | 'percentage' | 'none';
  discountValue: number;
  discountAmount: number;
  taxAmount: number;
  finalAmount: number;
  billingFrequency: 'upfront' | 'monthly';
  baseStatus: BaseStatus;
  cancellationReason?: string;
  freezePeriods: FreezePeriod[];
  createdBy: string;
  updatedBy: string;
  createdAt: any;
  updatedAt: any;
}

export interface Due {
  id: string;
  memberId: string;
  membershipId: string;
  branchId: string;
  billingPeriodStart: string; // YYYY-MM-DD
  billingPeriodEnd: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  originalAmount: number;
  discountAmount: number;
  taxAmount: number;
  netDue: number;
  amountPaid: number;
  balance: number;
  baseStatus: DueStatus;
  waivedAmount?: number;
  waiverReason?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Allocation {
  dueId: string;
  amount: number;
}

export interface Payment {
  id: string;
  memberId: string;
  membershipId?: string;
  branchId: string;
  type: PaymentType; // payment, refund, adjustment, void
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  transactionReference?: string;
  receiptNumber: string; // Sequential e.g., RCPT-2026-000001
  note?: string;
  allocations: Allocation[];
  status: 'completed' | 'void';
  originalPaymentId?: string; // required for refund / void
  createdBy: string;
  createdAt: any;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  action: string;
  entityType: 'gym' | 'member' | 'membership' | 'plan' | 'payment' | 'due' | 'staff' | 'invite';
  entityId: string;
  safeBeforeSummary?: string;
  safeAfterSummary?: string;
  timestamp: any;
  deviceMetadata?: {
    userAgent?: string;
    os?: string;
    isOfflineDraft?: boolean;
  };
  reason?: string;
}
