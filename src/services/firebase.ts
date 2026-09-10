import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
  disableNetwork,
  enableNetwork,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, deleteObject } from 'firebase/storage';
import { connectAuthEmulator } from 'firebase/auth';
import type { Member, Membership, Due, Payment, Gym, Staff, Invite, AuditLog, DueStatus } from '../types';
import { allocatePayment } from '../utils/financeUtils';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Check if device is trusted or we are running in local offline-only bypass mode
const isOfflineMode = localStorage.getItem('gymdesk_offline_mode') === 'true';
const isTrustedDevice = localStorage.getItem('gymdesk_trusted_device') === 'true' || isOfflineMode;

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with cache settings
export const db = isTrustedDevice
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });

export const auth = getAuth(app);
export const storage = getStorage(app);

export let offlineInitialized: Promise<void> = Promise.resolve();

// Connect emulators if enabled, or disable network if running in local offline-only mode
if (isOfflineMode) {
  console.log('GymDesk running in offline-only testing mode.');
  offlineInitialized = disableNetwork(db).catch(err => {
    console.error('Failed to disable network:', err);
  });
} else if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  // Catch emulator connection errors if ports are not listening
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
  } catch (err) {
    console.warn('Failed to connect to Firebase Emulators:', err);
  }
}

export function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (obj.constructor && obj.constructor.name !== 'Object' && !Array.isArray(obj)) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }
  const result: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val !== undefined) {
        result[key] = cleanUndefined(val);
      }
    }
  }
  return result;
}

// Replace runTransaction with a wrapper that supports offline mock transactions
export async function runLocalOrOnlineTransaction<T>(
  firestoreDb: any,
  updateFunction: (transaction: any) => Promise<T>
): Promise<T> {
  const isOffline = localStorage.getItem('gymdesk_offline_mode') === 'true';
  if (isOffline) {
    const pendingWrites: any[] = [];
    const mockTransaction = {
      get: async (docRef: any) => {
        try {
          return await getDoc(docRef);
        } catch (err: any) {
          const isOfflineError = 
            err.code === 'unavailable' || 
            err.message?.toLowerCase().includes('offline') || 
            err.message?.toLowerCase().includes('failed to get document');
            
          if (isOfflineError) {
            return {
              exists: () => false,
              data: () => undefined,
              id: docRef.id,
              ref: docRef
            } as any;
          }
          throw err;
        }
      },
      set: (docRef: any, data: any, options?: any) => {
        pendingWrites.push({ type: 'set', ref: docRef, data: cleanUndefined(data), options });
        return mockTransaction;
      },
      update: (docRef: any, data: any) => {
        pendingWrites.push({ type: 'update', ref: docRef, data: cleanUndefined(data) });
        return mockTransaction;
      },
      delete: (docRef: any) => {
        pendingWrites.push({ type: 'delete', ref: docRef });
        return mockTransaction;
      }
    };

    const result = await updateFunction(mockTransaction);
    const batch = writeBatch(firestoreDb);
    for (const write of pendingWrites) {
      if (write.type === 'set') {
        batch.set(write.ref, write.data, write.options);
      } else if (write.type === 'update') {
        batch.update(write.ref, write.data);
      } else if (write.type === 'delete') {
        batch.delete(write.ref);
      }
    }
    batch.commit().catch(err => {
      console.warn('Background batch commit failed/queued:', err);
    });
    return result;
  } else {
    return runTransaction(firestoreDb, updateFunction);
  }
}

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async (_isMobile: boolean) => {
  localStorage.removeItem('gymdesk_offline_mode');
  localStorage.removeItem('gymdesk_mock_user');
  try {
    await enableNetwork(db);
  } catch {
    // Network may already be enabled
  }
  // Use signInWithPopup exclusively. signInWithRedirect is known to break on mobile browsers
  // due to ITP (Intelligent Tracking Prevention) blocking cross-site auth state persistence.
  await signInWithPopup(auth, googleProvider);
};

export const logoutUser = () => signOut(auth);

// --- DB Service Layer ---

