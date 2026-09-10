import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Member, Membership, Due, Plan } from '../../types';
import { formatINR } from '../../utils/financeUtils';
import { getKolkataTodayString } from '../../utils/dateUtils';
import { Search, Filter, Phone, MessageCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { MemberPhoto } from '../../components/MemberPhoto';
import { ImageModal } from '../../components/ImageModal';

const normalizePhone = (num: string) => num.replace(/\D/g, '').slice(-10);

/**
 * Normalizes any membership and plan into an integer duration in months (1, 3, 6, 12, etc.)
 */
function normalizeDurationInMonths(ms: Partial<Membership>, plan?: Partial<Plan>): number | null {
  // 1. From linked plan object
  if (plan) {
    if (plan.durationUnit === 'years' && plan.durationValue) return plan.durationValue * 12;
    if (plan.durationUnit === 'months' && plan.durationValue) return plan.durationValue;
    if (plan.durationUnit === 'days' && plan.durationValue) return Math.round(plan.durationValue / 30);
    if ((plan as any).durationInMonths) return Number((plan as any).durationInMonths);
    if ((plan as any).durationInDays) return Math.round(Number((plan as any).durationInDays) / 30);
  }

  // 2. Direct durationMonths field if present on membership
  if ((ms as any).durationMonths) return Number((ms as any).durationMonths);

  // 3. String matching on plan name snapshot (e.g. "6 month", "6 Months", "12 Month", "1 year", etc.)
  const nameStr = (ms.planNameSnapshot || plan?.name || '').toLowerCase();
  const monthMatch = nameStr.match(/(\d+)\s*(?:month|mo|m\b)/i);
  if (monthMatch) return parseInt(monthMatch[1], 10);

  const yearMatch = nameStr.match(/(\d+)\s*(?:year|yr|y\b)/i);
  if (yearMatch) return parseInt(yearMatch[1], 10) * 12;
  if (nameStr.includes('annual') || nameStr.includes('year')) return 12;
  if (nameStr.includes('quarter')) return 3;

  // 4. From date range (startDate to endDate)
  if (ms.startDate && ms.endDate) {
    const start = new Date(ms.startDate).getTime();
    const end = new Date(ms.endDate).getTime();
    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays >= 350) return 12;
    if (diffDays >= 165) return 6;
    if (diffDays >= 75) return 3;
    if (diffDays >= 25) return 1;
  }

  return null;
}

interface MembersListProps {
  onSelectMember: (memberId: string) => void;
  onAddMember: () => void;
}

