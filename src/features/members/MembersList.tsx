import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Member, Membership, Due, Plan } from '../../types';
import { formatINR } from '../../utils/financeUtils';
import { getKolkataTodayString } from '../../utils/dateUtils';
import { Search, Filter, Phone, MessageCircle, AlertCircle } from 'lucide-react';
import { MemberPhoto } from '../../components/MemberPhoto';
import { ImageModal } from '../../components/ImageModal';

const normalizePhone = (num: string) => num.replace(/\D/g, '').slice(-10);

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
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('all');
  const [selectedMembershipStatus, setSelectedMembershipStatus] = useState('all'); // all, active, expired, frozen, inactive, archived
  const [selectedFeeStatus, setSelectedFeeStatus] = useState('all'); // all, paid, due, overdue, partial, waived
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('recently_joined'); // name, recently_joined, oldest_joined, highest_outstanding, nearest_expiry
  
  // Photo Zoom State
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);
  
  // Pagination
  const pageSize = 25;
  const [currentPage, setCurrentPage] = useState(1);

  const todayStr = getKolkataTodayString();

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    if (!gym) return;

    const unsubMembers = onSnapshot(collection(db, 'gyms', gym.id, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    });

    const unsubMemberships = onSnapshot(collection(db, 'gyms', gym.id, 'memberships'), (snap) => {
      setMemberships(snap.docs.map(d => ({ id: d.id, ...d.data() } as Membership)));
    });

    const unsubDues = onSnapshot(collection(db, 'gyms', gym.id, 'dues'), (snap) => {
      setDues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Due)));
    });

    const unsubPlans = onSnapshot(collection(db, 'gyms', gym.id, 'plans'), (snap) => {
      setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan)));
      setLoading(false);
    });

    return () => {
      unsubMembers();
      unsubMemberships();
      unsubDues();
      unsubPlans();
    };
  }, [gym]);

  // Derived attributes per member
  const processedMembers = useMemo(() => {
    return members.map((m) => {

      const latestMs = [...memberships]
        .filter(ms => ms.memberId === m.id)
        .sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
      
      const memberDues = dues.filter(d => d.memberId === m.id && d.baseStatus !== 'waived');
      const totalOutstanding = memberDues.reduce((sum, d) => sum + d.balance, 0);
      const isOverdue = memberDues.some(d => d.balance > 0 && d.dueDate < todayStr);

      // Derive Membership Status Shown in UI
      let uiMembershipStatus: 'active' | 'frozen' | 'inactive' | 'cancelled' | 'expired' | 'archived' = 'inactive';
      
      if (m.recordStatus === 'archived') {
        uiMembershipStatus = 'archived';
      } else if (latestMs) {
        if (latestMs.baseStatus === 'cancelled') uiMembershipStatus = 'cancelled';
        else if (latestMs.baseStatus === 'frozen') uiMembershipStatus = 'frozen';
        else if (latestMs.baseStatus === 'inactive') uiMembershipStatus = 'inactive';
        else if (latestMs.endDate < todayStr) uiMembershipStatus = 'expired';
        else uiMembershipStatus = 'active';
      }

      // Derive Fee Status
      let uiFeeStatus: 'paid' | 'due' | 'overdue' | 'partial' | 'waived' = 'paid';
      const unpaidDues = memberDues.filter(d => d.balance > 0);
      
      if (unpaidDues.length === 0) {
        // Check if there was at least one waived due
        const hasWaived = dues.some(d => d.memberId === m.id && d.baseStatus === 'waived');
        uiFeeStatus = hasWaived ? 'waived' : 'paid';
      } else if (isOverdue) {
        uiFeeStatus = 'overdue';
      } else {
        const hasPaidPartial = dues.some(d => d.memberId === m.id && d.amountPaid > 0);
        uiFeeStatus = hasPaidPartial ? 'partial' : 'due';
      }

      return {
        ...m,
        planName: latestMs ? latestMs.planNameSnapshot : 'No Plan',
        expiryDate: latestMs ? latestMs.endDate : 'N/A',
        totalOutstanding,
        uiMembershipStatus,
        uiFeeStatus,
        latestMs,
      };
    });
  }, [members, memberships, dues, todayStr]);

  // Apply Search, Filters, and Sorting
  const filteredMembers = useMemo(() => {
    let result = [...processedMembers];

    // 1. Search Query (name, phone, memberCode, tags)
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase().trim();
      result = result.filter((m) => {
        return (
          m.fullName.toLowerCase().includes(q) ||
          m.phone.includes(q) ||
          m.memberCode.toLowerCase().includes(q) ||
          m.tags.some(t => t.toLowerCase().includes(q))
        );
      });
    }

    // 2. Filters
    if (selectedPlan !== 'all') {
      result = result.filter(m => m.latestMs?.planId === selectedPlan);
    }

    if (selectedMembershipStatus !== 'all') {
      result = result.filter(m => m.uiMembershipStatus === selectedMembershipStatus);
    } else {
      // Exclude archived by default in standard view
      result = result.filter(m => m.uiMembershipStatus !== 'archived');
    }

    if (selectedFeeStatus !== 'all') {
      result = result.filter(m => m.uiFeeStatus === selectedFeeStatus);
    }

    // 3. Sorting
    if (sortBy === 'name') {
      result.sort((a, b) => a.fullName.localeCompare(b.fullName));
    } else if (sortBy === 'recently_joined') {
      result.sort((a, b) => new Date(b.joinDate).getTime() - new Date(a.joinDate).getTime());
    } else if (sortBy === 'oldest_joined') {
      result.sort((a, b) => new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime());
    } else if (sortBy === 'highest_outstanding') {
      result.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    } else if (sortBy === 'nearest_expiry') {
      result.sort((a, b) => {
        if (a.expiryDate === 'N/A') return 1;
        if (b.expiryDate === 'N/A') return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      });
    }

    return result;
  }, [processedMembers, debouncedQuery, selectedPlan, selectedMembershipStatus, selectedFeeStatus, sortBy]);

  // One-click Saved Filter: Fees Due
  const applyFeesDueFilter = () => {
    setSelectedFeeStatus('overdue');
    setSelectedMembershipStatus('all');
    setSelectedPlan('all');
  };

  const clearAllFilters = () => {
    setSelectedFeeStatus('all');
    setSelectedMembershipStatus('all');
    setSelectedPlan('all');
    setSearchQuery('');
  };

  // Pagination bounds
  const totalResults = filteredMembers.length;
  const totalPages = Math.ceil(totalResults / pageSize);
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, currentPage, pageSize]);

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
              showFilters || selectedPlan !== 'all' || selectedMembershipStatus !== 'all' || selectedFeeStatus !== 'all'
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-surface border-border-muted hover:border-primary text-text-main'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>

          <button
            onClick={applyFeesDueFilter}
            className="bg-red-950/20 border border-red-500/30 text-red-400 hover:bg-red-950/40 font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <AlertCircle className="h-4 w-4" />
            Fees Due
          </button>

          {(selectedPlan !== 'all' || selectedMembershipStatus !== 'all' || selectedFeeStatus !== 'all' || searchQuery !== '') && (
            <button
              onClick={clearAllFilters}
              className="bg-surface-light border border-border-muted hover:border-primary text-xs font-semibold px-3 py-2.5 rounded-xl text-text-main cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Multi-filter Drawer/Panel */}
      {showFilters && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Plan filter */}
          <div>
            <label className="block text-xs font-medium text-muted-gray mb-1.5">Gym Plan</label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none"
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
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none"
            >
              <option value="all">Exclude Archived</option>
              <option value="active">Active</option>
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
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none"
            >
              <option value="all">All Dues</option>
              <option value="paid">Paid</option>
              <option value="due">Due</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial Paid</option>
              <option value="waived">Waived</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-xs font-medium text-muted-gray mb-1.5">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none"
            >
              <option value="recently_joined">Recently Joined</option>
              <option value="oldest_joined">Oldest Joined</option>
              <option value="name">Alphabetical (A-Z)</option>
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
                <td colSpan={10} className="p-8 text-center text-xs text-muted-gray">
                  No members found matching the active filters.
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
                  <td className="p-4 font-semibold text-text-main">{m.fullName}</td>
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
          <div className="bg-surface border border-border-dark p-8 rounded-2xl text-center text-xs text-muted-gray">
            No members found matching filters.
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
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            className="px-3 py-1.5 bg-surface border border-border-muted rounded-lg hover:border-primary disabled:opacity-50 cursor-pointer"
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
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