// Gym setup & details
export async function createGymWorkspace(ownerUid: string, ownerEmail: string, ownerName: string, gymData: Omit<Gym, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) {
  const gymId = doc(collection(db, 'gyms')).id;
  const gymRef = doc(db, 'gyms', gymId);
  const staffRef = doc(db, 'gyms', gymId, 'staff', ownerUid);
  const userRef = doc(db, 'users', ownerUid);
  
  const timestamp = serverTimestamp();
  
  const newGym: Gym = {
    ...gymData,
    id: gymId,
    createdBy: ownerUid,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const newStaff: Staff = {
    uid: ownerUid,
    fullName: ownerName,
    email: ownerEmail,
    role: 'owner',
    joinedAt: timestamp,
    status: 'active',
  };

  await runLocalOrOnlineTransaction(db, async (transaction) => {
    transaction.set(gymRef, newGym);
    transaction.set(staffRef, newStaff);
    transaction.set(userRef, {
      uid: ownerUid,
      email: ownerEmail,
      fullName: ownerName,
      lastGymId: gymId,
      updatedAt: timestamp
    }, { merge: true });
  });

  return gymId;
}

export async function getGym(gymId: string): Promise<Gym | null> {
  const docSnap = await getDoc(doc(db, 'gyms', gymId));
  return docSnap.exists() ? (docSnap.data() as Gym) : null;
}

export async function getUserGyms(uid: string): Promise<{ gymId: string; role: string; name: string }[]> {
  // Since we query staff, we want to find all gyms where user has a staff record
  // However, in client side without a Collection Group query index, we can read the user's document or simple staff references
  // To avoid complex indexes initially, we can keep a lastGymId on user profile or check user's gyms.
  // Wait, let's query gyms where user is a staff member. Let's do this by querying collectionGroups if needed, 
  // or we can store a `gyms` array/object inside `users/{uid}` containing gyms they are part of!
  // Storing gyms list inside `users/{uid}` is a very elegant solution that avoids collection group queries and operates instantly.
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (userSnap.exists()) {
    const data = userSnap.data();
    if (data.gyms) {
      return Object.entries(data.gyms).map(([id, info]: any) => ({
        gymId: id,
        role: info.role,
        name: info.name
      }));
    }
  }
  return [];
}

// Staff & invites
export async function inviteStaff(gymId: string, email: string, role: string, actorUid: string, actorName: string) {
  const inviteId = doc(collection(db, 'gyms', gymId, 'invites')).id;
  const inviteRef = doc(db, 'gyms', gymId, 'invites', inviteId);
  
  const inviteData: Invite = {
    id: inviteId,
    email: email.toLowerCase().trim(),
    role: role as any,
    status: 'pending',
    invitedBy: actorUid,
    createdAt: serverTimestamp(),
  };

  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));
  const log: Omit<AuditLog, 'id'> = {
    actorUid,
    actorName,
    action: 'Staff Invited',
    entityType: 'invite',
    entityId: inviteId,
    safeAfterSummary: `Invited ${email} as ${role}`,
    timestamp: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(inviteRef, inviteData);
  batch.set(auditRef, log);
  await batch.commit();
}

export async function acceptInvite(gymId: string, inviteId: string, user: User) {
  const inviteRef = doc(db, 'gyms', gymId, 'invites', inviteId);
  const staffRef = doc(db, 'gyms', gymId, 'staff', user.uid);
  const userRef = doc(db, 'users', user.uid);
  const gymRef = doc(db, 'gyms', gymId);

  await runLocalOrOnlineTransaction(db, async (transaction) => {
    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists()) throw new Error('Invite not found');
    const invite = inviteSnap.data() as Invite;
    if (invite.status !== 'pending') throw new Error('Invite is no longer pending');
    if (invite.email.toLowerCase() !== user.email?.toLowerCase()) throw new Error('User email does not match invite');

    const gymSnap = await transaction.get(gymRef);
    if (!gymSnap.exists()) throw new Error('Gym not found');
    const gym = gymSnap.data() as Gym;

    transaction.update(inviteRef, {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
      acceptedBy: user.uid
    });

    transaction.set(staffRef, {
      uid: user.uid,
      fullName: user.displayName || 'Staff Member',
      email: user.email,
      role: invite.role,
      joinedAt: serverTimestamp(),
      status: 'active',
      inviteId: inviteId
    });

    // Update user profile gyms map
    transaction.set(userRef, {
      lastGymId: gymId,
      [`gyms.${gymId}`]: {
        role: invite.role,
        name: gym.name
      }
    }, { merge: true });
  });
}

