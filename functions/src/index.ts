import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { z } from 'zod';

admin.initializeApp();
const db = admin.firestore();

// Helper to verify auth and role inside a function
async function verifyGymRole(authContext: any, gymId: string, allowedRoles: string[]) {
  if (!authContext) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const uid = authContext.uid;
  const staffDoc = await db.collection('gyms').doc(gymId).collection('staff').doc(uid).get();
  if (!staffDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'User is not part of this gym.');
  }
  const role = staffDoc.data()?.role;
  if (!allowedRoles.includes(role)) {
    throw new functions.https.HttpsError('permission-denied', `Insufficient permission. Required: [${allowedRoles.join(', ')}], current: ${role}`);
  }
  return { uid, role, name: staffDoc.data()?.fullName || 'Staff' };
}

// 1. Sequential Member Code Generation
export const generateMemberCode = functions.https.onCall(async (request) => {
  const schema = z.object({
    gymId: z.string(),
  });
  
  const parsed = schema.safeParse(request.data);
  if (!parsed.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid request body parameters.');
  }
  const { gymId } = parsed.data;
  
  await verifyGymRole(request.auth, gymId, ['owner', 'manager', 'staff']);
  
  const counterRef = db.collection('gyms').doc(gymId).collection('counters').doc('members');
  
  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(counterRef);
    let nextNum = 1;
    if (snap.exists()) {
      nextNum = (snap.data()?.current || 0) + 1;
    }
    transaction.set(counterRef, { current: nextNum }, { merge: true });
    
    const currentYear = new Date().getFullYear();
    return `GYM-${currentYear}-${String(nextNum).padStart(4, '0')}`;
  });
});

// 2. Sequential Receipt Generation
export const generateReceiptNumber = functions.https.onCall(async (request) => {
  const schema = z.object({
    gymId: z.string(),
  });
  
  const parsed = schema.safeParse(request.data);
  if (!parsed.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters.');
  }
  const { gymId } = parsed.data;
  
  await verifyGymRole(request.auth, gymId, ['owner', 'manager', 'staff']);
  
  const counterRef = db.collection('gyms').doc(gymId).collection('counters').doc('receipts');
  
  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(counterRef);
    let nextNum = 1;
    if (snap.exists()) {
      nextNum = (snap.data()?.current || 0) + 1;
    }
    transaction.set(counterRef, { current: nextNum }, { merge: true });
    
    const currentYear = new Date().getFullYear();
    return `RCPT-${currentYear}-${String(nextNum).padStart(6, '0')}`;
  });
});

// 3. Payment Creation
export const recordPayment = functions.https.onCall(async (request) => {
  const schema = z.object({
    gymId: z.string(),
    memberId: z.string(),
    branchId: z.string(),
    membershipId: z.string().optional(),
    amount: z.number().positive(),
    paymentDate: z.string(),
    paymentMethod: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other']),
    transactionReference: z.string().optional(),
    note: z.string().optional(),
  });

  const parsed = schema.safeParse(request.data);
  if (!parsed.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters.');
  }
  const { gymId, memberId, branchId, membershipId, amount, paymentDate, paymentMethod, transactionReference, note } = parsed.data;
  
  const actor = await verifyGymRole(request.auth, gymId, ['owner', 'manager', 'staff']);

  const paymentId = db.collection('gyms').doc(gymId).collection('payments').doc().id;
  const paymentRef = db.collection('gyms').doc(gymId).collection('payments').doc(paymentId);
  const counterRef = db.collection('gyms').doc(gymId).collection('counters').doc('receipts');
  const auditRef = db.collection('gyms').doc(gymId).collection('auditLogs').doc();

  // Find all unpaid or partial dues sorted by date
  const duesSnap = await db.collection('gyms').doc(gymId).collection('dues')
    .where('memberId', '==', memberId)
    .where('baseStatus', 'in', ['unpaid', 'partial'])
    .get();

  const sortedDues = duesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return await db.runTransaction(async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    let nextNum = 1;
    if (counterSnap.exists()) {
      nextNum = (counterSnap.data()?.current || 0) + 1;
    }
    transaction.set(counterRef, { current: nextNum }, { merge: true });

    const currentYear = new Date().getFullYear();
    const receiptNumber = `RCPT-${currentYear}-${String(nextNum).padStart(6, '0')}`;

    let remainingPayment = amount;
    const allocations: any[] = [];

    for (const due of sortedDues) {
      if (remainingPayment <= 0) break;
      const dueRef = db.collection('gyms').doc(gymId).collection('dues').doc(due.id);
      
      const allocateToThis = Math.min(remainingPayment, due.balance);
      remainingPayment = parseFloat((remainingPayment - allocateToThis).toFixed(2));
      
      const newPaid = parseFloat((due.amountPaid + allocateToThis).toFixed(2));
      const newBalance = parseFloat((due.balance - allocateToThis).toFixed(2));
      const newStatus = newBalance === 0 ? 'paid' : 'partial';

      transaction.update(dueRef, {
        amountPaid: newPaid,
        balance: newBalance,
        baseStatus: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      allocations.push({ dueId: due.id, amount: allocateToThis });
    }

    const finalPayment = {
      id: paymentId,
      memberId,
      branchId,
      membershipId: membershipId || null,
      type: 'payment',
      amount,
      paymentDate,
      paymentMethod,
      transactionReference: transactionReference || null,
      receiptNumber,
      note: note || '',
      allocations,
      status: 'completed',
      createdBy: actor.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    transaction.set(paymentRef, finalPayment);

    const log = {
      actorUid: actor.uid,
      actorName: actor.name,
      action: 'Payment Recorded',
      entityType: 'payment',
      entityId: paymentId,
      safeAfterSummary: `Recorded payment of ₹${amount} (Receipt: ${receiptNumber})`,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    transaction.set(auditRef, log);

    return { paymentId, receiptNumber };
  });
});
