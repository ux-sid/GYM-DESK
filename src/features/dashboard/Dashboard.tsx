import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Member, Membership, Due, Payment } from '../../types';
import { formatINR } from '../../utils/financeUtils';
import { getKolkataTodayString } from '../../utils/dateUtils';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, Users, AlertTriangle, AlertCircle, 
  CheckCircle2, DollarSign, PlusCircle, RefreshCw, FileText 
} from 'lucide-react';

const getValidMonthStr = (createdAt: any) => {
  if (!createdAt) return '';
  try {
    let date: Date;
    if (createdAt.toDate && typeof createdAt.toDate === 'function') {
      date = createdAt.toDate();
    } else {
      date = new Date(createdAt);
    }
    if (isNaN(date.getTime())) return '';
    return date.toISOString().substring(0, 7);
  } catch {
    return '';
  }
};

interface DashboardProps {
  onNavigate: (tab: string) => void;
  onAddMember: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onAddMember }) => {
  const { gym } = useAuth();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Selected Month (Default Current Month)
  const todayStr = getKolkataTodayString();
  const currentMonthYear = todayStr.substring(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState(currentMonthYear);

  useEffect(() => {
    if (!gym) return;

    // Load Collections with real-time listeners
    const unsubMembers = onSnapshot(collection(db, 'gyms', gym.id, 'members'), (snap) => {
      const allMembers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Member));
      const activeMembers = allMembers.filter(m => m.recordStatus !== 'archived');
      setMembers(activeMembers);

      // Auto-restore data if workspace has 0 members
      if (snap.empty) {
        import('../../utils/mockData').then(({ seedDemoData }) => {
          seedDemoData(gym.id, 'owner', 'Gym Owner').catch(() => {});
        });
      }
    });

    const unsubMemberships = onSnapshot(collection(db, 'gyms', gym.id, 'memberships'), (snap) => {
      setMemberships(snap.docs.map(d => ({ id: d.id, ...d.data() } as Membership)));
    });

    const unsubDues = onSnapshot(collection(db, 'gyms', gym.id, 'dues'), (snap) => {
      setDues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Due)));
    });

    const unsubPayments = onSnapshot(collection(db, 'gyms', gym.id, 'payments'), (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
      setLoading(false);
    });

    return () => {
      unsubMembers();
      unsubMemberships();
      unsubDues();
      unsubPayments();
    };
  }, [gym]);

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-96">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // --- Calculations ---


  // Month Range
  const startOfMonthStr = `${selectedMonth}-01`;
  const endOfMonthStr = `${selectedMonth}-31`; // simplified bound

  // Filter payments inside selected month
  const monthPayments = payments.filter((p) => {
    if (p.status === 'void') return false;
    return p.paymentDate >= startOfMonthStr && p.paymentDate <= endOfMonthStr;
  });

  const grossCollections = monthPayments
    .filter(p => p.type === 'payment')
    .reduce((sum, p) => sum + p.amount, 0);

  const refunds = monthPayments
    .filter(p => p.type === 'refund')
    .reduce((sum, p) => sum + p.amount, 0);

  const netCollections = grossCollections - refunds;

  // Payments split by methods
  const cashPayments = monthPayments.filter(p => p.paymentMethod === 'cash' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
  const upiPayments = monthPayments.filter(p => p.paymentMethod === 'upi' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
  const cardPayments = monthPayments.filter(p => p.paymentMethod === 'card' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
  const bankPayments = monthPayments.filter(p => p.paymentMethod === 'bank_transfer' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
  const otherPayments = monthPayments.filter(p => p.paymentMethod === 'other' && p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);

  // Members lists
  const activeMembers = members.filter(m => m.recordStatus === 'current');
  const activeMemberIds = new Set(activeMembers.map(m => m.id));

  // Outstanding dues as of today (for active members only)
  const outstandingDues = dues
    .filter(d => d.baseStatus !== 'waived' && activeMemberIds.has(d.memberId))
    .reduce((sum, d) => sum + d.balance, 0);

  // Overdue members count
  const overdueMembersCount = members.filter(m => {
    if (m.recordStatus !== 'current') return false;
    const memberDues = dues.filter(d => d.memberId === m.id);
    return memberDues.some(d => d.balance > 0 && d.dueDate < todayStr && d.baseStatus !== 'waived');
  }).length;

  // Expiring in next 7 days count
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];

  const expiringSoonCount = memberships.filter(ms => {
    if (ms.baseStatus !== 'active') return false;
    return ms.endDate >= todayStr && ms.endDate <= sevenDaysStr;
  }).length;

  // New members this month
  const newMembersThisMonthCount = members.filter(m => {
    return m.joinDate >= startOfMonthStr && m.joinDate <= endOfMonthStr && m.recordStatus === 'current';
  }).length;

  // Renewals this month (Memberships created this month that aren't the first membership)
  // Simple heuristic: count of memberships created this month for existing members
  const renewalsThisMonth = memberships.filter(ms => {
    return getValidMonthStr(ms.createdAt) === selectedMonth;
  }).length - newMembersThisMonthCount;

  // --- Charts Data ---

  // 1. Last 6 months net collections
  const last6MonthsData = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const mStr = d.toISOString().substring(0, 7); // YYYY-MM
    const mLabel = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
    
    const mPayments = payments.filter((p) => {
      if (p.status === 'void') return false;
      return p.paymentDate.startsWith(mStr);
    });
    
    const g = mPayments.filter(p => p.type === 'payment').reduce((sum, p) => sum + p.amount, 0);
    const r = mPayments.filter(p => p.type === 'refund').reduce((sum, p) => sum + p.amount, 0);
    
    return {
      month: mLabel,
      amount: g - r
    };
  }).reverse();

  // 2. Payment Method Split
  const pieData = [
    { name: 'Cash', value: cashPayments },
    { name: 'UPI', value: upiPayments },
    { name: 'Card', value: cardPayments },
    { name: 'Bank Transfer', value: bankPayments },
    { name: 'Other', value: otherPayments },
  ].filter(d => d.value > 0);

  const COLORS = ['#FF5C00', '#FF8533', '#1C1C1E', '#3A3A3C', '#8E8E93'];



  // Overdue Lists
  const overdueMembersList = members.filter(m => {
    if (m.recordStatus !== 'current') return false;
    const memberDues = dues.filter(d => d.memberId === m.id);
    return memberDues.some(d => d.balance > 0 && d.dueDate < todayStr && d.baseStatus !== 'waived');
  }).slice(0, 5);

  return (
    <div className="flex-1 space-y-6">
      {/* Header Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border-dark pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Dashboard</h1>
          <p className="text-sm text-muted-gray">{gym?.name} Operations Overview</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-center">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-surface border border-border-muted hover:border-primary focus:border-primary text-text-main rounded-xl px-3 py-2 text-sm transition-colors w-full sm:w-auto outline-none"
          />
          <button
            onClick={onAddMember}
            className="bg-primary hover:bg-primary-dark text-white font-semibold py-2 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            <span className="text-sm">Add Member</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Net Collections */}
        <div className="bg-surface border border-border-dark p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start text-muted-gray mb-2">
            <span className="text-xs font-medium">Collections ({selectedMonth})</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-main mb-0.5">{formatINR(netCollections, false)}</h3>
            <span className="text-[10px] text-emerald-400 font-medium">Net Revenue</span>
          </div>
        </div>

        {/* Outstanding Dues */}
        <div className="bg-surface border border-border-dark p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start text-muted-gray mb-2">
            <span className="text-xs font-medium">Outstanding Dues</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-main mb-0.5">{formatINR(outstandingDues, false)}</h3>
            <span className="text-[10px] text-amber-400 font-medium">Unpaid Balance</span>
          </div>
        </div>

        {/* Active Members */}
        <div className="bg-surface border border-border-dark p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start text-muted-gray mb-2">
            <span className="text-xs font-medium">Active Members</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-main mb-0.5">{activeMembers.length}</h3>
            <span className="text-[10px] text-primary-light font-medium">Joined & Current</span>
          </div>
        </div>

        {/* Overdue Members */}
        <div className="bg-surface border border-border-dark p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start text-muted-gray mb-2">
            <span className="text-xs font-medium">Overdue Members</span>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-main mb-0.5">{overdueMembersCount}</h3>
            <span className="text-[10px] text-red-400 font-medium">Pending Dues</span>
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="bg-surface border border-border-dark p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start text-muted-gray mb-2">
            <span className="text-xs font-medium">Expiring (7 Days)</span>
            <RefreshCw className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-main mb-0.5">{expiringSoonCount}</h3>
            <span className="text-[10px] text-blue-400 font-medium">Needs Renewal</span>
          </div>
        </div>

        {/* New Members */}
        <div className="bg-surface border border-border-dark p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start text-muted-gray mb-2">
            <span className="text-xs font-medium">New Members</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-main mb-0.5">{newMembersThisMonthCount}</h3>
            <span className="text-[10px] text-emerald-400 font-medium">Joined This Month</span>
          </div>
        </div>
      </div>

      {/* Secondary Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-surface/50 border border-border-dark p-4 rounded-2xl">
        <div className="text-center md:border-r border-border-dark py-2">
          <p className="text-xs text-muted-gray">Gross Collected</p>
          <p className="text-base font-semibold text-text-main">{formatINR(grossCollections, false)}</p>
        </div>
        <div className="text-center md:border-r border-border-dark py-2">
          <p className="text-xs text-muted-gray">Total Refunded</p>
          <p className="text-base font-semibold text-text-main">{formatINR(refunds, false)}</p>
        </div>
        <div className="text-center md:border-r border-border-dark py-2">
          <p className="text-xs text-muted-gray">UPI vs Cash Ratio</p>
          <p className="text-base font-semibold text-text-main">
            {upiPayments > 0 || cashPayments > 0 ? (
              `${Math.round((upiPayments / (upiPayments + cashPayments || 1)) * 100)}% UPI`
            ) : 'N/A'}
          </p>
        </div>
        <div className="text-center py-2">
          <p className="text-xs text-muted-gray">Renewals this Month</p>
          <p className="text-base font-semibold text-text-main">{renewalsThisMonth}</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Six Month Collections */}
        <div className="lg:col-span-2 bg-surface border border-border-dark p-6 rounded-2xl">
          <h3 className="text-sm font-semibold text-text-main mb-4">6-Month Net Collections</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last6MonthsData}>
                <XAxis dataKey="month" stroke="#8E8E93" fontSize={11} tickLine={false} />
                <YAxis stroke="#8E8E93" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1C1C1E', borderColor: '#2C2C30' }} 
                  labelStyle={{ color: '#FFFFFF' }} 
                />
                <Bar dataKey="amount" fill="#FF5C00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-surface border border-border-dark p-6 rounded-2xl">
          <h3 className="text-sm font-semibold text-text-main mb-4">Payment Method Distribution</h3>
          <div className="h-64 flex flex-col justify-between items-center">
            {pieData.length === 0 ? (
              <div className="h-full flex justify-center items-center text-xs text-muted-gray">
                No payment transactions recorded.
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="80%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legends */}
                <div className="flex flex-wrap gap-2 justify-center text-[10px]">
                  {pieData.map((item, index) => (
                    <span key={item.name} className="flex items-center gap-1.5 text-muted-gray">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[index] }}></span>
                      {item.name} ({formatINR(item.value, false)})
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Overdue / Action Items List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Member List */}
        <div className="bg-surface border border-border-dark p-6 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-text-main">Overdue Member Roster</h3>
            <button 
              onClick={() => onNavigate('members')}
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>

          {overdueMembersList.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-gray flex flex-col justify-center items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <span>Great job! No member has overdue fees.</span>
            </div>
          ) : (
            <div className="divide-y divide-border-dark">
              {overdueMembersList.map((m) => {
                const unpaidDues = dues.filter(d => d.memberId === m.id && d.balance > 0 && d.dueDate < todayStr && d.baseStatus !== 'waived');
                const totalOverdue = unpaidDues.reduce((sum, d) => sum + d.balance, 0);
                return (
                  <div key={m.id} className="py-3 flex justify-between items-center first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-text-main">{m.fullName}</p>
                      <p className="text-xs text-muted-gray">{m.memberCode} | {m.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500">{formatINR(totalOverdue, false)}</p>
                      <p className="text-[10px] text-muted-gray">Overdue Since: {unpaidDues[0]?.dueDate}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Actions Panel */}
        <div className="bg-surface border border-border-dark p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-main mb-4">Quick Operations</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={onAddMember}
                className="bg-primary hover:bg-primary-dark transition-all text-white p-4 rounded-xl flex flex-col items-center justify-center gap-2 active:scale-95 shadow-md text-center cursor-pointer"
              >
                <PlusCircle className="h-6 w-6" />
                <span className="text-xs font-semibold">Add Member</span>
              </button>
              
              <button
                onClick={() => onNavigate('members')}
                className="bg-surface-light hover:bg-border-muted hover:text-text-main transition-all text-text-main p-4 rounded-xl border border-border-muted flex flex-col items-center justify-center gap-2 active:scale-95 shadow-md text-center cursor-pointer"
              >
                <RefreshCw className="h-6 w-6 text-primary" />
                <span className="text-xs font-semibold">Renew Membership</span>
              </button>
              
              <button
                onClick={() => onNavigate('payments')}
                className="bg-surface-light hover:bg-border-muted hover:text-text-main transition-all text-text-main p-4 rounded-xl border border-border-muted flex flex-col items-center justify-center gap-2 active:scale-95 shadow-md text-center cursor-pointer"
              >
                <DollarSign className="h-6 w-6 text-emerald-400" />
                <span className="text-xs font-semibold">Record Payment</span>
              </button>

              <button
                onClick={() => onNavigate('reports')}
                className="bg-surface-light hover:bg-border-muted hover:text-text-main transition-all text-text-main p-4 rounded-xl border border-border-muted flex flex-col items-center justify-center gap-2 active:scale-95 shadow-md text-center cursor-pointer"
              >
                <FileText className="h-6 w-6 text-blue-400" />
                <span className="text-xs font-semibold">Monthly Export</span>
              </button>
            </div>
          </div>
          
          <div className="border-t border-border-dark pt-4 mt-6">
            <p className="text-[10px] text-muted-gray text-center">
              Active branch settings: <span className="text-primary font-medium">{gym?.defaultBranchId}</span>. All figures calculated based on timezone <span className="text-text-main font-medium">Asia/Kolkata</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
