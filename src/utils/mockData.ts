import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getKolkataTodayString, extendEndDateByDays } from './dateUtils';
import { generateDuesForMembership } from './financeUtils';

export async function seedDemoData(gymId: string, actorUid: string, actorName: string) {
  const batch = writeBatch(db);
  const todayStr = getKolkataTodayString();
  const currentYear = new Date().getFullYear();

  // 1. Create Demo Plans
  const plans = [
    { id: 'plan_1', name: 'General Monthly', price: 1000, durationInMonths: 1, durationInDays: 30, type: 'general' },
    { id: 'plan_2', name: '3 month (Standard: 3000)', price: 3000, durationInMonths: 3, durationInDays: 90, type: 'general' },
    { id: 'plan_3', name: 'Quarterly Special', price: 2500, durationInMonths: 3, durationInDays: 90, type: 'general' },
    { id: 'plan_4', name: 'Annual Elite', price: 8000, durationInMonths: 12, durationInDays: 365, type: 'general' },
  ];

  plans.forEach(plan => {
    const planRef = doc(db, 'gyms', gymId, 'plans', plan.id);
    batch.set(planRef, {
      ...plan,
      taxEnabled: false,
      taxRate: 0,
      baseAmount: plan.price,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actorUid,
    });
  });

  // 2. Create Demo Members
  const members = [
    { 
      id: 'demo_member_1', 
      memberCode: `GYM-${currentYear}-0001`,
      fullName: 'Siddharth Sagar Gupta',
      phone: '9876543210',
      gender: 'male',
      joinDate: todayStr,
      recordStatus: 'active',
      version: 1,
      plan: plans[0] // 30 days
    },
    { 
      id: 'demo_member_2', 
      memberCode: `GYM-${currentYear}-0002`,
      fullName: 'Aman Arora',
      phone: '8765432109',
      gender: 'male',
      joinDate: extendEndDateByDays(todayStr, -15),
      recordStatus: 'active',
      version: 1,
      plan: plans[1] // 90 days
    },
    { 
      id: 'demo_member_3', 
      memberCode: `GYM-${currentYear}-0003`,
      fullName: 'Rohan Sharma',
      phone: '7654321098',
      gender: 'male',
      joinDate: extendEndDateByDays(todayStr, -60),
      recordStatus: 'active',
      version: 1,
      plan: plans[0] // 30 days (expired)
    },
    { 
      id: 'demo_member_4', 
      memberCode: `GYM-${currentYear}-0004`,
      fullName: 'Priya Patel',
      phone: '6543210987',
      gender: 'female',
      joinDate: extendEndDateByDays(todayStr, -5),
      recordStatus: 'active',
      version: 1,
      plan: plans[2] // 365 days
    },
  ];

  members.forEach(member => {
    const { plan, ...memberData } = member;
    const memberRef = doc(db, 'gyms', gymId, 'members', member.id);
    
    batch.set(memberRef, {
      ...memberData,
      searchName: memberData.fullName.toLowerCase(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Create Membership
    const msId = `ms_${member.id}_1`;
    const msRef = doc(db, 'gyms', gymId, 'memberships', msId);
    const endDate = extendEndDateByDays(memberData.joinDate, plan.durationInDays);
    
    const baseStatus = endDate < todayStr ? 'expired' : 'active';

    const membership = {
      id: msId,
      memberId: member.id,
      planId: plan.id,
      planNameSnapshot: plan.name,
      planPriceSnapshot: plan.price,
      grossAmount: plan.price,
      joiningFee: 0,
      discountType: 'none',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      finalAmount: plan.price,
      startDate: memberData.joinDate,
      endDate: endDate,
      baseStatus: baseStatus,
      paymentStatus: 'paid', // Default to paid for all except Aman
      billingFrequency: 'upfront',
      branchId: 'main',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actorUid,
    };

    if (member.id === 'demo_member_2') {
      membership.paymentStatus = 'unpaid';
    }

    batch.set(msRef, membership);

    // Create Dues
    const dues = generateDuesForMembership({
      memberId: member.id,
      membershipId: msId,
      branchId: 'main',
      startDate: membership.startDate,
      endDate: membership.endDate,
      finalAmount: membership.finalAmount,
      grossAmount: membership.grossAmount,
      joiningFee: 0,
      discountAmount: 0,
      taxAmount: 0,
      billingFrequency: 'upfront',
      durationMonths: plan.durationInMonths,
    });

    dues.forEach(dueInfo => {
      const dueId = dueInfo.id || doc(collection(db, 'gyms', gymId, 'dues')).id;
      const dueRef = doc(db, 'gyms', gymId, 'dues', dueId);
      
      let balance = dueInfo.netDue;
      if (member.id !== 'demo_member_2') {
        balance = 0; // Paid fully
      }

      batch.set(dueRef, {
        ...dueInfo,
        id: dueId,
        balance: balance,
        amountPaid: dueInfo.netDue - balance,
        baseStatus: balance === 0 ? 'paid' : (dueInfo.dueDate < todayStr ? 'overdue' : 'unpaid'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // If paid, create a payment record
      if (balance === 0) {
        const payId = doc(collection(db, 'gyms', gymId, 'payments')).id;
        const payRef = doc(db, 'gyms', gymId, 'payments', payId);
        
        batch.set(payRef, {
          id: payId,
          memberId: member.id,
          branchId: 'main',
          type: 'payment',
          amount: dueInfo.netDue,
          paymentDate: memberData.joinDate, // Paid on join date
          paymentMethod: 'cash',
          status: 'completed',
          receiptNumber: `RCPT-2026-${String(Math.floor(Math.random() * 1000)).padStart(6, '0')}`,
          allocations: [{
            dueId: dueId,
            amountApplied: dueInfo.netDue
          }],
          createdAt: serverTimestamp(),
          createdBy: actorUid,
        });
      }
    });

    // Create Audit Log
    const auditRef = doc(collection(db, 'gyms', gymId, 'auditLogs'));
    batch.set(auditRef, {
      actorUid,
      actorName,
      action: 'Member Created',
      entityType: 'member',
      entityId: member.id,
      safeAfterSummary: `Created demo member ${member.fullName}`,
      timestamp: serverTimestamp(),
    });
  });

  // Also update counter
  const counterRef = doc(db, 'gyms', gymId, 'counters', 'members');
  batch.set(counterRef, { current: members.length }, { merge: true });

  await batch.commit();
}