// Legacy or Import Member Creation
export async function addMemberWithCode(
  gymId: string, 
  memberData: Omit<Member, 'id' | 'memberCode' | 'createdAt' | 'updatedAt' | 'version'>,
  actorUid: string,
  actorName: string
): Promise<string> {
  const memberId = doc(collection(db, 'gyms', gymId, 'members')).id;
  const memberRef = doc(db, 'gyms', gymId, 'members', memberId);
  const counterRef = doc(db, 'gyms', gymId, 'counters', 'members');
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));

  return await runLocalOrOnlineTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    let nextNum = 1;
    if (counterSnap.exists()) {
      nextNum = (counterSnap.data().current || 0) + 1;
    }
    transaction.set(counterRef, { current: nextNum }, { merge: true });

    const currentYear = new Date().getFullYear();
    const formattedCode = `GYM-${currentYear}-${String(nextNum).padStart(4, '0')}`;

    const newMember: Member = {
      ...memberData,
      id: memberId,
      memberCode: formattedCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1,
    };
    transaction.set(memberRef, newMember);

    const log: Omit<AuditLog, 'id'> = {
      actorUid,
      actorName,
      action: 'Member Created',
      entityType: 'member',
      entityId: memberId,
      safeAfterSummary: `Created member ${memberData.fullName} (${formattedCode})`,
      timestamp: serverTimestamp(),
    };
    transaction.set(auditRef, log);

    return memberId;
  });
}

// Members code generator & Full Onboarding (Transactional)
export async function addMemberCompleteAtomic(
  gymId: string, 
  memberData: Omit<Member, 'id' | 'memberCode' | 'createdAt' | 'updatedAt' | 'version'>,
  membershipData: Omit<Membership, 'id' | 'createdAt' | 'updatedAt'>,
  duesRaw: Omit<Due, 'id' | 'createdAt' | 'updatedAt'>[],
  paymentData: Omit<Payment, 'id' | 'receiptNumber' | 'createdAt'> | null,
  actorUid: string,
  actorName: string
): Promise<string> {
  const memberId = doc(collection(db, 'gyms', gymId, 'members')).id;
  const memberRef = doc(db, 'gyms', gymId, 'members', memberId);
  
  const membershipId = doc(collection(db, 'gyms', gymId, 'memberships')).id;
  const membershipRef = doc(db, 'gyms', gymId, 'memberships', membershipId);
  
  const paymentId = paymentData ? doc(collection(db, 'gyms', gymId, 'payments')).id : null;
  const paymentRef = paymentId ? doc(db, 'gyms', gymId, 'payments', paymentId) : null;
  
  const counterRef = doc(db, 'gyms', gymId, 'counters', 'members');
  const receiptCounterRef = doc(db, 'gyms', gymId, 'counters', 'receipts');
  
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));

  const result = await runLocalOrOnlineTransaction(db, async (transaction) => {
    // 1. Generate Member Code
    const counterSnap = await transaction.get(counterRef);
    let nextNum = 1;
    if (counterSnap.exists()) {
      nextNum = (counterSnap.data().current || 0) + 1;
    }
    transaction.set(counterRef, { current: nextNum }, { merge: true });

    const currentYear = new Date().getFullYear();
    const formattedCode = `GYM-${currentYear}-${String(nextNum).padStart(4, '0')}`;

    const newMember: Member = {
      ...memberData,
      id: memberId,
      memberCode: formattedCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1,
    };
    transaction.set(memberRef, newMember);

    // 2. Generate Membership
    const finalMembership: Membership = {
      ...membershipData,
      id: membershipId,
      memberId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(membershipRef, finalMembership);

    // 3. Generate Dues
    const duesList: Due[] = [];
    for (let i = 0; i < duesRaw.length; i++) {
      const dueId = `${membershipId}_due_${i}`;
      const dueRef = doc(db, 'gyms', gymId, 'dues', dueId);
      
      const finalDue: Due = {
        ...duesRaw[i],
        id: dueId,
        memberId,
        membershipId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      transaction.set(dueRef, finalDue);
      duesList.push(finalDue);
    }

    // 4. Record Payment if provided
    if (paymentData && paymentRef) {
      const rCounterSnap = await transaction.get(receiptCounterRef);
      let rNextNum = 1;
      if (rCounterSnap.exists()) {
        rNextNum = (rCounterSnap.data().current || 0) + 1;
      }
      transaction.set(receiptCounterRef, { current: rNextNum }, { merge: true });
      const receiptNumber = `RCPT-${currentYear}-${String(rNextNum).padStart(6, '0')}`;

      const { allocations, updatedDues } = allocatePayment(paymentData.amount, duesList);

      for (const uDue of updatedDues) {
        const dueRef = doc(db, 'gyms', gymId, 'dues', uDue.id);
        transaction.update(dueRef, {
          amountPaid: uDue.amountPaid,
          balance: uDue.balance,
          baseStatus: uDue.baseStatus,
          updatedAt: serverTimestamp(),
        });
      }

      const finalPayment: Payment = {
        ...paymentData,
        id: paymentId!,
        memberId,
        membershipId,
        receiptNumber,
        allocations,
        createdAt: serverTimestamp(),
      };
      transaction.set(paymentRef, finalPayment);
    }

    // 5. Audit Log
    const log: Omit<AuditLog, 'id'> = {
      actorUid,
      actorName,
      action: 'Member Created',
      entityType: 'member',
      entityId: memberId,
      safeAfterSummary: `Created member ${memberData.fullName} (${formattedCode}) with membership`,
      timestamp: serverTimestamp(),
    };
    transaction.set(auditRef, log);

    return memberId;
  });

  return result;
}

// Update Member with Conflict Check
export async function updateMemberSafe(
  gymId: string,
  memberId: string,
  updatedData: Partial<Member>,
  expectedVersion: number,
  actorUid: string,
  actorName: string
) {
  const memberRef = doc(db, 'gyms', gymId, 'members', memberId);
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));

  await runLocalOrOnlineTransaction(db, async (transaction) => {
    const snap = await transaction.get(memberRef);
    if (!snap.exists()) throw new Error('Member not found');
    const current = snap.data() as Member;

    if (current.version !== expectedVersion) {
      throw new Error(`VERSION_CONFLICT|${JSON.stringify(current)}`);
    }

    const nextVersion = expectedVersion + 1;
    transaction.update(memberRef, {
      ...updatedData,
      version: nextVersion,
      updatedAt: serverTimestamp()
    });

    const log: Omit<AuditLog, 'id'> = {
      actorUid,
      actorName,
      action: 'Member Edited',
      entityType: 'member',
      entityId: memberId,
      safeAfterSummary: `Updated profile details for ${current.fullName} (${current.memberCode})`,
      timestamp: serverTimestamp(),
    };
    transaction.set(auditRef, log);
  });
}

