import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Payment, Due, Member } from '../../types';
import { formatINR } from '../../utils/financeUtils';
import { getKolkataTodayString } from '../../utils/dateUtils';
import { Search } from 'lucide-react';

export const PaymentsDues: React.FC = () => {
  const { gym } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs
  const [activeSubTab, setActiveSubTab] = useState<'dues' | 'payments'>('dues');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dueFilter, setDueFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const [payMethodFilter, setPayMethodFilter] = useState('all');

  const todayStr = getKolkataTodayString();

  useEffect(() => {
    if (!gym) return;

    const unsubPayments = onSnapshot(collection(db, 'gyms', gym.id, 'payments'), (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
    });

    const unsubDues = onSnapshot(collection(db, 'gyms', gym.id, 'dues'), (snap) => {
      setDues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Due)));
    });

    const unsubMembers = onSnapshot(collection(db, 'gyms', gym.id, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
      setLoading(false);
    });

    return () => {
      unsubPayments();
      unsubDues();
      unsubMembers();
    };
  }, [gym]);

  // Derived Dues List
  const filteredDues = useMemo(() => {
    let result = dues.filter(d => d.balance > 0 && d.baseStatus !== 'waived');

    // Due filters
    if (dueFilter === 'overdue') {
      result = result.filter(d => d.dueDate < todayStr);
    } else if (dueFilter === 'today') {
      result = result.filter(d => d.dueDate === todayStr);
    } else if (dueFilter === 'upcoming') {
      result = result.filter(d => d.dueDate > todayStr);
    }

    // Search filter (member name or code)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((d) => {
        const m = members.find(mem => mem.id === d.memberId);
        return m?.fullName.toLowerCase().includes(q) || m?.memberCode.toLowerCase().includes(q);
      });
    }

    return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [dues, dueFilter, searchQuery, members, todayStr]);

  // Derived Payments List
  const filteredPayments = useMemo(() => {
    let result = [...payments];

    if (payMethodFilter !== 'all') {
      result = result.filter(p => p.paymentMethod === payMethodFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => {
        const m = members.find(mem => mem.id === p.memberId);
        return (
          m?.fullName.toLowerCase().includes(q) ||
          m?.memberCode.toLowerCase().includes(q) ||
          p.receiptNumber.toLowerCase().includes(q)
        );
      });
    }

    return result.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [payments, payMethodFilter, searchQuery, members]);

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
      <div className="border-b border-border-dark pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Ledger & Dues</h1>
          <p className="text-sm text-muted-gray">Track gym outstanding balances and incoming revenue transactions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-dark gap-2">
        <button
          onClick={() => {
            setActiveSubTab('dues');
            setSearchQuery('');
          }}
          className={`px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer ${
            activeSubTab === 'dues' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          Outstanding Dues
        </button>
        <button
          onClick={() => {
            setActiveSubTab('payments');
            setSearchQuery('');
          }}
          className={`px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer ${
            activeSubTab === 'payments' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          Payment Log Ledger
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-gray" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border-muted hover:border-primary rounded-xl pl-10 pr-4 py-2 text-xs text-text-main outline-none outline-0"
            placeholder={activeSubTab === 'dues' ? "Search dues by member..." : "Search payments by member / receipt..."}
          />
        </div>

        {/* Tab-specific Filters */}
        <div className="flex gap-2 text-xs">
          {activeSubTab === 'dues' ? (
            <select
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value as any)}
              className="bg-surface border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
            >
              <option value="all">All Pending Dues</option>
              <option value="overdue">Overdue Dues</option>
              <option value="today">Due Today</option>
              <option value="upcoming">Upcoming Dues</option>
            </select>
          ) : (
            <select
              value={payMethodFilter}
              onChange={(e) => setPayMethodFilter(e.target.value)}
              className="bg-surface border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
            >
              <option value="all">All Methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </select>
          )}
        </div>
      </div>

      {/* DUES CONTENT */}
      {activeSubTab === 'dues' && (
        <div className="bg-surface border border-border-dark rounded-2xl overflow-hidden shadow-md">
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-dark text-muted-gray font-semibold bg-surface/50">
                  <th className="p-4">Member</th>
                  <th className="p-4">Due Date</th>
                  <th className="p-4">Billing Period</th>
                  <th className="p-4">Total Net Due</th>
                  <th className="p-4">Paid Amount</th>
                  <th className="p-4">Remaining Balance</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {filteredDues.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-gray">No outstanding dues matching filters.</td>
                  </tr>
                ) : (
                  filteredDues.map((d) => {
                    const m = members.find(mem => mem.id === d.memberId);
                    const isOverdue = d.dueDate < todayStr;
                    return (
                      <tr key={d.id} className="hover:bg-surface-light">
                        <td className="p-4">
                          <p className="font-semibold text-text-main text-sm">{m ? m.fullName : 'Unknown'}</p>
                          <p className="text-[10px] text-muted-gray mt-0.5">{m ? m.memberCode : ''} | {m ? m.phone : ''}</p>
                        </td>
                        <td className={`p-4 font-semibold ${isOverdue ? 'text-red-500 font-bold' : ''}`}>
                          {d.dueDate} {isOverdue ? '(Overdue)' : ''}
                        </td>
                        <td className="p-4 text-muted-gray">{d.billingPeriodStart} to {d.billingPeriodEnd}</td>
                        <td className="p-4 font-medium">{formatINR(d.netDue, false)}</td>
                        <td className="p-4 text-emerald-400">{formatINR(d.amountPaid, false)}</td>
                        <td className="p-4 text-red-500 font-bold">{formatINR(d.balance, false)}</td>
                        <td className="p-4">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                            isOverdue ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-500/20' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                          }`}>
                            {isOverdue ? 'overdue' : 'pending'}
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

      {/* PAYMENTS LEDGER CONTENT */}
      {activeSubTab === 'payments' && (
        <div className="bg-surface border border-border-dark rounded-2xl overflow-hidden shadow-md">
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-dark text-muted-gray font-semibold bg-surface/50">
                  <th className="p-4">Receipt</th>
                  <th className="p-4">Member</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Method</th>
                  <th className="p-4">Reference</th>
                  <th className="p-4">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-gray">No transactions recorded matching filters.</td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => {
                    const m = members.find(mem => mem.id === p.memberId);
                    return (
                      <tr key={p.id} className="hover:bg-surface-light">
                        <td className="p-4 font-mono font-bold text-text-main">{p.receiptNumber}</td>
                        <td className="p-4">
                          <p className="font-semibold text-text-main">{m ? m.fullName : 'Unknown'}</p>
                          <p className="text-[10px] text-muted-gray mt-0.5">{m ? m.memberCode : ''}</p>
                        </td>
                        <td className="p-4">{p.paymentDate}</td>
                        <td className="p-4">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                            p.type === 'payment' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400'
                          }`}>
                            {p.type}
                          </span>
                        </td>
                        <td className="p-4 uppercase">{p.paymentMethod}</td>
                        <td className="p-4 text-muted-gray">{p.transactionReference || 'N/A'}</td>
                        <td className={`p-4 font-bold ${p.type === 'refund' ? 'text-red-500' : 'text-emerald-400'}`}>
                          {p.type === 'refund' ? '-' : ''}{formatINR(p.amount, false)}
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
    </div>
  );
};
