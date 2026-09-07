import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from './AuthContext';
import { createGymWorkspace, db } from '../../services/firebase';
import { collection, getDocs, doc, getDoc, getDocsFromCache } from 'firebase/firestore';
import { gymSetupSchema } from '../../validation/schemas';
import { Dumbbell, PlusCircle, ShieldAlert, Building, ArrowRight, LogOut } from 'lucide-react';

export const FirstRunSetup: React.FC = () => {
  const { user, selectGym, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [existingGyms, setExistingGyms] = useState<any[]>([]);
  const [manualGymId, setManualGymId] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);

  // Auto-scan for existing gym workspaces on mount
  useEffect(() => {
    let isMounted = true;
    const scanForGyms = async () => {
      setScanning(true);
      setScanError(null);
      try {
        // 0. Check deterministic workspace for current user email
        if (user?.email) {
          const detId = 'gym_' + user.email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          console.log('[FirstRunSetup] Auto-connecting to deterministic gym:', detId);
          await selectGym(detId);
          return;
        }

        // 1. Check localStorage keys for any saved gym ID
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.includes('gym') || k.includes('last_gym'))) {
            const val = localStorage.getItem(k);
            if (val && typeof val === 'string' && val.length > 5 && !val.startsWith('{')) {
              try {
                const gSnap = await getDoc(doc(db, 'gyms', val));
                if (gSnap.exists() && isMounted) {
                  console.log('[FirstRunSetup] Auto-loaded gym from localStorage key:', k, val);
                  await selectGym(val);
                  return;
                }
              } catch (e) {
                // Ignore
              }
            }
          }
        }

        // 2. Check if mock-tester-uid has a gym
        try {
          const testerSnap = await getDoc(doc(db, 'users', 'mock-tester-uid'));
          if (testerSnap.exists()) {
            const tData = testerSnap.data();
            const gId = tData.lastGymId || (tData.gyms ? Object.keys(tData.gyms)[0] : null);
            if (gId) {
              const gymSnap = await getDoc(doc(db, 'gyms', gId));
              if (gymSnap.exists() && isMounted) {
                console.log('[FirstRunSetup] Found gym from tester profile:', gId);
                await selectGym(gId);
                return;
              }
            }
          }
        } catch (e) {
          // Ignore
        }

        // 3. Try reading all gyms from local cache first (IndexedDB)
        try {
          const cacheSnap = await getDocsFromCache(collection(db, 'gyms'));
          if (!cacheSnap.empty && isMounted) {
            const list = cacheSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setExistingGyms(list);

            const autoGym: any = list.find((g: any) =>
              g.createdBy === user?.uid ||
              (user?.email && g.email?.toLowerCase() === user?.email?.toLowerCase())
            ) || (list.length === 1 ? list[0] : null);

            if (autoGym) {
              console.log('[FirstRunSetup] Auto-connected to gym from cache:', autoGym.id);
              await selectGym(autoGym.id);
              return;
            }
          }
        } catch (e) {
          // Ignore
        }

        // 4. Check all gyms in Firestore from server
        try {
          const gymsSnap = await getDocs(collection(db, 'gyms'));
          if (!isMounted) return;

          if (!gymsSnap.empty) {
            const list = gymsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setExistingGyms(list);

            // Find match by email or UID
            const match = list.find((g: any) =>
              g.createdBy === user?.uid ||
              (user?.email && g.email?.toLowerCase() === user?.email?.toLowerCase())
            );

            const targetGym: any = match || (list.length === 1 ? list[0] : null);
            if (targetGym) {
              console.log('[FirstRunSetup] Auto-connecting to existing gym workspace:', targetGym.id, targetGym.name);
              await selectGym(targetGym.id);
              return;
            }
          }
        } catch (err: any) {
          console.warn('[FirstRunSetup] Server scan error:', err);
          if (isMounted) {
            setScanError(err.message || 'Permission denied when reading existing gyms');
          }
        }
      } catch (err: any) {
        console.warn('[FirstRunSetup] Overall scan error:', err);
      } finally {
        if (isMounted) setScanning(false);
      }
    };

    scanForGyms();
    return () => { isMounted = false; };
  }, [user?.uid, user?.email]);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(gymSetupSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: user?.email || '',
      address: '',
      defaultBranchName: 'Main Branch',
      receiptPrefix: 'RCPT',
      taxEnabled: false,
      optionalGSTIN: '',
      optionalTaxRate: 18,
    }
  });

  const handleConnectExisting = async (gymId: string) => {
    if (!gymId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await selectGym(gymId.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to connect to gym workspace.');
      setLoading(false);
    }
  };

  const onSubmit = async (data: any) => {
    if (!user || !user.uid) {
      setError('Your session is missing user details. Please sign out and log in again.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const gymId = await createGymWorkspace(
        user.uid,
        user.email || '',
        user.displayName || 'Gym Owner',
        {
          name: data.name,
          phone: data.phone,
          email: data.email,
          address: data.address || '',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          locale: 'en-IN',
          defaultBranchId: 'main-branch',
          receiptPrefix: data.receiptPrefix,
          taxEnabled: data.taxEnabled,
          optionalGSTIN: data.optionalGSTIN || '',
          optionalTaxRate: data.optionalTaxRate,
          privacyNoticeVersion: '1.0',
          reminderTemplates: {
            feeDueEnglish: 'Hi {member_name}, this is a reminder from {gym_name} that your outstanding balance of {amount} is due on {due_date}. Please clear it. Phone: {gym_phone}',
            feeDueHindi: 'नमस्ते {member_name}, यह {gym_name} से एक रिमाइंडर है कि आपका बकाया {amount} {due_date} को देय है। कृपया भुगतान करें। फोन: {gym_phone}',
            expiryEnglish: 'Hi {member_name}, your membership at {gym_name} expires on {due_date}. Please renew it to continue. Phone: {gym_phone}',
            expiryHindi: 'नमस्ते {member_name}, {gym_name} में आपकी सदस्यता {due_date} को समाप्त हो रही है। कृपया जारी रखने के लिए रिन्यू करें। फोन: {gym_phone}',
          },
          retentionSettings: {
            archivedRetentionDays: 365,
            enableRetentionReminders: true,
          }
        }
      );
      
      await selectGym(gymId);
    } catch (err: any) {
      setError(err.message || 'Failed to setup gym workspace.');
    } finally {
      setLoading(false);
    }
  };

  if (scanning) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col justify-center items-center gap-3">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-muted-gray font-medium">Checking for existing gym workspaces...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas py-12 px-4 flex flex-col justify-center items-center">
      <div className="w-full max-w-xl bg-surface border border-border-dark p-8 rounded-2xl shadow-xl">
        
        {/* Top Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-white p-2.5 rounded-lg">
              <Dumbbell className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-main m-0">Gym Workspace</h1>
              <p className="text-xs text-muted-gray">Logged in as {user?.email || 'User'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-muted text-xs text-muted-gray hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Existing Gyms Detected Banner */}
        {existingGyms.length > 0 && (
          <div className="bg-primary/10 border border-primary/30 p-4 rounded-xl mb-6 space-y-3">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <Building className="h-4 w-4" />
              <span>Pre-Existing Gym Workspace Found</span>
            </div>
            <p className="text-xs text-muted-gray">
              We detected existing gym data in your database. Click below to connect and restore all your members and records:
            </p>
            <div className="space-y-2">
              {existingGyms.map((g: any) => (
                <button
                  key={g.id}
                  onClick={() => handleConnectExisting(g.id)}
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all shadow-md"
                >
                  <div className="text-left">
                    <span className="font-bold block text-sm">{g.name || 'Gym Workspace'}</span>
                    <span className="text-[10px] text-white/70">{g.email || g.phone || `ID: ${g.id}`}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>Open Dashboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Manual Gym ID Connect Input */}
        <div className="bg-canvas border border-border-muted p-4 rounded-xl mb-6">
          <label className="block text-xs font-semibold text-text-main mb-1.5">
            Connect to Existing Gym by ID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter gym ID..."
              value={manualGymId}
              onChange={e => setManualGymId(e.target.value)}
              className="flex-1 bg-surface border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
            />
            <button
              onClick={() => handleConnectExisting(manualGymId)}
              disabled={!manualGymId.trim() || loading}
              className="bg-surface-light border border-border-muted hover:bg-neutral-800 text-text-main font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <span>Connect</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Database Notice for Missing Permissions */}
        {scanError && (
          <div className="bg-amber-950/30 border border-amber-500/50 p-4 rounded-xl mb-6 space-y-2 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Database Query Notice: {scanError}</span>
            </div>
            <p className="text-[11px] text-amber-300/80 leading-relaxed">
              Firestore security rules in Firebase Console currently block collection queries for <span className="font-semibold text-white">{user?.email}</span>.
              If you have already created a gym, ensure your rules in Firebase Console allow authenticated reads:
            </p>
            <div className="bg-black/50 p-2.5 rounded-lg font-mono text-[10px] text-amber-100 overflow-x-auto select-all">
              {`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if request.auth != null;\n    }\n  }\n}`}
            </div>
          </div>
        )}

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-muted"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-surface px-2 text-muted-gray">Or Create New Workspace</span></div>
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-500/50 p-3 rounded-lg mb-6 flex gap-2 items-center text-red-200 text-sm">
            <ShieldAlert className="h-5 w-5 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Gym Name */}
          <div>
            <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="name">Gym Name</label>
            <input
              id="name"
              type="text"
              {...register('name')}
              className="w-full bg-canvas border border-border-muted hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-2.5 text-text-main transition-colors"
              placeholder="e.g. Iron Gym & Fitness"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message as string}</p>}
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="text"
                {...register('phone')}
                className="w-full bg-canvas border border-border-muted hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-2.5 text-text-main transition-colors"
                placeholder="e.g. 9876543210"
              />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                {...register('email')}
                className="w-full bg-canvas border border-border-muted hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-2.5 text-text-main transition-colors"
                placeholder="e.g. info@irongym.com"
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message as string}</p>}
            </div>
          </div>

          {/* Gym Address */}
          <div>
            <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="address">Address (Optional)</label>
            <input
              id="address"
              type="text"
              {...register('address')}
              className="w-full bg-canvas border border-border-muted hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-2.5 text-text-main transition-colors"
              placeholder="e.g. 1st Cross, Indiranagar, Bengaluru"
            />
            {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address.message as string}</p>}
          </div>

          {/* Default Branch Name */}
          <div>
            <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="defaultBranchName">Default Branch Name</label>
            <input
              id="defaultBranchName"
              type="text"
              {...register('defaultBranchName')}
              className="w-full bg-canvas border border-border-muted hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-2.5 text-text-main transition-colors"
              placeholder="e.g. Main Branch"
            />
            {errors.defaultBranchName && <p className="text-xs text-red-500 mt-1">{errors.defaultBranchName.message as string}</p>}
          </div>

          {/* Receipt settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="receiptPrefix">Receipt Prefix</label>
              <input
                id="receiptPrefix"
                type="text"
                {...register('receiptPrefix')}
                className="w-full bg-canvas border border-border-muted hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-2.5 text-text-main transition-colors"
                placeholder="e.g. RCPT"
              />
              {errors.receiptPrefix && <p className="text-xs text-red-500 mt-1">{errors.receiptPrefix.message as string}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="optionalTaxRate">Default GST Rate (%)</label>
              <input
                id="optionalTaxRate"
                type="number"
                {...register('optionalTaxRate', { valueAsNumber: true })}
                className="w-full bg-canvas border border-border-muted hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-2.5 text-text-main transition-colors"
                placeholder="e.g. 18"
              />
              {errors.optionalTaxRate && <p className="text-xs text-red-500 mt-1">{errors.optionalTaxRate.message as string}</p>}
            </div>
          </div>

          {/* Setup Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark active:scale-[0.98] transition-all font-semibold py-3 px-4 rounded-xl text-white flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <PlusCircle className="h-5 w-5" />
                <span>Finish Setup & Initialize Workspace</span>
              </>
            )}
          </button>

          {/* Go Back / Logout option */}
          <button
            type="button"
            onClick={logout}
            className="w-full mt-3 bg-surface hover:bg-border-muted hover:text-text-main text-muted-gray hover:text-white transition-colors font-semibold py-2 px-4 rounded-xl text-xs cursor-pointer text-center"
          >
            Sign Out / Back to Login
          </button>
        </form>
      </div>
    </div>
  );
};