// Sequential Receipt Generator & Payment Creation (Transactional)
export async function recordPaymentAtomic(
  gymId: string,
  paymentData: Omit<Payment, 'id' | 'receiptNumber' | 'createdAt'>,
  outstandingDues: Due[],
  actorUid: string,
  actorName: string
): Promise<string> {
  const paymentId = doc(collection(db, 'gyms', gymId, 'payments')).id;
  const paymentRef = doc(db, 'gyms', gymId, 'payments', paymentId);
  const counterRef = doc(db, 'gyms', gymId, 'counters', 'receipts');
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));

  return await runLocalOrOnlineTransaction(db, async (transaction) => {
    // 1. Increment receipt counter
    const counterSnap = await transaction.get(counterRef);
    let nextNum = 1;
    if (counterSnap.exists()) {
      nextNum = (counterSnap.data().current || 0) + 1;
    }
    transaction.set(counterRef, { current: nextNum }, { merge: true });

    const currentYear = new Date().getFullYear();
    const receiptNumber = `RCPT-${currentYear}-${String(nextNum).padStart(6, '0')}`;

    // 2. Allocate payment amount to oldest dues first (FIFO)
    const { allocations, updatedDues } = allocatePayment(paymentData.amount, outstandingDues);

    // 3. Write due updates
    for (const uDue of updatedDues) {
      const dueRef = doc(db, 'gyms', gymId, 'dues', uDue.id);
      transaction.update(dueRef, {
        amountPaid: uDue.amountPaid,
        balance: uDue.balance,
        baseStatus: uDue.baseStatus,
        updatedAt: serverTimestamp(),
      });
    }

    // 4. Save payment record
    const finalPayment: Payment = {
      ...paymentData,
      id: paymentId,
      receiptNumber,
      allocations,
      createdAt: serverTimestamp(),
    };
    transaction.set(paymentRef, finalPayment);

    // 5. Audit Log
    const log: Omit<AuditLog, 'id'> = {
      actorUid,
      actorName,
      action: 'Payment Recorded',
      entityType: 'payment',
      entityId: paymentId,
      safeAfterSummary: `Recorded payment of ₹${paymentData.amount} (Receipt: ${receiptNumber})`,
      timestamp: serverTimestamp(),
    };
    transaction.set(auditRef, log);

    return receiptNumber;
  });
}

