import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { doc, onSnapshot, collection, query, where, updateDoc } from 'firebase/firestore';
import { db, recordPaymentAtomic, refundPaymentAtomic, renewMembershipAtomic, archiveMember, restoreMember, permanentlyDeleteMember, updateMemberSafe, uploadMemberPhoto } from '../../services/firebase';
import type { Member, Membership, Due, Payment, AuditLog, Plan } from '../../types';
import { formatINR } from '../../utils/financeUtils';
import { getKolkataTodayString, calculateMembershipEndDate, getDaysBetween, extendEndDateByDays } from '../../utils/dateUtils';
import { generateDuesForMembership } from '../../utils/financeUtils';
import { Phone, MessageCircle, ArrowLeft, Calendar, PlusCircle, ShieldCheck, Trash2, Printer, Edit3, Download, Share2, Copy, X, Upload } from 'lucide-react';
import { MemberPhoto } from '../../components/MemberPhoto';
import { ImageModal } from '../../components/ImageModal';
import imageCompression from 'browser-image-compression';
import { toBlob } from 'html-to-image';

function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
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

interface MemberProfileProps {
  memberId: string;
  onBack: () => void;
}

export const MemberProfile: React.FC<MemberProfileProps> = ({ memberId, onBack }) => {
  const { gym, user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [member, setMember] = useState<Member | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<'overview' | 'memberships' | 'payments' | 'dues' | 'activity'>('overview');
  
  // Modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);
  
  // Edit member states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAlternatePhone, setEditAlternatePhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editGender, setEditGender] = useState('male');
  const [editAddress, setEditAddress] = useState('');
  const [editEmergencyName, setEditEmergencyName] = useState('');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

  // Form states
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'cash' | 'upi' | 'card' | 'bank_transfer' | 'other'>('cash');
  const [payRef, setPayRef] = useState('');
  const [payNote, setPayNote] = useState('');

  const [renewPlanId, setRenewPlanId] = useState('');
  const [renewStartDateOption, setRenewStartDateOption] = useState<'immediate' | 'after_end'>('immediate');

  const [freezeStart, setFreezeStart] = useState(getKolkataTodayString());
  const [freezeEnd, setFreezeEnd] = useState(getKolkataTodayString());
  const [freezeReason, setFreezeReason] = useState('');

  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('');

  const [actionLoading, setActionLoading] = useState(false);

  const todayStr = getKolkataTodayString();

  useEffect(() => {
    if (!gym) return;

    const unsubMember = onSnapshot(doc(db, 'gyms', gym.id, 'members', memberId), (snap) => {
      if (snap.exists()) {
        setMember({ id: snap.id, ...snap.data() } as Member);
      } else {
        setMember(null);
      }
    });

    const unsubMemberships = onSnapshot(
      query(collection(db, 'gyms', gym.id, 'memberships'), where('memberId', '==', memberId)),
      (snap) => {
        setMemberships(snap.docs.map(d => ({ id: d.id, ...d.data() } as Membership)));
      }
    );

    const unsubDues = onSnapshot(
      query(collection(db, 'gyms', gym.id, 'dues'), where('memberId', '==', memberId)),
      (snap) => {
        setDues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Due)));
      }
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'gyms', gym.id, 'payments'), where('memberId', '==', memberId)),
      (snap) => {
        setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
      }
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'gyms', gym.id, 'auditLogs'), where('entityId', '==', memberId)),
      (snap) => {
        setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)));
      }
    );

    const unsubPlans = onSnapshot(collection(db, 'gyms', gym.id, 'plans'), (snap) => {
      setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan)));
      setLoading(false);
    });

    return () => {
      unsubMember();
      unsubMemberships();
      unsubDues();
      unsubPayments();
      unsubLogs();
      unsubPlans();
    };
  }, [gym, memberId]);

  // Derived stats
  const activeMs = useMemo(() => {
    return memberships.find(ms => ms.baseStatus === 'active');
  }, [memberships]);

  const latestMs = useMemo(() => {
    return [...memberships].sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
  }, [memberships]);

  const totalOutstanding = useMemo(() => {
    return dues.filter(d => d.baseStatus !== 'waived').reduce((sum, d) => sum + d.balance, 0);
  }, [dues]);

  const unpaidDues = useMemo(() => {
    return dues.filter(d => d.balance > 0 && d.baseStatus !== 'waived');
  }, [dues]);

  const nextDue = useMemo(() => {
    const sorted = [...unpaidDues].sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return sorted[0];
  }, [unpaidDues]);

  const daysRemaining = useMemo(() => {
    if (!latestMs || latestMs.baseStatus !== 'active') return 0;
    if (latestMs.endDate < todayStr) return 0;
    return getDaysBetween(todayStr, latestMs.endDate) - 1;
  }, [latestMs, todayStr]);

  if (loading || !member) {
    return (
      <div className="flex-1 flex justify-center items-center h-96">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Derived display attributes
  const uiMembershipStatus = member.recordStatus === 'archived' ? 'archived' : 
    latestMs ? (latestMs.baseStatus === 'active' && latestMs.endDate < todayStr ? 'expired' : latestMs.baseStatus) : 'inactive';

  const uiFeeStatus = totalOutstanding === 0 ? 'paid' : 
    unpaidDues.some(d => d.dueDate < todayStr) ? 'overdue' : 'due';

  // --- Handlers ---

  const openEditModal = () => {
    setEditFullName(member!.fullName);
    setEditPhone(member!.phone);
    setEditAlternatePhone(member!.alternatePhone || '');
    setEditEmail(member!.email || '');
    setEditDob(member!.dateOfBirth || '');
    setEditGender(member!.gender || 'male');
    setEditAddress(member!.addressLine1 || '');
    setEditEmergencyName(member!.emergencyContactName || '');
    setEditEmergencyPhone(member!.emergencyContactPhone || '');
    setEditNotes(member!.notes || '');
    setEditPhotoFile(null);
    setEditPhotoPreview(null);
    setEditError(null);
    setShowEditModal(true);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.1,
          maxWidthOrHeight: 512,
          useWebWorker: true,
        });
        setEditPhotoFile(compressed);
        setEditPhotoPreview(URL.createObjectURL(compressed));
      } catch (err) {
        console.error('Compression error:', err);
      }
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gym || !user) return;
    setEditSaving(true);
    setEditError(null);

    try {
      let newPhotoPath = member!.photoStoragePath;
      if (editPhotoFile) {
        const photoPath = await uploadMemberPhoto(gym.id, member.id, editPhotoFile);
        if (photoPath) {
          newPhotoPath = photoPath;
        }
      }

      const updatedData = cleanUndefined({
        fullName: editFullName,
        searchName: editFullName.trim().toLowerCase(),
        phone: editPhone,
        alternatePhone: editAlternatePhone || undefined,
        email: editEmail || undefined,
        dateOfBirth: editDob || undefined,
        gender: editGender,
        addressLine1: editAddress || undefined,
        emergencyContactName: editEmergencyName || undefined,
        emergencyContactPhone: editEmergencyPhone || undefined,
        notes: editNotes.trim() || undefined,
        photoStoragePath: newPhotoPath,
        updatedBy: user.uid,
      });

      await updateMemberSafe(
        gym.id,
        member.id,
        updatedData,
        member.version || 1,
        user.uid,
        user.displayName || 'Owner'
      );
      setShowEditModal(false);
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || 'Failed to update member.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!gym || !user || payAmount <= 0) return;
    setActionLoading(true);
    try {
      const paymentPayload: any = {
        memberId,
        branchId: member.branchId || gym.defaultBranchId || 'main-branch',
        type: 'payment',
        amount: payAmount,
        paymentDate: todayStr,
        paymentMethod: payMethod,
        allocations: [],
        status: 'completed',
        createdBy: user.uid
      };

      if (payRef && payRef.trim() !== '') {
        paymentPayload.transactionReference = payRef.trim();
      }
      if (payNote && payNote.trim() !== '') {
        paymentPayload.note = payNote.trim();
      }

      await recordPaymentAtomic(gym.id, paymentPayload, unpaidDues, user.uid, user.displayName || 'Staff');
      
      setShowPaymentModal(false);
      setPayAmount(0);
      setPayRef('');
      setPayNote('');
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenewMembership = async () => {
    if (!gym || !user || !renewPlanId) return;
    setActionLoading(true);

    const plan = plans.find(p => p.id === renewPlanId);
    if (!plan) return;

    try {
      let rStartDate = todayStr;
      if (renewStartDateOption === 'after_end' && latestMs) {
        const currentEnd = new Date(latestMs.endDate);
        currentEnd.setDate(currentEnd.getDate() + 1);
        rStartDate = currentEnd.toISOString().split('T')[0];
      }

      const rEndDate = calculateMembershipEndDate(rStartDate, plan.durationValue, plan.durationUnit);

      const netPremium = plan.standardPrice + plan.joiningFee;
      
      const newMembershipPayload = {
        memberId,
        branchId: member.branchId || gym.defaultBranchId || 'main-branch',
        planId: renewPlanId,
        planNameSnapshot: plan.name,
        planPriceSnapshot: plan.standardPrice,
        startDate: rStartDate,
        endDate: rEndDate,
        grossAmount: plan.standardPrice,
        joiningFee: plan.joiningFee,
        discountType: 'none' as const,
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        finalAmount: netPremium,
        billingFrequency: plan.billingFrequency,
        baseStatus: 'active' as const,
        freezePeriods: [],
        createdBy: user.uid,
        updatedBy: user.uid,
      };

      const durationMonths = plan.durationUnit === 'months' ? plan.durationValue : 1;
      const duesRaw = generateDuesForMembership({
        memberId,
        membershipId: '', 
        branchId: member.branchId || gym.defaultBranchId || 'main-branch',
        startDate: rStartDate,
        endDate: rEndDate,
        finalAmount: netPremium,
        grossAmount: plan.standardPrice,
        joiningFee: plan.joiningFee,
        discountAmount: 0,
        taxAmount: 0,
        billingFrequency: plan.billingFrequency,
        durationMonths,
      });

      await renewMembershipAtomic(gym.id, newMembershipPayload, duesRaw, user.uid, user.displayName || 'Staff');
      
      setShowRenewModal(false);
      setRenewPlanId('');
    } catch (err: any) {
      alert(err.message || 'Renewal failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFreezeMembership = async () => {
    if (!gym || !user || !latestMs) return;
    if (freezeStart > freezeEnd) {
      alert('Freeze end date must be after start date.');
      return;
    }
    setActionLoading(true);

    try {
      const daysCount = getDaysBetween(freezeStart, freezeEnd);
      
      const updatedFreezePeriods = [
        ...(latestMs.freezePeriods || []),
        {
          startDate: freezeStart,
          endDate: freezeEnd,
          reason: freezeReason || undefined,
          recordedBy: user.uid,
          createdAt: new Date(),
        }
      ];

      const newEndDate = extendEndDateByDays(latestMs.endDate, daysCount);

      await updateDoc(doc(db, 'gyms', gym.id, 'memberships', latestMs.id), {
        freezePeriods: updatedFreezePeriods,
        endDate: newEndDate,
        updatedAt: new Date(),
        updatedBy: user.uid,
      });

      setShowFreezeModal(false);
      setFreezeReason('');
    } catch (err: any) {
      alert(err.message || 'Failed to freeze membership.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefund = async () => {
    if (!gym || !user || !refundPaymentId || refundAmount <= 0) return;
    setActionLoading(true);
    try {
      await refundPaymentAtomic(gym.id, refundPaymentId, refundAmount, refundReason, user.uid, user.displayName || 'Owner');
      setShowRefundModal(false);
      setRefundReason('');
      setRefundAmount(0);
    } catch (err: any) {
      alert(err.message || 'Failed to process refund.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!gym || !user) return;
    if (confirm(`Are you sure you want to ${member.recordStatus === 'archived' ? 'restore' : 'archive'} this member?`)) {
      if (member.recordStatus === 'archived') {
        await restoreMember(gym.id, member.id, user.uid, user.displayName || 'Owner');
      } else {
        await archiveMember(gym.id, member.id, user.uid, user.displayName || 'Owner');
      }
    }
  };

  const handlePermanentDelete = async () => {
    if (!gym || !user) return;
    const phrase = prompt('Type "DELETE PERMANENTLY" to confirm deletion of this member and all historical billing records:');
    if (phrase === 'DELETE PERMANENTLY') {
      setActionLoading(true);
      try {
        await permanentlyDeleteMember(gym.id, member.id, user.uid, user.displayName || 'Owner');
        onBack();
      } catch (err: any) {
        alert(err.message || 'Deletion failed.');
      } finally {
        setActionLoading(false);
      }
    }
  };

  const openReceipt = (p: Payment) => {
    setSelectedReceipt(p);
    setShowReceiptModal(true);
  };

  const captureReceiptImage = async (): Promise<Blob | null> => {
    const receiptElement = document.getElementById('receipt-content');
    if (!receiptElement) return null;
    try {
      const blob = await toBlob(receiptElement, {
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      return blob;
    } catch (err) {
      console.error('Failed to capture receipt', err);
      return null;
    }
  };

  const handleDownloadPNG = async () => {
    if (!selectedReceipt) return;
    const blob = await captureReceiptImage();
    if (!blob) {
      alert('Failed to generate image. Please try again.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt-${selectedReceipt.receiptNumber}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSharePNG = async () => {
    if (!selectedReceipt) return;
    const blob = await captureReceiptImage();
    if (!blob) {
      alert('Failed to generate image. Please try again.');
      return;
    }
    const file = new File([blob], `Receipt-${selectedReceipt.receiptNumber}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `Receipt ${selectedReceipt.receiptNumber}`,
          text: 'Here is your payment receipt.',
          files: [file]
        });
      } catch (err) {
        console.error('Share failed', err);
      }
    } else {
      alert('Your browser does not support sharing files directly. Please use the Download option instead.');
    }
  };

  const handleCopyPNG = async () => {
    const blob = await captureReceiptImage();
    if (!blob) {
      alert('Failed to generate image. Please try again.');
      return;
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      alert('Receipt copied to clipboard!');
    } catch (err) {
      console.error('Copy failed', err);
      alert('Failed to copy to clipboard.');
    }
  };

  return (
    <div className="flex-1 space-y-6">
      {/* Profile Header Card */}
      <div className="bg-surface border border-border-dark p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 bg-canvas hover:bg-border-muted hover:text-text-main text-text-main rounded-xl border border-border-muted transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          
          <div className="w-16 h-16 rounded-2xl bg-canvas border border-border-muted flex items-center justify-center overflow-hidden shrink-0">
            <MemberPhoto 
              path={member.photoStoragePath} 
              fallbackLetter={member.fullName.charAt(0)} 
              className="w-full h-full object-cover text-xl cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(url) => url && setZoomPhotoUrl(url)}
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-text-main m-0">{member.fullName}</h2>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                uiMembershipStatus === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-500/20'
              }`}>
                {uiMembershipStatus}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                uiFeeStatus === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-500/20'
              }`}>
                {uiFeeStatus}
              </span>
            </div>
            <p className="text-xs text-muted-gray mt-1">Code: {member.memberCode} | Registered on: {member.joinDate}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {role !== 'viewer' && (
            <button
              onClick={openEditModal}
              className="p-2.5 bg-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-border-muted text-text-main rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <Edit3 className="h-4 w-4 text-primary" />
              <span>Edit Profile</span>
            </button>
          )}
          <a
            href={`tel:+91${member.phone}`}
            className="p-2.5 bg-surface border border-border-muted text-text-main rounded-xl hover:border-primary dark:hover:border-primary hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <Phone className="h-4 w-4" />
            <span>Call</span>
          </a>
          <a
            href={`https://wa.me/91${member.phone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-500/25 dark:text-emerald-400 dark:hover:bg-emerald-950/40 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-border-dark overflow-x-auto gap-2">
        {(['overview', 'memberships', 'payments', 'dues', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize shrink-0 border-b-2 cursor-pointer transition-colors ${
              activeTab === tab ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-gray hover:text-text-main'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* TABS CONTENT */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Member details info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview stats info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface border border-border-dark p-6 rounded-2xl shadow-md">
              <div>
                <p className="text-[10px] text-muted-gray">Current Plan</p>
                <p className="text-sm font-semibold text-text-main mt-0.5">{latestMs ? latestMs.planNameSnapshot : 'No Plan Setup'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-gray">Days Remaining</p>
                <p className="text-sm font-semibold text-text-main mt-0.5">{daysRemaining} Days</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-gray">Total Outstanding</p>
                <p className={`text-sm font-bold mt-0.5 ${totalOutstanding > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                  {formatINR(totalOutstanding, false)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-gray">Next Due Date</p>
                <p className="text-sm font-semibold text-text-main mt-0.5">{nextDue ? nextDue.dueDate : 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-gray">Membership Ends</p>
                <p className="text-sm font-semibold text-text-main mt-0.5">{latestMs ? latestMs.endDate : 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-gray">GST Status</p>
                <p className="text-sm font-semibold text-text-main mt-0.5">{latestMs && latestMs.taxAmount > 0 ? 'Tax Enabled' : 'No Tax'}</p>
              </div>
            </div>

            {/* Profile data list */}
            <div className="bg-surface border border-border-dark p-6 rounded-2xl space-y-4 shadow-md">
              <h3 className="text-sm font-semibold text-text-main border-b border-border-dark pb-2 mb-4">Personal Contact Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-gray block">Phone Number</span>
                  <span className="text-text-main font-medium block mt-0.5">{member.phone}</span>
                </div>
                {member.alternatePhone && (
                  <div>
                    <span className="text-muted-gray block">Alternate Phone</span>
                    <span className="text-text-main font-medium block mt-0.5">{member.alternatePhone}</span>
                  </div>
                )}
                {member.email && (
                  <div>
                    <span className="text-muted-gray block">Email Address</span>
                    <span className="text-text-main font-medium block mt-0.5">{member.email}</span>
                  </div>
                )}
                {member.dateOfBirth && (
                  <div>
                    <span className="text-muted-gray block">Date of Birth</span>
                    <span className="text-text-main font-medium block mt-0.5">{member.dateOfBirth}</span>
                  </div>
                )}
                {member.addressLine1 && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-gray block">Address</span>
                    <span className="text-text-main font-medium block mt-0.5">{member.addressLine1}</span>
                  </div>
                )}
                {member.emergencyContactName && (
                  <div>
                    <span className="text-muted-gray block">Emergency Contact Name</span>
                    <span className="text-text-main font-medium block mt-0.5">{member.emergencyContactName}</span>
                  </div>
                )}
                {member.emergencyContactPhone && (
                  <div>
                    <span className="text-muted-gray block">Emergency Phone</span>
                    <span className="text-text-main font-medium block mt-0.5">{member.emergencyContactPhone}</span>
                  </div>
                )}
                {member.isMinor && (
                  <div className="sm:col-span-2 bg-amber-50 p-3 rounded-lg border border-amber-200 dark:bg-amber-950/20 dark:border-amber-500/20">
                    <span className="text-amber-300 font-semibold block text-[10px]">Minor Profile (Guardian Authorized)</span>
                    <span className="text-text-main text-xs block mt-1">Guardian: {member.guardianName} ({member.guardianPhone})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Privacy details */}
            <div className="bg-surface border border-border-dark p-6 rounded-2xl space-y-3 text-xs shadow-md">
              <h3 className="text-sm font-semibold text-text-main border-b border-border-dark pb-2 mb-2">Consent Status</h3>
              <div className="flex gap-2.5 items-center text-muted-gray">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Privacy Notice consent recorded at {member.privacyConsentAt?.toDate ? member.privacyConsentAt.toDate().toLocaleString() : 'Signup'} (Notice V{member.consentVersion})</span>
              </div>
              {member.photoConsentAt && (
                <div className="flex gap-2.5 items-center text-muted-gray">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>Profile Photo consent recorded at {member.photoConsentAt?.toDate ? member.photoConsentAt.toDate().toLocaleString() : 'Signup'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions Sidebar */}
          <div className="space-y-6">
            <div className="bg-surface border border-border-dark p-6 rounded-2xl space-y-4 shadow-md">
              <h3 className="text-sm font-semibold text-text-main border-b border-border-dark pb-2 mb-2">Ledger Actions</h3>
              
              <button
                onClick={() => setShowPaymentModal(true)}
                disabled={totalOutstanding === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <PlusCircle className="h-4 w-4" />
                Record Fee Payment
              </button>

              <button
                onClick={() => {
                  if (plans.length > 0) {
                    setRenewPlanId(plans[0].id);
                  }
                  setShowRenewModal(true);
                }}
                className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Calendar className="h-4 w-4" />
                Renew Membership
              </button>

              <button
                onClick={() => setShowFreezeModal(true)}
                disabled={!activeMs}
                className="w-full bg-surface-light border border-border-muted hover:border-primary disabled:opacity-50 text-text-main font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                Freeze Membership
              </button>

              {role === 'owner' && (
                <button
                  onClick={() => setShowRefundModal(true)}
                  className="w-full bg-surface-light border border-border-muted hover:border-red-500 text-text-main font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  Refund Payment
                </button>
              )}
            </div>

            {/* Profile status actions */}
            <div className="bg-surface border border-border-dark p-6 rounded-2xl space-y-3 shadow-md">
              <h3 className="text-sm font-semibold text-text-main border-b border-border-dark pb-2 mb-2">Danger Zone</h3>
              
              <button
                onClick={handleToggleArchive}
                className="w-full bg-surface-light hover:bg-border-muted hover:text-text-main text-text-main font-semibold py-2 px-3 rounded-lg text-xs cursor-pointer border border-border-muted"
              >
                {member.recordStatus === 'archived' ? 'Restore Profile' : 'Archive Member (Soft Delete)'}
              </button>

              {role === 'owner' && (
                <button
                  onClick={handlePermanentDelete}
                  className="w-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 dark:bg-red-950/20 dark:border-red-500/30 dark:text-red-500 dark:hover:bg-red-950/40 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Permanently Delete Member
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Memberships list */}
      {activeTab === 'memberships' && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl shadow-md">
          <h3 className="text-sm font-semibold text-text-main mb-4">Membership Subscription History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-dark text-muted-gray font-semibold bg-canvas/30">
                  <th className="p-3">Plan Name</th>
                  <th className="p-3">Start Date</th>
                  <th className="p-3">End Date</th>
                  <th className="p-3">Final Amount</th>
                  <th className="p-3">Frequency</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Freezes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {memberships.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-gray">No memberships recorded.</td>
                  </tr>
                ) : (
                  memberships.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-light">
                      <td className="p-3 font-semibold text-text-main">{m.planNameSnapshot}</td>
                      <td className="p-3">{m.startDate}</td>
                      <td className="p-3">{m.endDate}</td>
                      <td className="p-3 font-bold">{formatINR(m.finalAmount, false)}</td>
                      <td className="p-3 uppercase font-semibold">{m.billingFrequency}</td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                          m.baseStatus === 'active' && m.endDate >= todayStr ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' :
                          'bg-neutral-800 text-muted-gray'
                        }`}>
                          {m.baseStatus === 'active' && m.endDate < todayStr ? 'expired' : m.baseStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        {m.freezePeriods && m.freezePeriods.length > 0 ? (
                          <span className="text-[10px] text-blue-400 font-semibold">{m.freezePeriods.length} Frozen Period(s)</span>
                        ) : (
                          'None'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Payments Ledger */}
      {activeTab === 'payments' && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl shadow-md">
          <h3 className="text-sm font-semibold text-text-main mb-4">Payment & Transaction Ledger</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-dark text-muted-gray font-semibold bg-canvas/30">
                  <th className="p-3">Receipt No</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-gray">No transactions recorded.</td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-light">
                      <td className="p-3 font-mono font-bold text-text-main">{p.receiptNumber}</td>
                      <td className="p-3">{p.paymentDate}</td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                          p.type === 'payment' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' :
                          p.type === 'refund' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400' : 'bg-neutral-800 text-muted-gray'
                        }`}>
                          {p.type}
                        </span>
                      </td>
                      <td className="p-3 uppercase">{p.paymentMethod}</td>
                      <td className="p-3 text-muted-gray">{p.transactionReference || 'N/A'}</td>
                      <td className={`p-3 font-bold ${p.type === 'refund' ? 'text-red-500' : 'text-emerald-400'}`}>
                        {p.type === 'refund' ? '-' : ''}{formatINR(p.amount, false)}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => openReceipt(p)}
                          className="bg-canvas hover:bg-border-muted hover:text-text-main text-text-main p-1.5 rounded-lg border border-border-muted cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Dues ledger */}
      {activeTab === 'dues' && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl shadow-md">
          <h3 className="text-sm font-semibold text-text-main mb-4">Membership Installment Dues</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-dark text-muted-gray font-semibold bg-canvas/30">
                  <th className="p-3">Billing Period</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Original Due</th>
                  <th className="p-3">Paid Already</th>
                  <th className="p-3">Balance Dues</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {dues.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-gray">No dues generated.</td>
                  </tr>
                ) : (
                  dues.map((d) => (
                    <tr key={d.id} className="hover:bg-surface-light">
                      <td className="p-3">{d.billingPeriodStart} to {d.billingPeriodEnd}</td>
                      <td className={`p-3 font-semibold ${d.balance > 0 && d.dueDate < todayStr && d.baseStatus !== 'waived' ? 'text-red-500 font-bold' : ''}`}>
                        {d.dueDate} {d.balance > 0 && d.dueDate < todayStr && d.baseStatus !== 'waived' ? '(Overdue)' : ''}
                      </td>
                      <td className="p-3 font-semibold">{formatINR(d.netDue, false)}</td>
                      <td className="p-3 text-emerald-400">{formatINR(d.amountPaid, false)}</td>
                      <td className={`p-3 font-bold ${d.balance > 0 ? 'text-text-main' : 'text-muted-gray'}`}>{formatINR(d.balance, false)}</td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold ${
                          d.baseStatus === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400' :
                          d.baseStatus === 'waived' ? 'bg-neutral-850 text-muted-gray' :
                          d.balance > 0 && d.dueDate < todayStr ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-500/20' :
                          'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                        }`}>
                          {d.baseStatus === 'unpaid' && d.dueDate < todayStr ? 'overdue' : d.baseStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Activity & Audit logs */}
      {activeTab === 'activity' && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl shadow-md">
          <h3 className="text-sm font-semibold text-text-main mb-4">Audit Activity Logs</h3>
          <div className="space-y-4">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-center text-muted-gray py-6">No activity records logged.</p>
            ) : (
              [...auditLogs].sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)).map((log) => (
                <div key={log.id} className="text-xs border-b border-border-dark pb-3 last:border-b-0">
                  <div className="flex justify-between items-center text-muted-gray">
                    <span className="font-bold text-text-main uppercase text-[10px] bg-canvas px-1.5 py-0.5 rounded border border-border-muted inline-block">
                      {log.action}
                    </span>
                    <span>{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : ''}</span>
                  </div>
                  <p className="text-text-main font-medium mt-1.5">{log.safeAfterSummary}</p>
                  <p className="text-[10px] text-muted-gray mt-0.5">Operator: {log.actorName} ({log.actorUid})</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: Record Fee Payment */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border-dark p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-text-main mb-4">Record Fee Payment</h3>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-muted-gray mb-1">Amount to Pay (₹) *</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  max={totalOutstanding}
                />
                <span className="text-[10px] text-muted-gray">Max payable: ₹{totalOutstanding}</span>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value as any)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Reference (Optional)</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  placeholder="e.g. Transaction Id"
                />
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 border-t border-border-dark pt-4">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="bg-canvas border border-border-muted px-3 py-2 rounded-xl text-xs font-semibold text-text-main cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={actionLoading || payAmount <= 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Renew Membership */}
      {showRenewModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border-dark p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-text-main mb-4">Renew Gym Membership</h3>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-muted-gray mb-1">Select Plan</label>
                <select
                  value={renewPlanId}
                  onChange={e => setRenewPlanId(e.target.value)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (₹{p.standardPrice})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Start Date Option</label>
                <select
                  value={renewStartDateOption}
                  onChange={e => setRenewStartDateOption(e.target.value as any)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                >
                  <option value="immediate">Start Immediately (Today)</option>
                  {latestMs && (
                    <option value="after_end">Start Day After Current Expiration ({latestMs.endDate})</option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 border-t border-border-dark pt-4">
              <button
                type="button"
                onClick={() => setShowRenewModal(false)}
                className="bg-canvas border border-border-muted px-3 py-2 rounded-xl text-xs font-semibold text-text-main cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenewMembership}
                disabled={actionLoading || !renewPlanId}
                className="bg-primary hover:bg-primary-dark text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading ? 'Renewing...' : 'Confirm Renewal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Freeze Membership */}
      {showFreezeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border-dark p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-text-main mb-4">Freeze Membership Subscription</h3>
            
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-gray mb-1">Freeze Start Date</label>
                  <input
                    type="date"
                    value={freezeStart}
                    onChange={e => setFreezeStart(e.target.value)}
                    className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-muted-gray mb-1">Freeze End Date</label>
                  <input
                    type="date"
                    value={freezeEnd}
                    onChange={e => setFreezeEnd(e.target.value)}
                    className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Reason for Freeze</label>
                <input
                  type="text"
                  value={freezeReason}
                  onChange={e => setFreezeReason(e.target.value)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  placeholder="e.g. Travel / Medical"
                />
              </div>

              <div className="bg-blue-950/20 border border-blue-500/25 p-3 rounded-lg text-blue-300">
                <span>Freezing will extend the membership end date by <span className="font-bold text-text-main">{getDaysBetween(freezeStart, freezeEnd)} Days</span>.</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 border-t border-border-dark pt-4">
              <button
                type="button"
                onClick={() => setShowFreezeModal(false)}
                className="bg-canvas border border-border-muted px-3 py-2 rounded-xl text-xs font-semibold text-text-main cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFreezeMembership}
                disabled={actionLoading || !freezeStart || !freezeEnd}
                className="bg-blue-600 hover:bg-blue-700 text-text-main font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading ? 'Freezing...' : 'Confirm Freeze'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Refund Payment */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-border-dark p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-text-main mb-4 text-red-400">Process Fee Refund (Owner Only)</h3>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-muted-gray mb-1">Select Payment Transaction</label>
                <select
                  value={refundPaymentId}
                  onChange={e => {
                    setRefundPaymentId(e.target.value);
                    const sel = payments.find(p => p.id === e.target.value);
                    if (sel) setRefundAmount(sel.amount);
                  }}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                >
                  <option value="">-- Choose Payment --</option>
                  {payments.filter(p => p.type === 'payment').map(p => (
                    <option key={p.id} value={p.id}>{p.receiptNumber} - ₹{p.amount} ({p.paymentDate})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Refund Amount (₹) *</label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={e => setRefundAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                />
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Reason for Refund *</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  placeholder="e.g. Session cancelled / Double charge"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 border-t border-border-dark pt-4">
              <button
                type="button"
                onClick={() => setShowRefundModal(false)}
                className="bg-canvas border border-border-muted px-3 py-2 rounded-xl text-xs font-semibold text-text-main cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRefund}
                disabled={actionLoading || !refundPaymentId || !refundReason || refundAmount <= 0}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading ? 'Refunding...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Printable Receipt view */}
      {showReceiptModal && selectedReceipt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm relative flex flex-col text-xs shadow-2xl">
            {/* Close Button Top Right */}
            <button
              type="button"
              onClick={() => setShowReceiptModal(false)}
              className="absolute top-3 right-3 p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full transition-colors z-10 print:hidden"
            >
              <X className="h-4 w-4" />
            </button>
            
            {/* Receipt Content Wrapper (Dark background in UI only) */}
            <div className="bg-[#0E0E10] p-4 pt-10 rounded-t-2xl print:bg-white print:p-0 print:pt-0">
              <div id="receipt-content" className="p-6 bg-white text-black w-full relative rounded-2xl shadow-inner print:shadow-none">
                <div className="text-center">
                  <h2 className="text-base font-extrabold tracking-tight m-0">{gym?.name}</h2>
              <p className="text-[10px] text-neutral-600">{gym?.address || 'Gym Address'}</p>
              <p className="text-[10px] text-neutral-600">Phone: {gym?.phone} | Email: {gym?.email}</p>
              {gym?.optionalGSTIN && <p className="text-[10px] text-neutral-600">GSTIN: {gym.optionalGSTIN}</p>}
            </div>

            <div className="border-t border-b border-dashed border-neutral-300 py-3 space-y-1.5">
              <div className="flex justify-between font-bold text-[10px]">
                <span>Receipt Number:</span>
                <span>{selectedReceipt.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Date:</span>
                <span>{selectedReceipt.paymentDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Member Name:</span>
                <span>{member.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span>Member Code:</span>
                <span>{member.memberCode}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between font-bold text-[10px] text-neutral-800">
                <span>Transaction Type:</span>
                <span className="uppercase">{selectedReceipt.type}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Method:</span>
                <span className="uppercase">{selectedReceipt.paymentMethod}</span>
              </div>
              {selectedReceipt.transactionReference && (
                <div className="flex justify-between">
                  <span>Reference ID:</span>
                  <span>{selectedReceipt.transactionReference}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-neutral-300 pt-3 flex justify-between font-bold text-sm">
              <span>Amount Received:</span>
              <span>{formatINR(selectedReceipt.amount)}</span>
            </div>

              <div className="text-center text-[9px] text-neutral-500 pt-6">
                <p>Thank you for your training with us!</p>
                <p className="mt-1">Computer generated receipt. No signature required.</p>
              </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex flex-wrap justify-end gap-2 p-4 bg-[#0E0E10] rounded-b-2xl print:hidden">
              <button type="button" onClick={handleSharePNG} className="bg-primary hover:bg-primary-dark text-white font-semibold px-3 py-1.5 rounded-lg text-[10px] cursor-pointer flex items-center gap-1">
                <Share2 className="w-3 h-3" /> Share
              </button>
              <button type="button" onClick={handleCopyPNG} className="bg-primary hover:bg-primary-dark text-white font-semibold px-3 py-1.5 rounded-lg text-[10px] cursor-pointer flex items-center gap-1">
                <Copy className="w-3 h-3" /> Copy
              </button>
              <button type="button" onClick={handleDownloadPNG} className="bg-primary hover:bg-primary-dark text-white font-semibold px-3 py-1.5 rounded-lg text-[10px] cursor-pointer flex items-center gap-1">
                <Download className="w-3 h-3" /> Save PNG
              </button>
              <button type="button" onClick={() => window.print()} className="bg-neutral-850 hover:bg-neutral-700 text-white font-semibold px-3 py-1.5 rounded-lg text-[10px] cursor-pointer">
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 z-50 overflow-y-auto">
          <div className="bg-surface border border-border-dark p-6 rounded-2xl w-full max-w-lg shadow-2xl relative my-8">
            <h3 className="text-sm font-bold text-text-main mb-2">Edit Member Profile</h3>
            <p className="text-[10px] text-muted-gray mb-4">Update contact and personal registration details.</p>

            {editError && (
              <div className="w-full bg-red-950/30 border border-red-500/50 p-3 rounded-lg flex items-center gap-2 text-red-200 text-xs mb-4">
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="flex flex-col items-center justify-center space-y-2 mb-4">
                <div className="w-20 h-20 rounded-2xl bg-canvas border border-border-muted flex items-center justify-center overflow-hidden">
                  {editPhotoPreview ? (
                    <img src={editPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <MemberPhoto path={member.photoStoragePath} fallbackLetter={member.fullName.charAt(0)} className="w-full h-full object-cover" />
                  )}
                </div>
                <label className="cursor-pointer bg-surface-light border border-border-muted hover:border-primary text-text-main px-3 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 transition-colors">
                  <Upload className="w-3 h-3" />
                  Upload New Photo
                  <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                </label>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={e => setEditFullName(e.target.value)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-muted-gray mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  />
                </div>

                <div>
                  <label className="block text-muted-gray mb-1">Alternate Phone</label>
                  <input
                    type="text"
                    value={editAlternatePhone}
                    onChange={e => setEditAlternatePhone(e.target.value)}
                    className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Email Address</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-muted-gray mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={editDob}
                    onChange={e => setEditDob(e.target.value)}
                    className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  />
                </div>

                <div>
                  <label className="block text-muted-gray mb-1">Gender</label>
                  <select
                    value={editGender}
                    onChange={e => setEditGender(e.target.value)}
                    className="w-full bg-canvas border border-border-muted px-3 py-2.5 rounded-xl text-text-main outline-none"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-muted-gray mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    value={editEmergencyName}
                    onChange={e => setEditEmergencyName(e.target.value)}
                    className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  />
                </div>

                <div>
                  <label className="block text-muted-gray mb-1">Emergency Phone</label>
                  <input
                    type="text"
                    value={editEmergencyPhone}
                    onChange={e => setEditEmergencyPhone(e.target.value)}
                    className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Personal Notes</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border-dark mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="bg-neutral-850 hover:bg-neutral-750 text-white font-semibold py-2 px-4 rounded-xl cursor-pointer"
                  disabled={editSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary-dark text-white font-semibold py-2 px-4 rounded-xl cursor-pointer flex items-center gap-1.5"
                  disabled={editSaving}
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
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