export const MembersList: React.FC<MembersListProps> = ({ onSelectMember, onAddMember }) => {
  const { gym } = useAuth();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('all'); // all, 1, 3, 6, 12
  const [selectedPlan, setSelectedPlan] = useState('all');
  const [selectedMembershipStatus, setSelectedMembershipStatus] = useState('all'); // all, all_including_archived, active, expiring_soon, expired, frozen, inactive, archived
  const [selectedFeeStatus, setSelectedFeeStatus] = useState('all'); // all, paid, due, overdue, partial, waived
  const [selectedGender, setSelectedGender] = useState('all'); // all, male, female, other
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('recently_joined'); // recently_joined, oldest_joined, name_asc, name_desc, highest_outstanding, nearest_expiry
  
  // Photo Zoom State
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);
  
  // Pagination
  const pageSize = 25;
  const [currentPage, setCurrentPage] = useState(1);

  const todayStr = getKolkataTodayString();

  // Reset pagination to page 1 whenever any search query or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDuration, selectedPlan, selectedMembershipStatus, selectedFeeStatus, selectedGender, sortBy]);

  useEffect(() => {
    if (!gym) {
      setLoading(false);
      return;
    }

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 4000);

    const unsubMembers = onSnapshot(
      collection(db, 'gyms', gym.id, 'members'), 
      (snap) => {
        setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
      },
      (err) => {
        console.warn('MembersList members snapshot error:', err);
      }
    );

    const unsubMemberships = onSnapshot(
      collection(db, 'gyms', gym.id, 'memberships'), 
      (snap) => {
        setMemberships(snap.docs.map(d => ({ id: d.id, ...d.data() } as Membership)));
      },
      (err) => {
        console.warn('MembersList memberships snapshot error:', err);
      }
    );

    const unsubDues = onSnapshot(
      collection(db, 'gyms', gym.id, 'dues'), 
      (snap) => {
        setDues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Due)));
      },
      (err) => {
        console.warn('MembersList dues snapshot error:', err);
      }
    );

    const unsubPlans = onSnapshot(
      collection(db, 'gyms', gym.id, 'plans'), 
      (snap) => {
        clearTimeout(safetyTimer);
        setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan)));
        setLoading(false);
      },
      (err) => {
        clearTimeout(safetyTimer);
        console.warn('MembersList plans snapshot error:', err);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      unsubMembers();
      unsubMemberships();
      unsubDues();
      unsubPlans();
    };
  }, [gym]);

  // Derived attributes per member
  const processedMembers = useMemo(() => {
    const sevenDaysDate = new Date();
    sevenDaysDate.setDate(sevenDaysDate.getDate() + 7);
    const sevenDaysStr = sevenDaysDate.toISOString().split('T')[0];

    const plansMap = new Map<string, Plan>();
    plans.forEach(p => plansMap.set(p.id, p));

    return members.map((m) => {
      // Find all memberships for this member
      const memberMemberships = memberships.filter(ms => ms.memberId === m.id);

      // Prioritize active memberships first, then latest by endDate, then by startDate
      const latestMs = [...memberMemberships].sort((a, b) => {
        if (a.baseStatus === 'active' && b.baseStatus !== 'active') return -1;
        if (b.baseStatus === 'active' && a.baseStatus !== 'active') return 1;
        const endA = a.endDate || a.startDate || '';
        const endB = b.endDate || b.startDate || '';
        if (endB !== endA) return endB.localeCompare(endA);
        return (b.startDate || '').localeCompare(a.startDate || '');
      })[0];
      
      const memberPlan = latestMs ? plansMap.get(latestMs.planId) : undefined;
      const normalizedDuration = latestMs ? normalizeDurationInMonths(latestMs, memberPlan) : null;

      const memberDues = dues.filter(d => d.memberId === m.id && d.baseStatus !== 'waived');
      const totalOutstanding = memberDues.reduce((sum, d) => sum + (d.balance || 0), 0);
      const isOverdue = memberDues.some(d => (d.balance || 0) > 0 && d.dueDate < todayStr);

      // Derive Membership Status Shown in UI
      let uiMembershipStatus: 'active' | 'frozen' | 'inactive' | 'cancelled' | 'expired' | 'archived' = 'inactive';
      let isExpiringSoon = false;
      
      if (m.recordStatus === 'archived') {
        uiMembershipStatus = 'archived';
      } else if (latestMs) {
        if (latestMs.baseStatus === 'cancelled') uiMembershipStatus = 'cancelled';
        else if (latestMs.baseStatus === 'frozen') uiMembershipStatus = 'frozen';
        else if (latestMs.baseStatus === 'inactive') uiMembershipStatus = 'inactive';
        else if (latestMs.endDate < todayStr) uiMembershipStatus = 'expired';
        else {
          uiMembershipStatus = 'active';
          if (latestMs.endDate <= sevenDaysStr) {
            isExpiringSoon = true;
          }
        }
      }

      // Derive Fee Status
      let uiFeeStatus: 'paid' | 'due' | 'overdue' | 'partial' | 'waived' = 'paid';
      const unpaidDues = memberDues.filter(d => (d.balance || 0) > 0);
      
      if (unpaidDues.length === 0) {
        const hasWaived = dues.some(d => d.memberId === m.id && d.baseStatus === 'waived');
        uiFeeStatus = hasWaived ? 'waived' : 'paid';
      } else if (isOverdue) {
        uiFeeStatus = 'overdue';
      } else {
        const hasPaidPartial = dues.some(d => d.memberId === m.id && (d.amountPaid || 0) > 0);
        uiFeeStatus = hasPaidPartial ? 'partial' : 'due';
      }

      return {
        ...m,
        planName: latestMs ? (latestMs.planNameSnapshot || memberPlan?.name || 'Custom Plan') : 'No Plan',
        expiryDate: latestMs ? latestMs.endDate : 'N/A',
        totalOutstanding,
        uiMembershipStatus,
        isExpiringSoon,
        uiFeeStatus,
        latestMs,
        normalizedDuration,
      };
    });
  }, [members, memberships, dues, plans, todayStr]);

  // Apply Search, Filters, and Sorting
  const filteredMembers = useMemo(() => {
    let result = [...processedMembers];

    // 1. Instant multi-word search (name, phone, memberCode, tags, planName)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const queryWords = q.split(/\s+/).filter(Boolean);

      result = result.filter((m) => {
        const fullName = (m.fullName || '').toLowerCase().trim();
        const firstName = ((m as any).firstName || '').toLowerCase().trim();
        const lastName = ((m as any).lastName || '').toLowerCase().trim();
        const combinedName = `${firstName} ${lastName}`.trim();
        const phone = (m.phone || '').trim();
        const normPhone = normalizePhone(m.phone || '');
        const memberCode = (m.memberCode || '').toLowerCase().trim();
        const planName = (m.planName || '').toLowerCase().trim();
        const tags = Array.isArray(m.tags) ? m.tags.map(t => (t || '').toLowerCase().trim()) : [];

        return queryWords.every((word) => {
          return (
            fullName.includes(word) ||
            firstName.includes(word) ||
            lastName.includes(word) ||
            combinedName.includes(word) ||
            phone.includes(word) ||
            normPhone.includes(word) ||
            memberCode.includes(word) ||
            planName.includes(word) ||
            tags.some(t => t.includes(word))
          );
        });
      });
    }

    // 2. Package Duration Filter
    if (selectedDuration !== 'all') {
      const targetDur = parseInt(selectedDuration, 10);
      result = result.filter(m => m.normalizedDuration === targetDur);
    }

    // 3. Gym Plan Filter
    if (selectedPlan !== 'all') {
      result = result.filter((m) => {
        if (!m.latestMs) return false;
        if (m.latestMs.planId === selectedPlan) return true;
        const matchedPlan = plans.find(p => p.id === selectedPlan);
        if (matchedPlan && m.latestMs.planNameSnapshot && m.latestMs.planNameSnapshot.toLowerCase() === matchedPlan.name.toLowerCase()) {
          return true;
        }
        return false;
      });
    }

    // 4. Membership Status Filter
    if (selectedMembershipStatus === 'all') {
      // Exclude archived by default in standard view
      result = result.filter(m => m.uiMembershipStatus !== 'archived');
    } else if (selectedMembershipStatus === 'all_including_archived') {
      // Include all records
    } else if (selectedMembershipStatus === 'expiring_soon') {
      result = result.filter(m => m.isExpiringSoon);
    } else {
      result = result.filter(m => m.uiMembershipStatus === selectedMembershipStatus);
    }

    // 5. Fee Status Filter
    if (selectedFeeStatus !== 'all') {
      result = result.filter(m => m.uiFeeStatus === selectedFeeStatus);
    }

    // 6. Gender Filter
    if (selectedGender !== 'all') {
      result = result.filter(m => (m.gender || '').toLowerCase() === selectedGender.toLowerCase());
    }

    // 7. Sorting
    if (sortBy === 'name_asc') {
      result.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }));
    } else if (sortBy === 'name_desc') {
      result.sort((a, b) => (b.fullName || '').localeCompare(a.fullName || '', undefined, { sensitivity: 'base' }));
    } else if (sortBy === 'recently_joined') {
      result.sort((a, b) => (b.joinDate || '').localeCompare(a.joinDate || ''));
    } else if (sortBy === 'oldest_joined') {
      result.sort((a, b) => (a.joinDate || '').localeCompare(b.joinDate || ''));
    } else if (sortBy === 'highest_outstanding') {
      result.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    } else if (sortBy === 'nearest_expiry') {
      result.sort((a, b) => {
        if (a.expiryDate === 'N/A') return 1;
        if (b.expiryDate === 'N/A') return -1;
        return (a.expiryDate || '').localeCompare(b.expiryDate || '');
      });
    }

    return result;
  }, [processedMembers, searchQuery, selectedDuration, selectedPlan, selectedMembershipStatus, selectedFeeStatus, selectedGender, sortBy, plans]);

  // Quick Filters
  const applyFeesDueFilter = () => {
    setSelectedFeeStatus('overdue');
    setSelectedDuration('all');
    setSelectedPlan('all');
    setSelectedMembershipStatus('all');
    setSelectedGender('all');
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedDuration('all');
    setSelectedPlan('all');
    setSelectedMembershipStatus('all');
    setSelectedFeeStatus('all');
    setSelectedGender('all');
    setSortBy('recently_joined');
    setCurrentPage(1);
  };

  const activeFilterCount = 
    (searchQuery.trim() !== '' ? 1 : 0) +
    (selectedDuration !== 'all' ? 1 : 0) +
    (selectedPlan !== 'all' ? 1 : 0) +
    (selectedMembershipStatus !== 'all' ? 1 : 0) +
    (selectedFeeStatus !== 'all' ? 1 : 0) +
    (selectedGender !== 'all' ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  // Safe Pagination bounds
  const totalResults = filteredMembers.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedMembers = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, safeCurrentPage, pageSize]);

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border-dark pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Gym Members</h1>
          <p className="text-sm text-muted-gray">Manage and view member profiles ({totalResults} total)</p>
        </div>
        <button
          onClick={onAddMember}
          className="bg-primary hover:bg-primary-dark transition-all text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer shadow-md"
        >
          Add New Member
        </button>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-gray" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border-muted hover:border-primary focus:border-primary rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-main outline-none transition-colors"
            placeholder="Search by name, phone number, member code, or tag..."
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 border px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors ${
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

          <button
            onClick={applyFeesDueFilter}
            className={`font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer transition-colors ${
              selectedFeeStatus === 'overdue'
                ? 'bg-red-500 text-white shadow-md'
                : 'bg-red-950/20 border border-red-500/30 text-red-400 hover:bg-red-950/40'
            }`}
          >
            <AlertCircle className="h-4 w-4" />
            Fees Due
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="bg-surface-light border border-border-muted hover:border-primary text-xs font-semibold px-3 py-2.5 rounded-xl text-text-main cursor-pointer flex items-center gap-1.5 transition-colors"
              title="Reset all filters and search"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted-gray" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-filter Drawer/Panel */}
      {showFilters && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Package Duration filter */}
          <div>
            <label className="block text-xs font-medium text-muted-gray mb-1.5">Package Duration</label>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(e.target.value)}
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
            >
              <option value="all">All Durations</option>
              <option value="1">1 Month</option>
              <option value="3">3 Months</option>
              <option value="6">6 Months</option>
              <option value="12">12 Months (1 Year)</option>
            </select>
          </div>

          {/* Plan filter */}
          <div>
            <label className="block text-xs font-medium text-muted-gray mb-1.5">Gym Plan</label>
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

          {/* Membership Status filter */}
          <div>
            <label className="block text-xs font-medium text-muted-gray mb-1.5">Membership Status</label>
            <select
              value={selectedMembershipStatus}
              onChange={(e) => setSelectedMembershipStatus(e.target.value)}
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
            >
              <option value="all">Exclude Archived</option>
              <option value="all_including_archived">All Records (Inc. Archived)</option>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon (Next 7 Days)</option>
              <option value="expired">Expired</option>
              <option value="frozen">Frozen</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Fee Status filter */}
          <div>
            <label className="block text-xs font-medium text-muted-gray mb-1.5">Fee Status</label>
            <select
              value={selectedFeeStatus}
              onChange={(e) => setSelectedFeeStatus(e.target.value)}
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
            >
              <option value="all">All Dues</option>
              <option value="paid">Paid</option>
              <option value="due">Due</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial Paid</option>
              <option value="waived">Waived</option>
            </select>
          </div>

          {/* Gender filter */}
          <div>
            <label className="block text-xs font-medium text-muted-gray mb-1.5">Gender</label>
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
            >
              <option value="all">All Genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-xs font-medium text-muted-gray mb-1.5">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
            >
              <option value="recently_joined">Recently Joined</option>
              <option value="oldest_joined">Oldest Joined</option>
              <option value="name_asc">Alphabetical (A-Z)</option>
              <option value="name_desc">Alphabetical (Z-A)</option>
              <option value="highest_outstanding">Highest Outstanding</option>
              <option value="nearest_expiry">Nearest Expiry</option>
            </select>
          </div>
        </div>
      )}

      {/* Desktop Table Layout */}
      <div className="hidden lg:block bg-surface border border-border-dark rounded-2xl overflow-hidden shadow-md">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-dark text-xs text-muted-gray font-semibold bg-surface/50">
              <th className="p-4">Photo</th>
              <th className="p-4">Code</th>
              <th className="p-4">Name</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Plan</th>
              <th className="p-4">Expiry</th>
              <th className="p-4">Outstanding</th>
              <th className="p-4">Membership</th>
              <th className="p-4">Fees</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dark text-sm">
            {paginatedMembers.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-12 text-center text-xs text-muted-gray">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <AlertCircle className="h-8 w-8 text-muted-gray/70" />
                    <p className="text-sm font-semibold text-text-main">No members found</p>
                    <p className="text-xs text-muted-gray max-w-sm">
                      No members match the current search query or active filter criteria.
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearAllFilters}
                        className="mt-2 px-3 py-1.5 bg-primary/10 border border-primary text-primary hover:bg-primary/20 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedMembers.map((m) => (
                <tr key={m.id} className="hover:bg-surface-light transition-colors">
                  <td className="p-4">
                    <div className="w-10 h-10 rounded-lg bg-canvas border border-border-muted flex items-center justify-center overflow-hidden">
                      <MemberPhoto 
                        path={m.photoStoragePath} 
                        fallbackLetter={m.fullName.charAt(0)} 
                        className="w-full h-full object-cover text-xs cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(url) => url && setZoomPhotoUrl(url)}
                      />
                    </div>
                  </td>
                  <td className="p-4 font-mono text-xs">{m.memberCode}</td>
                  <td 
                    className="p-4 font-semibold text-text-main hover:text-primary hover:underline cursor-pointer"
                    onClick={() => onSelectMember(m.id)}
                    title={`View profile of ${m.fullName}`}
                  >
                    {m.fullName}
                  </td>
                  <td className="p-4 text-xs text-muted-gray">{m.phone}</td>
                  <td className="p-4 text-xs">{m.planName}</td>
                  <td className="p-4 text-xs">{m.expiryDate}</td>
                  <td className="p-4 text-xs font-semibold text-text-main">
                    {m.totalOutstanding > 0 ? (
                      <span className="text-red-500 font-bold">{formatINR(m.totalOutstanding, false)}</span>
                    ) : (
                      '₹0'
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      m.uiMembershipStatus === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-500/20' :
                      m.uiMembershipStatus === 'expired' ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-500/20' :
                      m.uiMembershipStatus === 'frozen' ? 'bg-blue-950 text-blue-400 border border-blue-500/20' :
                      'bg-neutral-850 text-muted-gray border border-border-muted'
                    }`}>
                      {m.uiMembershipStatus}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      m.uiFeeStatus === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-500/20' :
                      m.uiFeeStatus === 'overdue' ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-500/20' :
                      'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-500/20'
                    }`}>
                      {m.uiFeeStatus}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => onSelectMember(m.id)}
                      className="bg-surface-light border border-border-muted hover:border-primary text-text-main font-semibold px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                    >
                      Profile
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Layout */}
      <div className="lg:hidden space-y-4">
        {paginatedMembers.length === 0 ? (
          <div className="bg-surface border border-border-dark p-8 rounded-2xl text-center text-xs text-muted-gray flex flex-col items-center gap-2">
            <AlertCircle className="h-8 w-8 text-muted-gray/70" />
            <p className="text-sm font-semibold text-text-main">No members found</p>
            <p className="text-xs text-muted-gray">No members match your search or filters.</p>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="mt-2 px-3 py-1.5 bg-primary/10 border border-primary text-primary hover:bg-primary/20 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          paginatedMembers.map((m) => (
            <div 
              key={m.id} 
              onClick={() => onSelectMember(m.id)}
              className="bg-surface border border-border-dark p-4 rounded-2xl space-y-3 shadow-md hover:border-primary transition-colors cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className="w-12 h-12 rounded-xl bg-canvas border border-border-muted flex items-center justify-center overflow-hidden shrink-0">
                    <span className="font-bold text-sm text-muted-gray">{m.fullName.charAt(0)}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-text-main text-sm m-0">{m.fullName}</h4>
                    <p className="text-[10px] text-muted-gray">{m.memberCode} | {m.phone}</p>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                    m.uiMembershipStatus === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                  }`}>
                    {m.uiMembershipStatus}
                  </span>
                  
                  <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                    m.uiFeeStatus === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400'
                  }`}>
                    {m.uiFeeStatus}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-border-dark pt-3 text-muted-gray">
                <div>
                  <p className="text-[10px]">Active Plan</p>
                  <p className="text-text-main font-medium">{m.planName}</p>
                </div>
                <div>
                  <p className="text-[10px]">Expiry Date</p>
                  <p className="text-text-main font-medium">{m.expiryDate}</p>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-border-dark pt-3">
                <div>
                  <span className="text-[10px] text-muted-gray block">Outstanding</span>
                  <span className={`text-sm font-bold ${m.totalOutstanding > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                    {formatINR(m.totalOutstanding, false)}
                  </span>
                </div>
                
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {/* WhatsApp Deep Link */}
                  <a 
                    href={`https://wa.me/91${normalizePhone(m.phone)}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="p-2 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/20 text-emerald-400 rounded-xl"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  
                  <a 
                    href={`tel:+91${normalizePhone(m.phone)}`} 
                    className="p-2 bg-surface-light border border-border-muted text-text-main rounded-xl"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  
                  <button 
                    onClick={() => onSelectMember(m.id)}
                    className="bg-primary hover:bg-primary-dark text-white px-3 py-1.5 rounded-xl text-xs font-semibold"
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-xs text-muted-gray pt-4 border-t border-border-dark">
          <button 
            disabled={safeCurrentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="px-3 py-1.5 bg-surface border border-border-muted rounded-lg hover:border-primary disabled:opacity-50 cursor-pointer"
          >
            Previous
          </button>
          <span>Page {safeCurrentPage} of {totalPages}</span>
          <button 
            disabled={safeCurrentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            className="px-3 py-1.5 bg-surface border border-border-muted rounded-lg hover:border-primary disabled:opacity-50 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {/* Zoom Photo Modal */}
      <ImageModal
        isOpen={!!zoomPhotoUrl}
        onClose={() => setZoomPhotoUrl(null)}
        imageUrl={zoomPhotoUrl}
        altText="Zoomed Member Photo"
      />
    </div>
  );
};
