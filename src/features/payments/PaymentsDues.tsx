import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Payment, Due, Member, Plan, Membership } from '../../types';
import { formatINR } from '../../utils/financeUtils';
import { getKolkataTodayString } from '../../utils/dateUtils';
import { 
  Search, 
  Filter, 
  RotateCcw, 
  AlertCircle, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Wallet, 
  Calendar, 
  Receipt,
  TrendingUp,
  Clock,
  CheckCircle2,
  X
} from 'lucide-react';

interface PaymentsDuesProps {
  onSelectMember?: (memberId: string) => void;
}

export const PaymentsDues: React.FC<PaymentsDuesProps> = ({ onSelectMember }) => {
  const { gym } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs: 'payments' (Ledger) or 'dues' (Outstanding)
  const [activeSubTab, setActiveSubTab] = useState<'dues' | 'payments'>('payments');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or 'YYYY-MM'
  const [startDate, setStartDate] = useState<string>(''); // YYYY-MM-DD
  const [endDate, setEndDate] = useState<string>(''); // YYYY-MM-DD
  const [selectedPlan, setSelectedPlan] = useState<string>('all');
  
  // Dues-specific filter
  const [dueStatusFilter, setDueStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'today' | 'upcoming' | 'paid' | 'partial' | 'waived'>('all');

  // Payments-specific filter
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'payment' | 'refund'>('all');
  const [payMethodFilter, setPayMethodFilter] = useState<string>('all');

  // Drawer & Sorting
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<string>('date_desc');

  // Pagination
  const pageSize = 25;
  const [currentPage, setCurrentPage] = useState(1);

  const todayStr = getKolkataTodayString();

  // Reset page to 1 whenever any filter, search, or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery, 
    selectedMonth, 
    startDate, 
    endDate, 
    selectedPlan, 
    dueStatusFilter, 
    paymentTypeFilter, 
    payMethodFilter, 
    sortBy, 
    activeSubTab
  ]);

  useEffect(() => {
    if (!gym) {
      setLoading(false);
      return;
    }

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 4000);

    const unsubPayments = onSnapshot(
      collection(db, 'gyms', gym.id, 'payments'), 
      (snap) => {
        setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
      },
      (err) => console.warn('PaymentsDues payments snapshot error:', err)
    );

    const unsubDues = onSnapshot(
      collection(db, 'gyms', gym.id, 'dues'), 
      (snap) => {
        setDues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Due)));
      },
      (err) => console.warn('PaymentsDues dues snapshot error:', err)
    );

    const unsubMembers = onSnapshot(
      collection(db, 'gyms', gym.id, 'members'), 
      (snap) => {
        setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
      },
      (err) => console.warn('PaymentsDues members snapshot error:', err)
    );

    const unsubPlans = onSnapshot(
      collection(db, 'gyms', gym.id, 'plans'), 
      (snap) => {
        setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan)));
      },
      (err) => console.warn('PaymentsDues plans snapshot error:', err)
    );

    const unsubMemberships = onSnapshot(
      collection(db, 'gyms', gym.id, 'memberships'), 
      (snap) => {
        clearTimeout(safetyTimer);
        setMemberships(snap.docs.map(d => ({ id: d.id, ...d.data() } as Membership)));
        setLoading(false);
      },
      (err) => {
        clearTimeout(safetyTimer);
        console.warn('PaymentsDues memberships snapshot error:', err);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      unsubPayments();
      unsubDues();
      unsubMembers();
      unsubPlans();
      unsubMemberships();
    };
  }, [gym]);

  // Lookup Maps
  const membersMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach(m => map.set(m.id, m));
    return map;
  }, [members]);

  const plansMap = useMemo(() => {
    const map = new Map<string, Plan>();
    plans.forEach(p => map.set(p.id, p));
    return map;
  }, [plans]);

  const membershipsMap = useMemo(() => {
    const map = new Map<string, Membership>();
    memberships.forEach(ms => map.set(ms.id, ms));
    return map;
  }, [memberships]);

  const duesMap = useMemo(() => {
    const map = new Map<string, Due>();
    dues.forEach(d => map.set(d.id, d));
    return map;
  }, [dues]);

  // Plan resolution helpers
  const getDuePlanName = (due: Due) => {
    const ms = membershipsMap.get(due.membershipId);
    if (ms?.planNameSnapshot) return ms.planNameSnapshot;
    if (ms?.planId) {
      const p = plansMap.get(ms.planId);
      if (p) return p.name;
    }
    const memberMs = memberships.filter(m => m.memberId === due.memberId);
    const activeMs = memberMs.find(m => m.baseStatus === 'active') || memberMs[0];
    if (activeMs?.planNameSnapshot) return activeMs.planNameSnapshot;
    return 'General Plan';
  };

  const getPaymentPlanName = (payment: Payment) => {
    if (payment.allocations && payment.allocations.length > 0) {
      const allocatedDue = duesMap.get(payment.allocations[0].dueId);
      if (allocatedDue) {
        const ms = membershipsMap.get(allocatedDue.membershipId);
        if (ms?.planNameSnapshot) return ms.planNameSnapshot;
        if (ms?.planId) {
          const p = plansMap.get(ms.planId);
          if (p) return p.name;
        }
      }
    }
    const memberMs = memberships.filter(m => m.memberId === payment.memberId);
    const activeMs = memberMs.find(m => m.baseStatus === 'active') || memberMs[0];
    if (activeMs?.planNameSnapshot) return activeMs.planNameSnapshot;
    return 'General Plan';
  };

  // Dynamic available months list from payments and dues
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    payments.forEach(p => {
      if (p.paymentDate && p.paymentDate.length >= 7) {
        monthsSet.add(p.paymentDate.substring(0, 7));
      }
    });
    dues.forEach(d => {
      if (d.dueDate && d.dueDate.length >= 7) {
        monthsSet.add(d.dueDate.substring(0, 7));
      }
    });
    monthsSet.add(todayStr.substring(0, 7));
    return Array.from(monthsSet).sort().reverse();
  }, [payments, dues, todayStr]);

  const formatMonthLabel = (mStr: string) => {
    try {
      const [y, m] = mStr.split('-').map(Number);
      const d = new Date(y, m - 1, 1);
      return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    } catch {
      return mStr;
    }
  };

  // Date/Month matching
  const matchDateOrMonth = (dateStr?: string) => {
    if (!dateStr) return false;
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    if (selectedMonth !== 'all' && !dateStr.startsWith(selectedMonth)) return false;
    return true;
  };

  // Search matching
  const matchSearch = (textList: (string | undefined)[], query: string) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    const words = q.split(/\s+/).filter(Boolean);
    const cleanTexts = textList.map(t => (t || '').toLowerCase());
    return words.every(w => cleanTexts.some(txt => txt.includes(w)));
  };

  // Derived Filtered Payments List
  const filteredPayments = useMemo(() => {
    const result = payments.filter(p => {
      // 1. Date / Month
      if (!matchDateOrMonth(p.paymentDate)) return false;

      // 2. Type filter (Fee Paid / Refund)
      if (paymentTypeFilter !== 'all' && p.type !== paymentTypeFilter) return false;

      // 3. Payment Method
      if (payMethodFilter !== 'all' && p.paymentMethod !== payMethodFilter) return false;

      // 4. Gym Plan filter
      if (selectedPlan !== 'all') {
        const planName = getPaymentPlanName(p).toLowerCase();
        const targetPlan = plans.find(pl => pl.id === selectedPlan);
        const targetName = (targetPlan ? targetPlan.name : selectedPlan).toLowerCase();
        if (!planName.includes(targetName)) return false;
      }

      // 5. Search
      const m = membersMap.get(p.memberId);
      const searchFields = [
        m?.fullName,
        m?.memberCode,
        m?.phone,
        p.receiptNumber,
        p.transactionReference,
        p.note,
        getPaymentPlanName(p)
      ];
      if (!matchSearch(searchFields, searchQuery)) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'date_asc') return (a.paymentDate || '').localeCompare(b.paymentDate || '');
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'amount_asc') return a.amount - b.amount;
      if (sortBy === 'name_asc') {
        const nameA = membersMap.get(a.memberId)?.fullName || '';
        const nameB = membersMap.get(b.memberId)?.fullName || '';
        return nameA.localeCompare(nameB);
      }
      // default: date_desc
      return (b.paymentDate || '').localeCompare(a.paymentDate || '');
    });

    return result;
  }, [
    payments, 
    selectedMonth, 
    startDate, 
    endDate, 
    paymentTypeFilter, 
    payMethodFilter, 
    selectedPlan, 
    searchQuery, 
    sortBy, 
    membersMap, 
    plans, 
    duesMap, 
    membershipsMap
  ]);

  // Derived Filtered Dues List
  const filteredDues = useMemo(() => {
    const result = dues.filter(d => {
      // 1. Date / Month (matches dueDate)
      if (!matchDateOrMonth(d.dueDate)) return false;

      // 2. Status Filter
      const isOverdue = d.dueDate < todayStr && d.balance > 0;
      if (dueStatusFilter === 'pending') {
        if (d.balance <= 0 || d.baseStatus === 'waived') return false;
      } else if (dueStatusFilter === 'overdue') {
        if (!isOverdue || d.baseStatus === 'waived') return false;
      } else if (dueStatusFilter === 'today') {
        if (d.dueDate !== todayStr || d.balance <= 0) return false;
      } else if (dueStatusFilter === 'upcoming') {
        if (d.dueDate <= todayStr || d.balance <= 0) return false;
      } else if (dueStatusFilter === 'paid') {
        if (d.balance > 0 || d.baseStatus === 'waived') return false;
      } else if (dueStatusFilter === 'partial') {
        if (d.amountPaid <= 0 || d.balance <= 0) return false;
      } else if (dueStatusFilter === 'waived') {
        if (d.baseStatus !== 'waived') return false;
      }

      // 3. Gym Plan filter
      if (selectedPlan !== 'all') {
        const planName = getDuePlanName(d).toLowerCase();
        const targetPlan = plans.find(pl => pl.id === selectedPlan);
        const targetName = (targetPlan ? targetPlan.name : selectedPlan).toLowerCase();
        if (!planName.includes(targetName)) return false;
      }

      // 4. Search
      const m = membersMap.get(d.memberId);
      const searchFields = [
        m?.fullName,
        m?.memberCode,
        m?.phone,
        getDuePlanName(d)
      ];
      if (!matchSearch(searchFields, searchQuery)) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'due_date_desc') return (b.dueDate || '').localeCompare(a.dueDate || '');
      if (sortBy === 'balance_desc') return b.balance - a.balance;
      if (sortBy === 'balance_asc') return a.balance - b.balance;
      if (sortBy === 'name_asc') {
        const nameA = membersMap.get(a.memberId)?.fullName || '';
        const nameB = membersMap.get(b.memberId)?.fullName || '';
        return nameA.localeCompare(nameB);
      }
      // default: due_date_asc
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });

    return result;
  }, [
    dues, 
    selectedMonth, 
    startDate, 
    endDate, 
    dueStatusFilter, 
    selectedPlan, 
    searchQuery, 
    sortBy, 
    membersMap, 
    plans, 
    membershipsMap, 
    todayStr
  ]);

  // Monthly Revenue & Payment Stats
  const paymentStats = useMemo(() => {
    let grossPayments = 0;
    let totalRefunds = 0;
    let cashTotal = 0;
    let upiTotal = 0;
    let cardTotal = 0;
    let bankTotal = 0;
    let otherTotal = 0;

    filteredPayments.forEach(p => {
      if (p.status === 'void') return;
      if (p.type === 'payment') {
        grossPayments += p.amount;
        if (p.paymentMethod === 'cash') cashTotal += p.amount;
        else if (p.paymentMethod === 'upi') upiTotal += p.amount;
        else if (p.paymentMethod === 'card') cardTotal += p.amount;
        else if (p.paymentMethod === 'bank_transfer') bankTotal += p.amount;
        else otherTotal += p.amount;
      } else if (p.type === 'refund') {
        totalRefunds += p.amount;
      }
    });

    const netCollections = grossPayments - totalRefunds;

    return {
      grossPayments,
      totalRefunds,
      netCollections,
      cashTotal,
      upiTotal,
      cardTotal,
      bankTotal,
      otherTotal,
      count: filteredPayments.length,
    };
  }, [filteredPayments]);

  // Dues Stats
  const dueStats = useMemo(() => {
    let totalNetDue = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let overdueBalance = 0;

    filteredDues.forEach(d => {
      if (d.baseStatus === 'waived') return;
      totalNetDue += (d.netDue || 0);
      totalPaid += (d.amountPaid || 0);
      totalBalance += (d.balance || 0);
      if ((d.balance || 0) > 0 && d.dueDate < todayStr) {
        overdueBalance += (d.balance || 0);
      }
    });

    return {
      totalNetDue,
      totalPaid,
      totalBalance,
      overdueBalance,
      count: filteredDues.length,
    };
  }, [filteredDues, todayStr]);

  // Active filters calculation
  const activeFilterCount = 
    (searchQuery.trim() !== '' ? 1 : 0) +
    (selectedMonth !== 'all' ? 1 : 0) +
    (startDate !== '' || endDate !== '' ? 1 : 0) +
    (selectedPlan !== 'all' ? 1 : 0) +
    (activeSubTab === 'payments' && paymentTypeFilter !== 'all' ? 1 : 0) +
    (activeSubTab === 'payments' && payMethodFilter !== 'all' ? 1 : 0) +
    (activeSubTab === 'dues' && dueStatusFilter !== 'all' ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedMonth('all');
    setStartDate('');
    setEndDate('');
    setSelectedPlan('all');
    setPaymentTypeFilter('all');
    setPayMethodFilter('all');
    setDueStatusFilter('all');
    setSortBy(activeSubTab === 'payments' ? 'date_desc' : 'due_date_asc');
    setCurrentPage(1);
  };

  // Safe pagination
  const activeListLength = activeSubTab === 'payments' ? filteredPayments.length : filteredDues.length;
  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedPayments = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, safeCurrentPage, pageSize]);

  const paginatedDues = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredDues.slice(start, start + pageSize);
  }, [filteredDues, safeCurrentPage, pageSize]);

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-96">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="border-b border-border-dark pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Ledger & Dues</h1>
          <p className="text-sm text-muted-gray">Track gym outstanding balances and incoming revenue transactions</p>
        </div>

        {/* Selected View Badge */}
        {selectedMonth !== 'all' && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary">
            <Calendar className="h-3.5 w-3.5" />
            <span>Month: {formatMonthLabel(selectedMonth)}</span>
            <button 
              onClick={() => setSelectedMonth('all')}
              className="ml-1 hover:text-white cursor-pointer"
              title="Clear Month Filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-dark gap-2">
        <button
          onClick={() => {
            setActiveSubTab('payments');
            setSortBy('date_desc');
          }}
          className={`px-4 py-2.5 text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-2 transition-colors ${
            activeSubTab === 'payments' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>Payment Log Ledger</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border-muted font-normal">
            {filteredPayments.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('dues');
            setSortBy('due_date_asc');
          }}
          className={`px-4 py-2.5 text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-2 transition-colors ${
            activeSubTab === 'dues' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Outstanding Dues</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border-muted font-normal">
            {filteredDues.length}
          </span>
        </button>
      </div>

      {/* MONTHLY TALLY SUMMARY CARDS */}
      {activeSubTab === 'payments' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Gross Fee Paid */}
          <div className="bg-surface border border-border-dark p-5 rounded-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-muted-gray">Monthly Gross Income</span>
              <span className="p-1.5 bg-emerald-950/50 border border-emerald-500/20 text-emerald-400 rounded-lg">
                <ArrowDownLeft className="h-4 w-4" />
              </span>
            </div>
            <p className="text-xl font-bold text-emerald-400 m-0">{formatINR(paymentStats.grossPayments, false)}</p>
            <p className="text-[11px] text-muted-gray mt-1">Total Fee Paid incoming</p>
          </div>

          {/* Card 2: Total Refunds */}
          <div className="bg-surface border border-border-dark p-5 rounded-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-muted-gray">Total Refunds</span>
              <span className="p-1.5 bg-red-950/50 border border-red-500/20 text-red-400 rounded-lg">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
            <p className="text-xl font-bold text-red-400 m-0">{formatINR(paymentStats.totalRefunds, false)}</p>
            <p className="text-[11px] text-muted-gray mt-1">Refunded to members</p>
          </div>

          {/* Card 3: Net Collections */}
          <div className="bg-surface border border-border-dark p-5 rounded-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-muted-gray">Net Collections</span>
              <span className="p-1.5 bg-primary/10 border border-primary/30 text-primary rounded-lg">
                <TrendingUp className="h-4 w-4" />
              </span>
            </div>
            <p className="text-xl font-bold text-primary m-0">{formatINR(paymentStats.netCollections, false)}</p>
            <p className="text-[11px] text-muted-gray mt-1">Gross minus Refunds</p>
          </div>

          {/* Card 4: Method Breakdown */}
          <div className="bg-surface border border-border-dark p-5 rounded-2xl flex flex-col justify-between">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-muted-gray">Method Split</span>
              <span className="text-[10px] text-muted-gray">{paymentStats.count} entries</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-gray">Cash:</span>
                <span className="font-semibold text-text-main">{formatINR(paymentStats.cashTotal, false)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-gray">UPI:</span>
                <span className="font-semibold text-text-main">{formatINR(paymentStats.upiTotal, false)}</span>
              </div>
              {(paymentStats.cardTotal > 0 || paymentStats.bankTotal > 0 || paymentStats.otherTotal > 0) && (
                <div className="flex justify-between">
                  <span className="text-muted-gray">Card/Bank/Other:</span>
                  <span className="font-semibold text-text-main">
                    {formatINR(paymentStats.cardTotal + paymentStats.bankTotal + paymentStats.otherTotal, false)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Due Card 1: Total Outstanding */}
          <div className="bg-surface border border-border-dark p-5 rounded-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-muted-gray">Remaining Balance</span>
              <span className="p-1.5 bg-red-950/50 border border-red-500/20 text-red-400 rounded-lg">
                <Wallet className="h-4 w-4" />
              </span>
            </div>
            <p className="text-xl font-bold text-red-500 m-0">{formatINR(dueStats.totalBalance, false)}</p>
            <p className="text-[11px] text-muted-gray mt-1">Total unpaid balance</p>
          </div>

          {/* Due Card 2: Overdue */}
          <div className="bg-surface border border-border-dark p-5 rounded-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-muted-gray">Overdue Amount</span>
              <span className="p-1.5 bg-amber-950/50 border border-amber-500/20 text-amber-400 rounded-lg">
                <AlertCircle className="h-4 w-4" />
              </span>
            </div>
            <p className="text-xl font-bold text-amber-400 m-0">{formatINR(dueStats.overdueBalance, false)}</p>
            <p className="text-[11px] text-muted-gray mt-1">Past scheduled due date</p>
          </div>

          {/* Due Card 3: Paid on Invoices */}
          <div className="bg-surface border border-border-dark p-5 rounded-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-muted-gray">Collected on Dues</span>
              <span className="p-1.5 bg-emerald-950/50 border border-emerald-500/20 text-emerald-400 rounded-lg">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <p className="text-xl font-bold text-emerald-400 m-0">{formatINR(dueStats.totalPaid, false)}</p>
            <p className="text-[11px] text-muted-gray mt-1">Amount received toward dues</p>
          </div>

          {/* Due Card 4: Total Invoiced */}
          <div className="bg-surface border border-border-dark p-5 rounded-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-muted-gray">Total Invoiced</span>
              <span className="p-1.5 bg-surface-light border border-border-muted text-muted-gray rounded-lg">
                <Receipt className="h-4 w-4" />
              </span>
            </div>
            <p className="text-xl font-bold text-text-main m-0">{formatINR(dueStats.totalNetDue, false)}</p>
            <p className="text-[11px] text-muted-gray mt-1">{dueStats.count} dues matching filter</p>
          </div>
        </div>
      )}

      {/* FILTER CONTROLS BAR */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-gray" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border-muted hover:border-primary focus:border-primary rounded-xl pl-10 pr-4 py-2.5 text-xs text-text-main outline-none transition-colors"
            placeholder={
              activeSubTab === 'payments'
                ? "Search by member name, code, phone, receipt #, reference, or note..."
                : "Search dues by member name, code, phone, or plan..."
            }
          />
        </div>

        {/* Primary Month Filter Dropdown */}
        <div className="flex gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              // Clear custom date range when picking specific month
              if (e.target.value !== 'all') {
                setStartDate('');
                setEndDate('');
              }
            }}
            className="bg-surface border border-border-muted hover:border-primary rounded-xl px-3 py-2.5 text-xs text-text-main outline-none font-medium cursor-pointer"
          >
            <option value="all">📅 All Months</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>

          {/* Filters Toggle Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 border px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-surface border-border-muted hover:border-primary text-text-main'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="bg-surface-light border border-border-muted hover:border-primary text-xs font-semibold px-3 py-2.5 rounded-xl text-text-main cursor-pointer flex items-center gap-1.5 transition-colors"
              title="Reset all filters"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted-gray" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* DETAILED FILTER DRAWER */}
      {showFilters && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
            {/* 1. Date Range: From */}
            <div>
              <label className="block text-muted-gray font-medium mb-1.5">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedMonth('all'); // allow custom date range
                }}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
              />
            </div>

            {/* 2. Date Range: To */}
            <div>
              <label className="block text-muted-gray font-medium mb-1.5">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedMonth('all'); // allow custom date range
                }}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
              />
            </div>

            {/* 3. Gym Plan Filter */}
            <div>
              <label className="block text-muted-gray font-medium mb-1.5">Gym Plan</label>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
              >
                <option value="all">All Plans</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Tab Specific Filters */}
            {activeSubTab === 'payments' ? (
              <>
                {/* 4. Payment / Refund Type */}
                <div>
                  <label className="block text-muted-gray font-medium mb-1.5">Transaction Type</label>
                  <select
                    value={paymentTypeFilter}
                    onChange={(e) => setPaymentTypeFilter(e.target.value as any)}
                    className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
                  >
                    <option value="all">All Types</option>
                    <option value="payment">Fee Paid Only</option>
                    <option value="refund">Refunds Only</option>
                  </select>
                </div>

                {/* 5. Payment Method */}
                <div>
                  <label className="block text-muted-gray font-medium mb-1.5">Payment Method</label>
                  <select
                    value={payMethodFilter}
                    onChange={(e) => setPayMethodFilter(e.target.value)}
                    className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
                  >
                    <option value="all">All Methods</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                {/* 4. Due Status */}
                <div className="sm:col-span-2">
                  <label className="block text-muted-gray font-medium mb-1.5">Due Status</label>
                  <select
                    value={dueStatusFilter}
                    onChange={(e) => setDueStatusFilter(e.target.value as any)}
                    className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
                  >
                    <option value="all">All Due Records</option>
                    <option value="pending">Pending Dues (Unpaid & Partial)</option>
                    <option value="overdue">Overdue Dues Only</option>
                    <option value="today">Due Today</option>
                    <option value="upcoming">Upcoming Dues</option>
                    <option value="paid">Fully Paid / Cleared</option>
                    <option value="partial">Partially Paid</option>
                    <option value="waived">Waived Invoices</option>
                  </select>
                </div>
              </>
            )}

            {/* 6. Sort By */}
            <div>
              <label className="block text-muted-gray font-medium mb-1.5">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
              >
                {activeSubTab === 'payments' ? (
                  <>
                    <option value="date_desc">Date (Newest First)</option>
                    <option value="date_asc">Date (Oldest First)</option>
                    <option value="amount_desc">Amount (Highest First)</option>
                    <option value="amount_asc">Amount (Lowest First)</option>
                    <option value="name_asc">Member Name (A to Z)</option>
                  </>
                ) : (
                  <>
                    <option value="due_date_asc">Due Date (Earliest First)</option>
                    <option value="due_date_desc">Due Date (Latest First)</option>
                    <option value="balance_desc">Remaining Balance (Highest)</option>
                    <option value="balance_asc">Remaining Balance (Lowest)</option>
                    <option value="name_asc">Member Name (A to Z)</option>
                  </>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* DUES CONTENT TABLE */}
      {activeSubTab === 'dues' && (
        <div className="bg-surface border border-border-dark rounded-2xl overflow-hidden shadow-md">
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-dark text-muted-gray font-semibold bg-surface/50">
                  <th className="p-4">Member</th>
                  <th className="p-4">Gym Plan</th>
                  <th className="p-4">Due Date</th>
                  <th className="p-4">Billing Period</th>
                  <th className="p-4">Total Net Due</th>
                  <th className="p-4">Amount Paid</th>
                  <th className="p-4">Remaining Balance</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {paginatedDues.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-muted-gray">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="h-8 w-8 text-muted-gray/70" />
                        <p className="text-sm font-semibold text-text-main">No dues matching filters</p>
                        <p className="text-xs text-muted-gray">
                          Try adjusting the month, plan, or status filters.
                        </p>
                        {hasActiveFilters && (
                          <button
                            onClick={clearAllFilters}
                            className="mt-2 px-3 py-1.5 bg-primary/10 border border-primary text-primary hover:bg-primary/20 text-xs font-semibold rounded-xl cursor-pointer"
                          >
                            Clear All Filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedDues.map((d) => {
                    const m = membersMap.get(d.memberId);
                    const isOverdue = d.dueDate < todayStr && d.balance > 0;
                    const planName = getDuePlanName(d);

                    let statusBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400';
                    let statusLabel = 'pending';

                    if (d.baseStatus === 'waived') {
                      statusBadgeClass = 'bg-neutral-800 text-muted-gray border border-border-muted';
                      statusLabel = 'waived';
                    } else if (d.balance === 0) {
                      statusBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400';
                      statusLabel = 'paid';
                    } else if (isOverdue) {
                      statusBadgeClass = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400 border border-red-500/20';
                      statusLabel = 'overdue';
                    } else if (d.amountPaid > 0) {
                      statusBadgeClass = 'bg-blue-950 text-blue-400 border border-blue-500/20';
                      statusLabel = 'partial';
                    }

                    return (
                      <tr key={d.id} className="hover:bg-surface-light transition-colors">
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => d.memberId && onSelectMember?.(d.memberId)}
                            disabled={!d.memberId || !onSelectMember}
                            className={`text-left group flex flex-col items-start ${d.memberId && onSelectMember ? 'cursor-pointer' : 'cursor-default'}`}
                            title={d.memberId && onSelectMember ? `View profile of ${m ? m.fullName : 'member'}` : undefined}
                          >
                            <span className={`font-semibold text-sm ${d.memberId && onSelectMember ? 'text-text-main group-hover:text-primary group-hover:underline' : 'text-text-main'} transition-colors`}>
                              {m ? m.fullName : 'Unknown Member'}
                            </span>
                            <span className="text-[10px] text-muted-gray mt-0.5">
                              {m ? m.memberCode : ''} {m?.memberCode && m?.phone ? '|' : ''} {m ? m.phone : ''}
                            </span>
                          </button>
                        </td>
                        <td className="p-4 font-medium text-text-main">
                          <span className="px-2 py-1 bg-surface-light border border-border-muted rounded-lg text-[11px]">
                            {planName}
                          </span>
                        </td>
                        <td className={`p-4 font-semibold ${isOverdue ? 'text-red-500 font-bold' : 'text-text-main'}`}>
                          {d.dueDate} {isOverdue && <span className="text-[10px] block text-red-400 font-normal">Overdue</span>}
                        </td>
                        <td className="p-4 text-muted-gray">{d.billingPeriodStart} to {d.billingPeriodEnd}</td>
                        <td className="p-4 font-medium">{formatINR(d.netDue, false)}</td>
                        <td className="p-4 text-emerald-400 font-medium">{formatINR(d.amountPaid, false)}</td>
                        <td className={`p-4 font-bold ${d.balance > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                          {formatINR(d.balance, false)}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${statusBadgeClass}`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAYMENTS LEDGER CONTENT TABLE */}
      {activeSubTab === 'payments' && (
        <div className="bg-surface border border-border-dark rounded-2xl overflow-hidden shadow-md">
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-dark text-muted-gray font-semibold bg-surface/50">
                  <th className="p-4">Receipt</th>
                  <th className="p-4">Member</th>
                  <th className="p-4">Plan / Package</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Method</th>
                  <th className="p-4">Reference / Note</th>
                  <th className="p-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {paginatedPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-muted-gray">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="h-8 w-8 text-muted-gray/70" />
                        <p className="text-sm font-semibold text-text-main">No transactions found</p>
                        <p className="text-xs text-muted-gray">
                          No payment or refund records match the active month and filter criteria.
                        </p>
                        {hasActiveFilters && (
                          <button
                            onClick={clearAllFilters}
                            className="mt-2 px-3 py-1.5 bg-primary/10 border border-primary text-primary hover:bg-primary/20 text-xs font-semibold rounded-xl cursor-pointer"
                          >
                            Clear All Filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedPayments.map((p) => {
                    const m = membersMap.get(p.memberId);
                    const planName = getPaymentPlanName(p);
                    const isRefund = p.type === 'refund';

                    return (
                      <tr key={p.id} className="hover:bg-surface-light transition-colors">
                        <td className="p-4 font-mono font-bold text-text-main">{p.receiptNumber}</td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => p.memberId && onSelectMember?.(p.memberId)}
                            disabled={!p.memberId || !onSelectMember}
                            className={`text-left group flex flex-col items-start ${p.memberId && onSelectMember ? 'cursor-pointer' : 'cursor-default'}`}
                            title={p.memberId && onSelectMember ? `View profile of ${m ? m.fullName : 'member'}` : undefined}
                          >
                            <span className={`font-semibold text-sm ${p.memberId && onSelectMember ? 'text-text-main group-hover:text-primary group-hover:underline' : 'text-text-main'} transition-colors`}>
                              {m ? m.fullName : 'Unknown Member'}
                            </span>
                            <span className="text-[10px] text-muted-gray mt-0.5">
                              {m ? m.memberCode : ''} {m?.memberCode && m?.phone ? '|' : ''} {m ? m.phone : ''}
                            </span>
                          </button>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-1 bg-surface-light border border-border-muted rounded-lg text-[11px] font-medium text-text-main">
                            {planName}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-text-main">{p.paymentDate}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            isRefund 
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400 border border-red-500/20' 
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                          }`}>
                            {isRefund ? (
                              <>
                                <ArrowUpRight className="h-3 w-3" />
                                <span>REFUND</span>
                              </>
                            ) : (
                              <>
                                <ArrowDownLeft className="h-3 w-3" />
                                <span>FEE PAID</span>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="uppercase text-[11px] font-semibold text-text-main bg-canvas border border-border-muted px-2 py-0.5 rounded">
                            {p.paymentMethod}
                          </span>
                        </td>
                        <td className="p-4 text-muted-gray max-w-xs truncate">
                          {p.note || p.transactionReference || 'N/A'}
                        </td>
                        <td className={`p-4 font-bold text-right text-sm ${isRefund ? 'text-red-500' : 'text-emerald-400'}`}>
                          {isRefund ? '-' : '+'}{formatINR(p.amount, false)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAGINATION CONTROLS */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-xs text-muted-gray pt-4 border-t border-border-dark">
          <button 
            disabled={safeCurrentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="px-3 py-1.5 bg-surface border border-border-muted rounded-lg hover:border-primary disabled:opacity-50 cursor-pointer transition-colors"
          >
            Previous
          </button>
          <span>
            Page {safeCurrentPage} of {totalPages} ({activeListLength} items)
          </span>
          <button 
            disabled={safeCurrentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            className="px-3 py-1.5 bg-surface border border-border-muted rounded-lg hover:border-primary disabled:opacity-50 cursor-pointer transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

