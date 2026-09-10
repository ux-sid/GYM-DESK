/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { addMemberCompleteAtomic } from '../services/firebase';

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  connectAuthEmulator: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  connectStorageEmulator: vi.fn(),
  ref: vi.fn(() => ({})),
  deleteObject: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

// Mock Firebase
vi.mock('firebase/firestore', async () => {
  return {
    initializeFirestore: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(),
    persistentMultipleTabManager: vi.fn(),
    memoryLocalCache: vi.fn(),
    connectFirestoreEmulator: vi.fn(),
    disableNetwork: vi.fn(),
    enableNetwork: vi.fn(),
    doc: vi.fn(() => ({ id: 'mocked-id-' + Math.random().toString(36).substr(2, 9) })),
    collection: vi.fn(),
    runTransaction: vi.fn(async (_db, cb) => {
      const transactionMock = {
        get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ current: 10 }) }),
        set: vi.fn(),
        update: vi.fn(),
      };
      return await cb(transactionMock);
    }),
    serverTimestamp: vi.fn(() => new Date()),
  };
});

vi.mock('../services/firebase', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    runLocalOrOnlineTransaction: vi.fn(async (_db, callback) => {
      const transactionMock = {
        get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ current: 10 }) }),
        set: vi.fn(),
        update: vi.fn(),
      };
      return await callback(transactionMock);
    }),
  };
});

describe('Firebase Service - Atomic Operations', () => {
  it('should successfully execute addMemberCompleteAtomic with all dependencies', async () => {
    const memberData = {
      fullName: 'Test User',
      phone: '9999999999',
      recordStatus: 'current' as const,
    };
    const membershipData = {
      planId: 'plan-1',
      grossAmount: 1000,
      taxAmount: 0,
      discountAmount: 0,
      finalAmount: 1000,
      baseStatus: 'active' as const,
    };
    const duesRaw = [{
      grossAmount: 1000,
      taxAmount: 0,
      discountAmount: 0,
      netDue: 1000,
      balance: 1000,
      amountPaid: 0,
      baseStatus: 'unpaid' as const,
    }];
    
    // We are mocking runLocalOrOnlineTransaction so it should execute the callback and return the ID
    const result = await addMemberCompleteAtomic(
      'gym-1',
      memberData as any,
      membershipData as any,
      duesRaw as any,
      null,
      'user-1',
      'Admin User'
    );
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});
