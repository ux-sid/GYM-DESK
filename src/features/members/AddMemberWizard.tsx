import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, addMemberCompleteAtomic, uploadMemberPhoto } from '../../services/firebase';
import type { Plan } from '../../types';
import { getKolkataTodayString, calculateMembershipEndDate } from '../../utils/dateUtils';
import { generateDuesForMembership } from '../../utils/financeUtils';
import imageCompression from 'browser-image-compression';
import { Camera, Upload, AlertTriangle, ArrowLeft, ArrowRight, UserCheck, RefreshCw } from 'lucide-react';

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

interface AddMemberWizardProps {
  onSuccess: (memberId: string) => void;
  onCancel: () => void;
}

export const AddMemberWizard: React.FC<AddMemberWizardProps> = ({ onSuccess, onCancel }) => {
  const { gym, user } = useAuth();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // --- Step 1: Basic Details Form State ---
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('male');

  const emergencyName = '';
  const emergencyPhone = '';
  const notes = '';

  // Image Upload State
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Duplicate Phone Warning
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null);


  // Minor Fields
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  // --- Step 2: Plan State ---
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [startDate, setStartDate] = useState(getKolkataTodayString());
  const [endDate, setEndDate] = useState('');
  const [customPrice, setCustomPrice] = useState(0);
  const [joiningFee, setJoiningFee] = useState(0);
  const [discountValue, setDiscountValue] = useState(0);
  const [discountType, setDiscountType] = useState<'none' | 'fixed' | 'percentage'>('none');

  // --- Step 3: Initial Payment State ---
  const [paidNow, setPaidNow] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'bank_transfer' | 'other'>('cash');
  const [transactionRef, setTransactionRef] = useState('');



  // --- Step 4: Consent State ---
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load active plans
  useEffect(() => {
    if (!gym) return;
    const loadPlans = async () => {
      try {
        const snap = await getDocs(collection(db, 'gyms', gym.id, 'plans'));
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Plan)).filter((p: Plan) => p.active);
        setPlans(list);
        if (list.length > 0) {
          setSelectedPlanId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load plans:', err);
      } finally {
        setLoadingPlans(false);
      }
    };
    loadPlans();
  }, [gym]);

  // Handle plan details update
  useEffect(() => {
    const plan = plans.find(p => p.id === selectedPlanId);
    if (!plan) return;

    setCustomPrice(plan.standardPrice);
    setJoiningFee(plan.joiningFee);
    
    // Auto end date
    const calcEnd = calculateMembershipEndDate(startDate, plan.durationValue, plan.durationUnit);
    setEndDate(calcEnd);
  }, [selectedPlanId, startDate, plans]);

  // Normalize phone
  const normalizePhone = (num: string) => num.replace(/\D/g, '').slice(-10);

  // Duplicate Check
  const checkDuplicatePhone = async () => {
    if (!gym || phone.length < 10) return;
    const norm = normalizePhone(phone);
    const snap = await getDocs(
      query(collection(db, 'gyms', gym.id, 'members'), where('phoneNormalised', '==', norm))
    );
    if (!snap.empty) {
      const match = snap.docs[0].data();
      setPhoneWarning(`A member named "${match.fullName}" already exists with this phone number.`);
    } else {
      setPhoneWarning(null);
    }
  };

  // Check age on DOB change to check if minor
  useEffect(() => {
    if (!dob) {
      setIsMinor(false);
      return;
    }
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    setIsMinor(age < 18);
  }, [dob]);

  // Calculations for Step 2
  const plan = plans.find(p => p.id === selectedPlanId);
  const discountAmount = 
    discountType === 'fixed' ? discountValue :
    discountType === 'percentage' ? (customPrice * discountValue) / 100 : 0;
  
  const taxRate = gym?.taxEnabled ? (gym.optionalTaxRate || 18) : 0;
  const taxableAmount = Math.max(0, customPrice + joiningFee - discountAmount);
  const taxAmount = (taxableAmount * taxRate) / 100;
  const finalAmount = parseFloat((taxableAmount + taxAmount).toFixed(2));

  // --- Step 1 UI Methods (Camera) ---

  const startCamera = async (overrideFacingMode?: 'user' | 'environment') => {
    setCameraActive(true);
    const modeToUse = overrideFacingMode || facingMode;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: modeToUse, width: 400, height: 400 },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Failed to open camera:', err);
      setCameraActive(false);
      alert('Camera access denied. Please upload a file instead.');
    }
  };

  const toggleCamera = () => {
    stopCamera();
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    setTimeout(() => {
      startCamera(newMode);
    }, 100);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Crop square from video frame
      ctx.drawImage(videoRef.current, 0, 0, 400, 400);
      canvas.toBlob(async (blob) => {
        if (blob) {
          // Compress
          const options = { maxSizeMB: 0.3, maxWidthOrHeight: 400, useWebWorker: true };
          const compressed = await imageCompression(blob as File, options);
          setPhotoBlob(compressed);
          setPhotoUrl(URL.createObjectURL(compressed));
        }
      }, 'image/jpeg', 0.85);
    }
    stopCamera();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Selected file must be an image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit.');
      return;
    }
    const options = { maxSizeMB: 0.3, maxWidthOrHeight: 400, useWebWorker: true };
    const compressed = await imageCompression(file, options);
    setPhotoBlob(compressed);
    setPhotoUrl(URL.createObjectURL(compressed));
  };



  // --- Step validation & navigation ---
  const validateStep = () => {
    if (step === 1) {
      if (!fullName) return 'Full Name is required.';
      if (phone.length < 10) return 'Valid Phone Number is required.';
      if (isMinor && (!guardianName || !guardianPhone)) return 'Guardian contact details are required for minors.';
    }
    if (step === 2) {
      if (!selectedPlanId) return 'Select a gym plan.';
      if (!startDate) return 'Start date is required.';
    }
    if (step === 3) {
      if (paidNow && (paymentAmount <= 0 || paymentAmount > finalAmount)) {
        return `Payment amount must be between 0 and final amount (₹${finalAmount}).`;
      }
    }
    if (step === 4) {
      if (!privacyConsent) return 'Privacy consent is required.';
      if (isMinor && !guardianConsent) return 'Guardian consent is required.';
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep();
    if (err) {
      alert(err);
      return;
    }
    if (step === 1) checkDuplicatePhone();
    setStep(step + 1);
  };

  // --- Save Operations ---
  const handleSave = async () => {
    if (!gym || !user) return;
    setSaving(true);
    setSaveError(null);

    try {
      let photoPath = '';

      // 1. Upload photo to Firebase Storage
      if (photoBlob) {
        photoPath = await uploadMemberPhoto(gym.id, 'temp', photoBlob);
        setUploadProgress(100);
      }

      // 2. Build Member object
      const normPhone = normalizePhone(phone);
      const memberPayload = {
        branchId: gym.defaultBranchId || 'main-branch',
        fullName,
        searchName: fullName.trim().toLowerCase(),
        photoStoragePath: photoPath || undefined,
        phone,
        phoneNormalised: normPhone,
        alternatePhone: alternatePhone || undefined,
        email: email || undefined,
        dateOfBirth: dob || undefined,
        gender: gender as any,
        addressLine1: address || undefined,
        emergencyContactName: emergencyName || undefined,
        emergencyContactPhone: emergencyPhone || undefined,
        tags: [] as string[],
        notes: notes || undefined,
        joinDate: startDate,
        recordStatus: 'current' as const,
        privacyConsentAt: new Date(),
        photoConsentAt: photoBlob ? new Date() : undefined,
        consentVersion: '1.0',
        isMinor,
        guardianName: isMinor ? guardianName : undefined,
        guardianPhone: isMinor ? guardianPhone : undefined,
        guardianConsentAt: isMinor ? new Date() : undefined,
        identityVerification: {
          type: 'none' as const,
          verified: false,
        },
        createdBy: user.uid,
        updatedBy: user.uid,
      };

      const membershipPayload = {
        branchId: gym.defaultBranchId || 'main-branch',
        planId: selectedPlanId,
        planNameSnapshot: plan?.name || 'Custom Plan',
        planPriceSnapshot: customPrice,
        startDate,
        endDate,
        grossAmount: customPrice,
        joiningFee,
        discountType,
        discountValue,
        discountAmount,
        taxAmount,
        finalAmount,
        billingFrequency: plan?.billingFrequency || 'upfront',
        baseStatus: 'active' as const,
        freezePeriods: [],
        createdBy: user.uid,
        updatedBy: user.uid,
      };

      const durationMonths = plan?.durationUnit === 'months' ? plan.durationValue : 1;
      const duesRaw = generateDuesForMembership({
        memberId: '', // overwritten in atomic func
        membershipId: '',
        branchId: gym.defaultBranchId || 'main-branch',
        startDate,
        endDate,
        finalAmount,
        grossAmount: customPrice,
        joiningFee,
        discountAmount,
        taxAmount,
        billingFrequency: plan?.billingFrequency || 'upfront',
        durationMonths,
      });

      const savedMemberId = await addMemberCompleteAtomic(
        gym.id, 
        cleanUndefined(memberPayload),
        cleanUndefined(membershipPayload),
        duesRaw,
        paidNow && paymentAmount > 0 ? cleanUndefined({
          branchId: gym.defaultBranchId || 'main-branch',
          type: 'payment',
          amount: paymentAmount,
          paymentDate: startDate,
          paymentMethod,
          transactionReference: transactionRef ? transactionRef : null,
          note: null,
          status: 'completed',
          createdBy: user.uid
        }) : null,
        user.uid, 
        user.displayName || 'Owner'
      );

      onSuccess(savedMemberId);
    } catch (err: any) {
      setSaveError(err.message || 'An error occurred while saving the member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface border border-border-dark p-6 rounded-2xl max-w-xl mx-auto shadow-xl">
      {/* Steps Progress Header */}
      <div className="flex justify-between items-center mb-8 border-b border-border-dark pb-4">
        <div>
          <h2 className="text-lg font-bold text-text-main m-0">Add Gym Member</h2>
          <p className="text-xs text-muted-gray">Step {step} of 4</p>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <span 
              key={i} 
              className={`w-5 h-1.5 rounded-full ${step >= i ? 'bg-primary' : 'bg-canvas'}`}
            ></span>
          ))}
        </div>
      </div>

      {/* STEP 1: Basic details */}
      {step === 1 && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-text-main">1. Member Profile & Contact</h3>

          {/* Photo Capture */}
          <div className="flex flex-col items-center gap-4 border border-dashed border-border-muted p-4 rounded-xl">
            {photoUrl ? (
              <img src={photoUrl} className="w-28 h-28 object-cover rounded-xl border border-primary" alt="Profile" />
            ) : (
              <div className="w-28 h-28 bg-canvas rounded-xl flex items-center justify-center border border-border-muted">
                <Camera className="h-8 w-8 text-muted-gray" />
              </div>
            )}
            
            <div className="flex gap-2">
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="bg-primary hover:bg-primary-dark text-white px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="h-4 w-4" />
                  Take Photo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  Capture Frame
                </button>
              )}
              
              <label className="bg-surface-light border border-border-muted hover:border-primary text-text-main px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer">
                <Upload className="h-4 w-4" />
                Upload Photo
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            </div>

            {cameraActive && (
              <div className="relative w-64 h-64 border border-primary rounded-xl overflow-hidden bg-black mt-2 group">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                <div className="absolute inset-4 border border-dashed border-white/50 pointer-events-none rounded-xl"></div>
                <button
                  type="button"
                  onClick={toggleCamera}
                  className="absolute top-2 right-2 bg-neutral-900/80 hover:bg-border-muted hover:text-text-main text-white p-2 rounded-full backdrop-blur-sm transition-all"
                  title="Flip Camera"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Contact Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full bg-canvas border border-border-muted hover:border-primary text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                placeholder="e.g. Rahul Sharma"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-main mb-1">Phone Number (WhatsApp) *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => {
                    setPhone(e.target.value);
                    if (phoneWarning) setPhoneWarning(null);
                  }}
                  className="w-full bg-canvas border border-border-muted hover:border-primary text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                  placeholder="e.g. 9876543210"
                />
                {phoneWarning && (
                  <p className="text-xs text-amber-500 mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {phoneWarning}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-main mb-1">Alternate Phone</label>
                <input
                  type="tel"
                  value={alternatePhone}
                  onChange={e => setAlternatePhone(e.target.value)}
                  className="w-full bg-canvas border border-border-muted hover:border-primary text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                  placeholder="e.g. 9876543211"
                />
              </div>
            </div>

            {/* DOB & Gender */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-main mb-1">Date of Birth (Optional)</label>
                <input
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  className="w-full bg-canvas border border-border-muted hover:border-primary text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-main mb-1">Gender (Optional)</label>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                  className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Guardian Fields for Minors */}
            {isMinor && (
              <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl space-y-3">
                <p className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Minor detected (Under 18). Guardian details are required.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-text-main mb-1">Guardian Name</label>
                    <input
                      type="text"
                      value={guardianName}
                      onChange={e => setGuardianName(e.target.value)}
                      className="w-full bg-canvas border border-border-muted text-xs rounded-lg px-3 py-1.5 text-text-main outline-none"
                      placeholder="e.g. Parent Name"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-text-main mb-1">Guardian Phone</label>
                    <input
                      type="tel"
                      value={guardianPhone}
                      onChange={e => setGuardianPhone(e.target.value)}
                      className="w-full bg-canvas border border-border-muted text-xs rounded-lg px-3 py-1.5 text-text-main outline-none"
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Email & Address */}
            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-canvas border border-border-muted hover:border-primary text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                placeholder="e.g. member@gmail.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-main mb-1">Address (Optional)</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full bg-canvas border border-border-muted hover:border-primary text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                placeholder="e.g. Apartment, Street Name"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Plan Selection */}
      {step === 2 && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-text-main">2. Membership & Plan Details</h3>

          {loadingPlans ? (
            <div className="py-8 text-center text-xs text-muted-gray">Loading plans...</div>
          ) : plans.length === 0 ? (
            <div className="py-8 text-center text-xs text-amber-500">
              No active plans configured. Please configure plans in Settings first.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-main mb-1">Select Reusable Plan</label>
                <select
                  value={selectedPlanId}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2.5 text-text-main outline-none"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.durationValue} {p.durationUnit}) - Standard Price: ₹{p.standardPrice}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-main mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-main mb-1">End Date (Calculated)</label>
                  <input
                    type="date"
                    disabled
                    value={endDate}
                    className="w-full bg-canvas/50 border border-border-muted text-sm rounded-xl px-4 py-2 text-muted-gray cursor-not-allowed outline-none"
                  />
                </div>
              </div>

              {/* Adjust prices */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-main mb-1">Standard Plan Fee (₹)</label>
                  <input
                    type="number"
                    value={customPrice}
                    onChange={e => setCustomPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-main mb-1">Joining Fee (₹)</label>
                  <input
                    type="number"
                    value={joiningFee}
                    onChange={e => setJoiningFee(parseFloat(e.target.value) || 0)}
                    className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                  />
                </div>
              </div>

              {/* Discounts */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-main mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={e => setDiscountType(e.target.value as any)}
                    className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                  >
                    <option value="none">No Discount</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>

                {discountType !== 'none' && (
                  <div>
                    <label className="block text-xs font-medium text-text-main mb-1">Discount Value</label>
                    <input
                      type="number"
                      value={discountValue}
                      onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                      className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                      placeholder="e.g. 500"
                    />
                  </div>
                )}
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="bg-canvas border border-border-muted p-4 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-gray">
                  <span>Gross Plan Price:</span>
                  <span>₹{customPrice}</span>
                </div>
                {joiningFee > 0 && (
                  <div className="flex justify-between text-muted-gray">
                    <span>Joining Fee:</span>
                    <span>+ ₹{joiningFee}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Discount:</span>
                    <span>- ₹{discountAmount}</span>
                  </div>
                )}
                {gym?.taxEnabled && (
                  <div className="flex justify-between text-muted-gray">
                    <span>GST ({taxRate}%):</span>
                    <span>+ ₹{taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-border-muted pt-1.5 flex justify-between font-bold text-text-main text-sm">
                  <span>Total Payable:</span>
                  <span className="text-primary">₹{finalAmount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Initial Payment */}
      {step === 3 && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-text-main">3. Capture Initial Payment</h3>

          <div className="flex items-center justify-between bg-canvas border border-border-muted p-4 rounded-xl">
            <div>
              <p className="text-sm font-bold text-text-main">Record payment now?</p>
              <p className="text-xs text-muted-gray">Toggle if member paid joining fee / plan fees today.</p>
            </div>
            <input
              type="checkbox"
              checked={paidNow}
              onChange={e => {
                setPaidNow(e.target.checked);
                if (e.target.checked) setPaymentAmount(finalAmount);
              }}
              className="w-5 h-5 accent-primary"
            />
          </div>

          {paidNow && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-main mb-1">Amount Received (₹)</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                  max={finalAmount}
                />
                <span className="text-[10px] text-muted-gray">
                  Remaining unpaid balance: <span className="text-text-main font-bold">₹{parseFloat((finalAmount - paymentAmount).toFixed(2))}</span>
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-main mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2.5 text-text-main outline-none"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="card">Debit / Credit Card</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-main mb-1">Transaction Reference (Optional)</label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={e => setTransactionRef(e.target.value)}
                  className="w-full bg-canvas border border-border-muted text-sm rounded-xl px-4 py-2 text-text-main outline-none"
                  placeholder="e.g. UPI Ref / Bank UTN"
                />
              </div>

              {!navigator.onLine && (
                <div className="bg-amber-950/20 border border-amber-500/30 p-3 rounded-lg flex items-center gap-2 text-amber-300 text-xs">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Offline mode active. Payment will be saved as a draft. Receipts cannot be issued until online.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* STEP 4: Review and Consent */}
      {step === 4 && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-text-main">4. Final Verification & Consent</h3>

          {/* Quick Review */}
          <div className="bg-canvas border border-border-muted p-4 rounded-xl text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-gray">Full Name:</span>
              <span className="text-text-main font-medium">{fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-gray">WhatsApp:</span>
              <span className="text-text-main font-medium">{phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-gray">Plan selected:</span>
              <span className="text-text-main font-medium">{plan?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-gray">Duration:</span>
              <span className="text-text-main font-medium">{startDate} to {endDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-gray">Total Fees:</span>
              <span className="text-text-main font-bold">₹{finalAmount}</span>
            </div>
            {paidNow && (
              <div className="flex justify-between">
                <span className="text-muted-gray">Paid Today:</span>
                <span className="text-emerald-400 font-bold">₹{paymentAmount} ({paymentMethod.toUpperCase()})</span>
              </div>
            )}
          </div>

          {/* Consents */}
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyConsent}
                onChange={e => setPrivacyConsent(e.target.checked)}
                className="mt-1 w-4 h-4 accent-primary"
              />
              <span className="text-xs text-muted-gray">
                I verify that the member has agreed to the privacy policy of {gym?.name || 'the gym'} and has consented to register their phone number and personal details. *
              </span>
            </label>

            {photoUrl && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={photoConsent}
                  onChange={e => setPhotoConsent(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-primary"
                />
                <span className="text-xs text-muted-gray">
                  The member consents to upload their profile photograph for gym check-in identification.
                </span>
              </label>
            )}

            {isMinor && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardianConsent}
                  onChange={e => setGuardianConsent(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-primary"
                />
                <span className="text-xs text-muted-gray">
                  I verify that the guardian {guardianName} has provided parental consent for this minor's membership. *
                </span>
              </label>
            )}
          </div>

          {saveError && (
            <div className="bg-red-950/30 border border-red-500/50 p-3 rounded-lg flex items-center gap-2 text-red-200 text-xs">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8 border-t border-border-dark pt-4">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="bg-surface-light hover:bg-border-muted hover:text-text-main text-text-main font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            className="bg-surface-light hover:bg-border-muted hover:text-text-main text-text-main font-semibold px-4 py-2 rounded-xl text-sm cursor-pointer"
          >
            Cancel
          </button>
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={handleNext}
            className="bg-primary hover:bg-primary-dark text-white font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 shadow-lg cursor-pointer"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving... {uploadProgress > 0 ? `${uploadProgress}%` : ''}</span>
              </>
            ) : (
              <>
                <UserCheck className="h-4 w-4" />
                Save Member Record
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
