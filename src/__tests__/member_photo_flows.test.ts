/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTransaction = {
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
};

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

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
  memoryLocalCache: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  disableNetwork: vi.fn(),
  enableNetwork: vi.fn(),
  doc: vi.fn((_db, _col, _id, _sub, subId) => ({ id: subId || _id || 'mock-id' })),
  collection: vi.fn(() => ({ id: 'mock-col' })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  runTransaction: vi.fn(async (_db, cb) => cb(mockTransaction)),
  serverTimestamp: vi.fn(() => new Date()),
  writeBatch: vi.fn(() => ({
    delete: vi.fn(),
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  connectStorageEmulator: vi.fn(),
  ref: vi.fn(() => ({})),
  deleteObject: vi.fn(),
  uploadBytes: vi.fn(async () => {
    throw new Error('Storage bucket not found (testing fallback)');
  }),
  getDownloadURL: vi.fn(async () => 'https://mock.storage.url/profile.jpg'),
}));

import { 
  addMemberCompleteAtomic, 
  updateMemberSafe, 
  uploadMemberPhoto
} from '../services/firebase';

describe('End-to-End Member Photo Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: New member with photo passes photoStoragePath atomically', async () => {
    mockTransaction.get.mockImplementation(async () => {
      return { exists: () => true, data: () => ({ current: 5 }) };
    });

    const samplePhotoBlob = new Blob(['sample-photo-data'], { type: 'image/jpeg' });
    const photoUrl = await uploadMemberPhoto('gym-1', 'temp', samplePhotoBlob);

    const memberData = {
      fullName: 'John Doe',
      phone: '9876543210',
      phoneNormalised: '9876543210',
      branchId: 'branch-1',
      photoStoragePath: photoUrl,
      recordStatus: 'current' as const,
      gender: 'male' as const,
      joinDate: '2026-09-10',
      tags: [],
      consentVersion: '1.0',
      privacyConsentAt: new Date(),
      isMinor: false,
      identityVerification: { type: 'none' as const, verified: false },
      createdBy: 'user-1',
      updatedBy: 'user-1',
    };

    const membershipData = {
      branchId: 'branch-1',
      planId: 'plan-1',
      planNameSnapshot: 'Annual Plan',
      planPriceSnapshot: 10000,
      startDate: '2026-09-10',
      endDate: '2027-09-09',
      grossAmount: 10000,
      joiningFee: 0,
      discountType: 'none' as const,
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      finalAmount: 10000,
      billingFrequency: 'upfront' as const,
      baseStatus: 'active' as const,
      freezePeriods: [],
      createdBy: 'user-1',
      updatedBy: 'user-1',
    };

    const result = await addMemberCompleteAtomic(
      'gym-1',
      memberData as any,
      membershipData as any,
      [],
      null,
      'user-1',
      'Owner'
    );

    expect(result).toBeDefined();
    // Verify memberRef was set with photoStoragePath included
    const setCalls = mockTransaction.set.mock.calls;
    const memberSetCall = setCalls.find(c => c[1]?.fullName === 'John Doe');
    expect(memberSetCall).toBeDefined();
    expect(memberSetCall![1].photoStoragePath).toBeDefined();
    expect(memberSetCall![1].photoStoragePath.startsWith('data:')).toBe(true);
  });

  it('Test 2: New member without photo sets photoStoragePath to undefined/absent', async () => {
    mockTransaction.get.mockImplementation(async () => {
      return { exists: () => true, data: () => ({ current: 10 }) };
    });

    const memberData = {
      fullName: 'No Photo User',
      phone: '9876543211',
      phoneNormalised: '9876543211',
      branchId: 'branch-1',
      photoStoragePath: undefined,
      recordStatus: 'current' as const,
      gender: 'female' as const,
      joinDate: '2026-09-10',
      tags: [],
      consentVersion: '1.0',
      privacyConsentAt: new Date(),
      isMinor: false,
      identityVerification: { type: 'none' as const, verified: false },
      createdBy: 'user-1',
      updatedBy: 'user-1',
    };

    const membershipData = {
      branchId: 'branch-1',
      planId: 'plan-1',
      planNameSnapshot: 'Monthly',
      planPriceSnapshot: 1000,
      startDate: '2026-09-10',
      endDate: '2026-10-09',
      grossAmount: 1000,
      joiningFee: 0,
      discountType: 'none' as const,
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      finalAmount: 1000,
      billingFrequency: 'upfront' as const,
      baseStatus: 'active' as const,
      freezePeriods: [],
      createdBy: 'user-1',
      updatedBy: 'user-1',
    };

    await addMemberCompleteAtomic(
      'gym-1',
      memberData as any,
      membershipData as any,
      [],
      null,
      'user-1',
      'Owner'
    );

    const setCalls = mockTransaction.set.mock.calls;
    const memberSetCall = setCalls.find(c => c[1]?.fullName === 'No Photo User');
    expect(memberSetCall).toBeDefined();
    expect(memberSetCall![1].photoStoragePath).toBeUndefined();
  });

  it('Test 3 & 4: Edit member adds/replaces photo safely via updateMemberSafe', async () => {
    mockTransaction.get.mockImplementation(async () => {
      return {
        exists: () => true,
        data: () => ({
          fullName: 'Jane Smith',
          memberCode: 'GYM-2026-0001',
          version: 1,
          photoStoragePath: 'data:image/jpeg;base64,oldPhotoData',
        }),
      };
    });

    const newBlob = new Blob(['updated-image-content'], { type: 'image/jpeg' });
    const newPhotoUrl = await uploadMemberPhoto('gym-1', 'member-123', newBlob);

    await updateMemberSafe(
      'gym-1',
      'member-123',
      { photoStoragePath: newPhotoUrl },
      1,
      'user-1',
      'Owner'
    );

    expect(mockTransaction.update).toHaveBeenCalled();
    const updateCall = mockTransaction.update.mock.calls[0];
    expect(updateCall[1].photoStoragePath).toBe(newPhotoUrl);
    expect(updateCall[1].version).toBe(2);
  });

  it('Test 5: Edit member text fields only preserves existing photoStoragePath', async () => {
    mockTransaction.get.mockImplementation(async () => {
      return {
        exists: () => true,
        data: () => ({
          fullName: 'Jane Smith',
          memberCode: 'GYM-2026-0001',
          version: 2,
          photoStoragePath: 'data:image/jpeg;base64,preserveMe',
        }),
      };
    });

    const existingPhoto = 'data:image/jpeg;base64,preserveMe';
    await updateMemberSafe(
      'gym-1',
      'member-123',
      { fullName: 'Jane Smith Updated', photoStoragePath: existingPhoto },
      2,
      'user-1',
      'Owner'
    );

    const updateCall = mockTransaction.update.mock.calls[0];
    expect(updateCall[1].fullName).toBe('Jane Smith Updated');
    expect(updateCall[1].photoStoragePath).toBe(existingPhoto);
    expect(updateCall[1].version).toBe(3);
  });

  it('Test 6: Handles missing version field gracefully without throwing spurious conflict', async () => {
    mockTransaction.get.mockImplementation(async () => {
      return {
        exists: () => true,
        data: () => ({
          fullName: 'Legacy Member',
          memberCode: 'GYM-2026-0002',
          // version is undefined on old documents
          version: undefined,
          photoStoragePath: undefined,
        }),
      };
    });

    await updateMemberSafe(
      'gym-1',
      'legacy-123',
      { fullName: 'Legacy Member Renamed' },
      1,
      'user-1',
      'Owner'
    );

    const updateCall = mockTransaction.update.mock.calls[0];
    expect(updateCall[1].version).toBe(2);
  });
});
