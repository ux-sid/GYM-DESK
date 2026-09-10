/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';

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
  doc: vi.fn(() => ({ id: 'doc-123' })),
  collection: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  connectStorageEmulator: vi.fn(),
  ref: vi.fn(() => ({})),
  deleteObject: vi.fn(),
  uploadBytes: vi.fn(async () => {
    throw new Error('Cloud Storage disabled or bucket not found');
  }),
  getDownloadURL: vi.fn(async () => 'https://mock.storage.url/profile.jpg'),
}));

import { uploadMemberPhoto, blobToDataUrl } from '../services/firebase';

describe('Member Photo Upload & Fallback', () => {
  it('should return existing string/data URL unchanged immediately', async () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD...';
    const result = await uploadMemberPhoto('test-gym', 'test-member', dataUrl);
    expect(result).toBe(dataUrl);
  });

  it('should convert Blob to a valid data URL using blobToDataUrl', async () => {
    const blob = new Blob(['fake image content'], { type: 'image/jpeg' });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl).toBeDefined();
    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('should gracefully fall back to optimized data URL when cloud storage is unavailable without hanging', async () => {
    const blob = new Blob(['image payload for fallback'], { type: 'image/jpeg' });
    const start = Date.now();
    const result = await uploadMemberPhoto('test-gym', 'temp', blob);
    const duration = Date.now() - start;

    expect(result).toBeDefined();
    expect(result.startsWith('data:')).toBe(true);
    // Cloud storage throws error immediately, falling back in < 1 second
    expect(duration).toBeLessThan(2000);
  });
});
