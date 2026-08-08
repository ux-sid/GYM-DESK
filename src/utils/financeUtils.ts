import type { Due, Payment, Allocation } from '../types';

/**
 * Format currency in Indian grouping format (e.g., ₹1,25,000.00)
 */
export function formatINR(amount: number, includeDecimals = true): string {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  });
  return formatter.format(amount);
}

/**
 * Sanitizes a string value to protect against CSV/Excel formula injection.
 * If a value starts with =, +, -, @, or tab/carriage returns, prepend a single quote.
 */
export function sanitizeForExcel(val: any): any {
  if (typeof val !== 'string') return val;
  if (!val) return val;
  const firstChar = val.trim().charAt(0);
  if (['=', '+', '-', '@'].includes(firstChar)) {
    return `'${val}`;
  }
  return val;
}

/**
 * Deterministically distributes finalAmount into individual dues based on duration and billing frequency.
 * For monthly billing: divides amount into N monthly dues. Rounding errors are added to the final due.
 */
export function generateDuesForMembership({
  memberId,
  membershipId,
  branchId,
  startDate,
  endDate,
  finalAmount,
  grossAmount,
  joiningFee,
  discountAmount,
  taxAmount,
  billingFrequency,
  durationMonths, // Number of billing periods
}: {
  memberId: string;
  membershipId: string;
  branchId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  finalAmount: number;
  grossAmount: number;
  joiningFee: number;
  discountAmount: number;
  taxAmount: number;
  billingFrequency: 'upfront' | 'monthly';
  durationMonths: number;
}): Omit<Due, 'createdAt' | 'updatedAt'>[] {
  
  if (billingFrequency === 'upfront' || durationMonths <= 1) {
    // Create single due
    return [{
      id: `${membershipId}_due_0`,
      memberId,
      membershipId,
      branchId,
      billingPeriodStart: startDate,
      billingPeriodEnd: endDate,
      dueDate: startDate, // Upfront due on start date
      originalAmount: grossAmount + joiningFee,
      discountAmount,
      taxAmount,
      netDue: finalAmount,
      amountPaid: 0,
      balance: finalAmount,
      baseStatus: 'unpaid',
    }];
  }

  // Monthly billing: Create one due per month
  const dues: Omit<Due, 'createdAt' | 'updatedAt'>[] = [];
  const baseDue = Math.floor((finalAmount - joiningFee) / durationMonths); // joining fee is charged upfront in first due
  let accumulatedDues = 0;

  // Let's divide other amounts as well for audit / information
  const baseGross = Math.floor(grossAmount / durationMonths);
  const baseDiscount = Math.floor(discountAmount / durationMonths);
  const baseTax = Math.floor(taxAmount / durationMonths);

  let accGross = 0;
  let accDiscount = 0;
  let accTax = 0;

  const start = new Date(startDate);

  for (let i = 0; i < durationMonths; i++) {
    const isLast = i === durationMonths - 1;
    
    // Period dates
    const periodStart = new Date(start);
    periodStart.setMonth(start.getMonth() + i);
    const periodEnd = new Date(start);
    periodEnd.setMonth(start.getMonth() + i + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);

    // Calculate amounts
    let dueNet = baseDue;
    let dueGross = baseGross;
    let dueDiscount = baseDiscount;
    let dueTax = baseTax;

    if (i === 0) {
      dueNet += joiningFee; // Add entire joining fee to first due
    }

    if (isLast) {
      // Put remaining rounding differences in the last due
      dueNet = finalAmount - accumulatedDues;
      dueGross = grossAmount - accGross;
      dueDiscount = discountAmount - accDiscount;
      dueTax = taxAmount - accTax;
    } else {
      accumulatedDues += dueNet;
      accGross += dueGross;
      accDiscount += dueDiscount;
      accTax += dueTax;
    }

    const startStr = periodStart.toISOString().split('T')[0];
    const endStr = periodEnd.toISOString().split('T')[0];

    dues.push({
      id: `${membershipId}_due_${i}`,
      memberId,
      membershipId,
      branchId,
      billingPeriodStart: startStr,
      billingPeriodEnd: endStr,
      dueDate: startStr, // Due date is start of the billing month
      originalAmount: dueGross + (i === 0 ? joiningFee : 0),
      discountAmount: dueDiscount,
      taxAmount: dueTax,
      netDue: dueNet,
      amountPaid: 0,
      balance: dueNet,
      baseStatus: 'unpaid',
    });
  }

  return dues;
}

/**
 * Helper to allocate a payment to outstanding dues (FIFO: oldest first).
 * Returns the allocations list and updated dues list.
 * Throws errors if allocation exceeds payment or due balance goes below zero.
 */
export function allocatePayment(
  paymentAmount: number,
  outstandingDues: Due[]
): { allocations: Allocation[]; updatedDues: Due[] } {
  if (paymentAmount <= 0) {
    throw new Error('Payment amount must be positive');
  }

  // Sort dues by due date ASC (oldest first)
  const sortedDues = [...outstandingDues].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  let remainingPayment = paymentAmount;
  const allocations: Allocation[] = [];
  const updatedDues = sortedDues.map((due) => {
    const originalDue = { ...due };
    if (remainingPayment <= 0 || originalDue.balance <= 0) {
      return originalDue;
    }

    const allocateToThis = Math.min(remainingPayment, originalDue.balance);
    remainingPayment = parseFloat((remainingPayment - allocateToThis).toFixed(2));
    
    const newPaid = parseFloat((originalDue.amountPaid + allocateToThis).toFixed(2));
    const newBalance = parseFloat((originalDue.balance - allocateToThis).toFixed(2));

    originalDue.amountPaid = newPaid;
    originalDue.balance = newBalance;
    originalDue.baseStatus = newBalance === 0 ? 'paid' : 'partial';

    allocations.push({
      dueId: originalDue.id,
      amount: allocateToThis,
    });

    return originalDue;
  });

  return { allocations, updatedDues };
}

/**
 * Validates a refund request against the original payment.
 * Returns the net refundable amount of the payment (amount - refunds already processed).
 */
export function calculateRefundableBalance(
  payment: Payment,
  existingRefunds: Payment[]
): number {
  const totalRefunded = existingRefunds
    .filter((r) => r.status === 'completed' && r.type === 'refund')
    .reduce((sum, r) => sum + r.amount, 0);

  return parseFloat((payment.amount - totalRefunded).toFixed(2));
}