// Refund Creation (Transactional)
export async function refundPaymentAtomic(
  gymId: string,
  originalPaymentId: string,
  refundAmount: number,
  reason: string,
  actorUid: string,
  actorName: string
) {
  const originalRef = doc(db, 'gyms', gymId, 'payments', originalPaymentId);
  const refundId = doc(collection(db, 'gyms', gymId, 'payments')).id;
  const refundRef = doc(db, 'gyms', gymId, 'payments', refundId);
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));

  await runLocalOrOnlineTransaction(db, async (transaction) => {
    const origSnap = await transaction.get(originalRef);
    if (!origSnap.exists()) throw new Error('Original payment not found');
    const originalPayment = origSnap.data() as Payment;

    // Fetch existing refunds to prevent double refund exceeding limits
    const paymentsQuery = query(
      collection(db, 'gyms', gymId, 'payments'),
      where('originalPaymentId', '==', originalPaymentId),
      where('type', '==', 'refund')
    );
    const existingRefundsSnap = await getDocs(paymentsQuery);
    const existingRefunds = existingRefundsSnap.docs.map(d => d.data() as Payment);

    const refundedAlready = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    const maxRefundable = originalPayment.amount - refundedAlready;

    if (refundAmount > maxRefundable) {
      throw new Error(`Refund amount exceeds remaining refundable balance of ₹${maxRefundable}`);
    }

    // Un-allocate the dues according to allocations
    // For each allocation, subtract from due amountPaid and add to balance
    for (const alloc of originalPayment.allocations) {
      const dueRef = doc(db, 'gyms', gymId, 'dues', alloc.dueId);
      const dueSnap = await transaction.get(dueRef);
      if (dueSnap.exists()) {
        const due = dueSnap.data() as Due;
        const refundAllocRatio = refundAmount / originalPayment.amount; // scale back proportionally or simple reduction
        const rollbackAmount = parseFloat((alloc.amount * refundAllocRatio).toFixed(2));
        
        const newPaid = Math.max(0, parseFloat((due.amountPaid - rollbackAmount).toFixed(2)));
        const newBalance = Math.min(due.netDue, parseFloat((due.balance + rollbackAmount).toFixed(2)));
        let newStatus: DueStatus = 'unpaid';
        if (newBalance === 0) newStatus = 'paid';
        else if (newPaid > 0) newStatus = 'partial';

        transaction.update(dueRef, {
          amountPaid: newPaid,
          balance: newBalance,
          baseStatus: newStatus,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Save refund record
    const refundPayment: Payment = {
      id: refundId,
      memberId: originalPayment.memberId,
      branchId: originalPayment.branchId,
      type: 'refund',
      amount: refundAmount,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: originalPayment.paymentMethod,
      receiptNumber: `REF-${originalPayment.receiptNumber}`,
      note: reason,
      allocations: [],
      status: 'completed',
      originalPaymentId,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
    };
    transaction.set(refundRef, refundPayment);

    // Audit log
    const log: Omit<AuditLog, 'id'> = {
      actorUid,
      actorName,
      action: 'Payment Refunded',
      entityType: 'payment',
      entityId: refundId,
      safeAfterSummary: `Refunded ₹${refundAmount} for receipt ${originalPayment.receiptNumber}`,
      timestamp: serverTimestamp(),
    };
    transaction.set(auditRef, log);
  });
}

// Membership Renewal (Transactional)
export async function renewMembershipAtomic(
  gymId: string,
  membershipData: Omit<Membership, 'id' | 'createdAt' | 'updatedAt'>,
  dueRecords: Omit<Due, 'id' | 'createdAt' | 'updatedAt'>[],
  actorUid: string,
  actorName: string
) {
  const membershipId = doc(collection(db, 'gyms', gymId, 'memberships')).id;
  const membershipRef = doc(db, 'gyms', gymId, 'memberships', membershipId);
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));

  // Update previous active memberships of the member to inactive/expired
  const prevMembershipsQuery = query(
    collection(db, 'gyms', gymId, 'memberships'),
    where('memberId', '==', membershipData.memberId),
    where('baseStatus', '==', 'active')
  );
  const activeSnaps = await getDocs(prevMembershipsQuery);

  await runLocalOrOnlineTransaction(db, async (transaction) => {
    // Set older ones to inactive
    activeSnaps.docs.forEach((d) => {
      transaction.update(d.ref, { baseStatus: 'inactive', updatedAt: serverTimestamp() });
    });

    // Write new membership
    const finalMembership: Membership = {
      ...membershipData,
      id: membershipId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(membershipRef, cleanUndefined(finalMembership));

    // Write generated dues
    for (let i = 0; i < dueRecords.length; i++) {
      const dRec = dueRecords[i];
      const dueId = `${membershipId}_due_${i}`;
      const dueRef = doc(db, 'gyms', gymId, 'dues', dueId);
      
      transaction.set(dueRef, cleanUndefined({
        ...dRec,
        id: dueId,
        membershipId, // bind correct membership id
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    }

    // Audit log
    const log: Omit<AuditLog, 'id'> = {
      actorUid,
      actorName,
      action: 'Membership Renewed',
      entityType: 'membership',
      entityId: membershipId,
      safeAfterSummary: `Renewed membership with plan ${membershipData.planNameSnapshot}`,
      timestamp: serverTimestamp(),
    };
    transaction.set(auditRef, cleanUndefined(log));
  });
}

// Archive and Restore Member
export async function archiveMember(gymId: string, memberId: string, actorUid: string, actorName: string) {
  const memberRef = doc(db, 'gyms', gymId, 'members', memberId);
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));
  
  const batch = writeBatch(db);
  batch.update(memberRef, {
    recordStatus: 'archived',
    archivedAt: serverTimestamp(),
    archivedBy: actorUid,
    updatedAt: serverTimestamp()
  });

  const log: Omit<AuditLog, 'id'> = {
    actorUid,
    actorName,
    action: 'Member Archived',
    entityType: 'member',
    entityId: memberId,
    safeAfterSummary: `Archived member profile`,
    timestamp: serverTimestamp(),
  };
  batch.set(auditRef, log);
  await batch.commit();
}

export async function restoreMember(gymId: string, memberId: string, actorUid: string, actorName: string) {
  const memberRef = doc(db, 'gyms', gymId, 'members', memberId);
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));
  
  const batch = writeBatch(db);
  batch.update(memberRef, {
    recordStatus: 'current',
    archivedAt: null,
    archivedBy: null,
    updatedAt: serverTimestamp()
  });

  const log: Omit<AuditLog, 'id'> = {
    actorUid,
    actorName,
    action: 'Member Restored',
    entityType: 'member',
    entityId: memberId,
    safeAfterSummary: `Restored member profile`,
    timestamp: serverTimestamp(),
  };
  batch.set(auditRef, log);
  await batch.commit();
}

// Permanent Deletion (Owner only)
export async function permanentlyDeleteMember(gymId: string, memberId: string, actorUid: string, actorName: string) {
  const memberRef = doc(db, 'gyms', gymId, 'members', memberId);
  const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));

  // Only delete memberships. We RETAIN payments and dues so that historical financial reporting (Dashboard) remains accurate.
  const membershipsSnap = await getDocs(query(collection(db, 'gyms', gymId, 'memberships'), where('memberId', '==', memberId)));

  const batch = writeBatch(db);
  membershipsSnap.docs.forEach(doc => batch.delete(doc.ref));
  batch.delete(memberRef);

  // Attempt to delete photo if it exists (via try/catch on photo path deletion)
  const memberSnap = await getDoc(memberRef);
  if (memberSnap.exists()) {
    const member = memberSnap.data() as Member;
    if (member.photoStoragePath) {
      try {
        const photoRef = ref(storage, member.photoStoragePath);
        await deleteObject(photoRef);
      } catch (err) {
        console.warn('Failed to delete member photo file from storage', err);
      }
    }
  }

  const log: Omit<AuditLog, 'id'> = {
    actorUid,
    actorName,
    action: 'Permanent Deletion',
    entityType: 'member',
    entityId: memberId,
    safeAfterSummary: `Permanently deleted member profile (financial history retained)`,
    timestamp: serverTimestamp(),
  };
  batch.set(auditRef, log);
  await batch.commit();
}

// Upload Member Photo
import { uploadBytes, getDownloadURL } from 'firebase/storage';

export async function uploadMemberPhoto(gymId: string, memberId: string | 'temp', file: Blob): Promise<string> {
  const isOffline = localStorage.getItem('gymdesk_offline_mode') === 'true';
  if (isOffline) {
    // In offline testing mode, fallback to base64 to avoid storage emulator requirements
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }
  
  const ext = file.type.split('/')[1] || 'jpeg';
  // If memberId is temp (during creation), use a random UUID
  const finalId = memberId === 'temp' ? Math.random().toString(36).substring(2, 15) : memberId;
  const path = `gyms/${gymId}/members/${finalId}/profile.${ext}`;
  const storageRef = ref(storage, path);
  
  await uploadBytes(storageRef, file);
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}
