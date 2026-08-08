import { describe, it, expect } from 'vitest';
import { calculateMembershipEndDate } from '../utils/dateUtils';
import { 
  sanitizeForExcel, 
  generateDuesForMembership, 
  allocatePayment, 
  calculateRefundableBalance 
} from '../utils/financeUtils';
import type { Due, Payment } from '../types';

describe('GymDesk Business Rules & Calculations', () => {

  // 1. Membership End Date Calculation
  describe('Membership End-Date Calculation', () => {
    it('calculates duration in days correctly', () => {
      // Inclusive end: Jan 1 + 10 days = Jan 10
      const end = calculateMembershipEndDate('2026-01-01', 10, 'days');
      expect(end).toBe('2026-01-10');
    });

    it('calculates duration in months correctly', () => {
      // Inclusive end: Jan 1 + 1 month = Jan 31
      const end = calculateMembershipEndDate('2026-01-01', 1, 'months');
      expect(end).toBe('2026-01-31');
    });

    it('calculates duration in years correctly', () => {
      // Inclusive end: Jan 1 2026 + 1 year = Dec 31 2026
      const end = calculateMembershipEndDate('2026-01-01', 1, 'years');
      expect(end).toBe('2026-12-31');
    });
  });

  // 2. Month-End Date Handling
  describe('Month-End Date Handling', () => {
    it('snaps month end to last day of February during leap years', () => {
      // Leap year 2024: Jan 31 + 1 month -> Feb 29 (inclusive end Feb 28?)
      // Jan 31 + 1 month = Feb 29. -1 day (inclusive) = Feb 28.
      // Wait, let's verify standard month offset:
      // If we start Jan 31, 1 month ends Feb 28 (non-leap) or Feb 29 (leap).
      const endLeap = calculateMembershipEndDate('2024-01-31', 1, 'months');
      expect(endLeap).toBe('2024-02-28'); // Jan 31 + 1 month snaps to Feb 29, then -1 day for inclusive end = Feb 28.
      
      const endNonLeap = calculateMembershipEndDate('2026-01-31', 1, 'months');
      expect(endNonLeap).toBe('2026-02-27'); // Snaps to Feb 28, then -1 = Feb 27.
    });

    it('handles February end-date bounds correctly', () => {
      const end = calculateMembershipEndDate('2026-02-28', 1, 'months');
      expect(end).toBe('2026-03-27');
    });
  });

  // 3. Discount, Tax & Due Rounding Distribution
  describe('Monthly Due Generation & Rounding Distribution', () => {
    it('allocates upfront due correctly in a single record', () => {
      const dues = generateDuesForMembership({
        memberId: 'm1',
        membershipId: 'ms1',
        branchId: 'b1',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        finalAmount: 1000,
        grossAmount: 900,
        joiningFee: 100,
        discountAmount: 0,
        taxAmount: 0,
        billingFrequency: 'upfront',
        durationMonths: 1,
      });

      expect(dues.length).toBe(1);
      expect(dues[0].netDue).toBe(1000);
      expect(dues[0].balance).toBe(1000);
    });

    it('splits monthly billing into N dues and adds rounding remainder to final due', () => {
      // 2500 final amount divided over 3 months
      // 2500 - 100 joining fee = 2400.
      // 2400 / 3 = 800 per month.
      // First month: 800 + 100 joining fee = 900.
      // Second month: 800.
      // Third month: 800.
      const dues = generateDuesForMembership({
        memberId: 'm1',
        membershipId: 'ms1',
        branchId: 'b1',
        startDate: '2026-08-01',
        endDate: '2026-10-31',
        finalAmount: 2500,
        grossAmount: 2400,
        joiningFee: 100,
        discountAmount: 0,
        taxAmount: 0,
        billingFrequency: 'monthly',
        durationMonths: 3,
      });

      expect(dues.length).toBe(3);
      expect(dues[0].netDue).toBe(900); // 800 + 100 joining fee
      expect(dues[1].netDue).toBe(800);
      expect(dues[2].netDue).toBe(800);
      
      const totalSum = dues.reduce((sum, d) => sum + d.netDue, 0);
      expect(totalSum).toBe(2500);
    });

    it('correctly handles fractional division and distributes rounding differences to final month', () => {
      // 2500.50 final amount over 3 months, joining fee 0.
      // 2500.50 / 3 = 833.50. Let's see:
      // Our function does: Math.floor(2500.50 / 3) = 833.
      // Month 1: 833
      // Month 2: 833
      // Month 3: 2500.50 - (833 + 833) = 834.50
      const dues = generateDuesForMembership({
        memberId: 'm1',
        membershipId: 'ms1',
        branchId: 'b1',
        startDate: '2026-08-01',
        endDate: '2026-10-31',
        finalAmount: 2500.50,
        grossAmount: 2500.50,
        joiningFee: 0,
        discountAmount: 0,
        taxAmount: 0,
        billingFrequency: 'monthly',
        durationMonths: 3,
      });

      expect(dues[0].netDue).toBe(833);
      expect(dues[1].netDue).toBe(833);
      expect(dues[2].netDue).toBe(834.50);
      
      const totalSum = dues.reduce((sum, d) => sum + d.netDue, 0);
      expect(totalSum).toBe(2500.50);
    });
  });

  // 4. Payment Allocation (FIFO)
  describe('Payment Allocation Logic (FIFO)', () => {
    const sampleDues: Due[] = [
      {
        id: 'd1',
        memberId: 'm1',
        membershipId: 'ms1',
        branchId: 'b1',
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        dueDate: '2026-08-01', // oldest
        originalAmount: 1000,
        discountAmount: 0,
        taxAmount: 0,
        netDue: 1000,
        amountPaid: 0,
        balance: 1000,
        baseStatus: 'unpaid',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'd2',
        memberId: 'm1',
        membershipId: 'ms1',
        branchId: 'b1',
        billingPeriodStart: '2026-09-01',
        billingPeriodEnd: '2026-09-30',
        dueDate: '2026-09-01', // newer
        originalAmount: 1000,
        discountAmount: 0,
        taxAmount: 0,
        netDue: 1000,
        amountPaid: 0,
        balance: 1000,
        baseStatus: 'unpaid',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ];

    it('allocates simple payment to oldest due first', () => {
      const { allocations, updatedDues } = allocatePayment(1200, sampleDues);
      
      expect(allocations.length).toBe(2);
      expect(allocations.find(a => a.dueId === 'd1')?.amount).toBe(1000);
      expect(allocations.find(a => a.dueId === 'd2')?.amount).toBe(200);

      const d1 = updatedDues.find(d => d.id === 'd1');
      const d2 = updatedDues.find(d => d.id === 'd2');

      expect(d1?.balance).toBe(0);
      expect(d1?.baseStatus).toBe('paid');

      expect(d2?.balance).toBe(800);
      expect(d2?.baseStatus).toBe('partial');
    });

    it('prevents due balance from going below zero', () => {
      const { updatedDues } = allocatePayment(2500, sampleDues); // excess payment
      
      const d1 = updatedDues.find(d => d.id === 'd1');
      const d2 = updatedDues.find(d => d.id === 'd2');

      expect(d1?.balance).toBe(0);
      expect(d2?.balance).toBe(0);
    });
  });

  // 5. Refund Limits
  describe('Refund Limit Validation', () => {
    const samplePayment: Payment = {
      id: 'p1',
      memberId: 'm1',
      branchId: 'b1',
      type: 'payment',
      amount: 1500,
      paymentDate: '2026-08-01',
      paymentMethod: 'upi',
      receiptNumber: 'RCPT-1',
      allocations: [],
      status: 'completed',
      createdBy: 'u1',
      createdAt: new Date()
    };

    it('calculates remaining refundable balance correctly', () => {
      const refunds: Payment[] = [
        {
          id: 'ref1',
          memberId: 'm1',
          branchId: 'b1',
          type: 'refund',
          amount: 500,
          paymentDate: '2026-08-05',
          paymentMethod: 'upi',
          receiptNumber: 'REF-1',
          allocations: [],
          status: 'completed',
          originalPaymentId: 'p1',
          createdBy: 'u1',
          createdAt: new Date()
        }
      ];

      const balance = calculateRefundableBalance(samplePayment, refunds);
      expect(balance).toBe(1000);
    });
  });

  // 6. Excel Formula Injection Protection
  describe('Excel Formula Injection Protection', () => {
    it('prepends single quote to values starting with danger tokens', () => {
      expect(sanitizeForExcel('=1+2')).toBe("'=1+2");
      expect(sanitizeForExcel('+91987')).toBe("'+91987");
      expect(sanitizeForExcel('-100')).toBe("'-100");
      expect(sanitizeForExcel('@admin')).toBe("'@admin");
    });

    it('leaves standard values unchanged', () => {
      expect(sanitizeForExcel('Hello World')).toBe('Hello World');
      expect(sanitizeForExcel(125000)).toBe(125000);
    });
  });
});
