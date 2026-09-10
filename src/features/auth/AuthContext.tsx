import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, getDocs, query, where, enableNetwork } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logoutUser, offlineInitialized } from '../../services/firebase';
import type { Gym, Staff, UserRole } from '../../types';
import { MASTER_ADMIN_EMAIL, normalizeEmail, isMasterAdmin } from '../../utils/constants';

// Known gym workspace definitions for fallback recovery
const KNOWN_GYMS: Record<string, Partial<Gym>> = {
  'uVRMtHa6ETYi6RQ7Dqla': {
    id: 'uVRMtHa6ETYi6RQ7Dqla',
    name: 'Fit X Gym',
    phone: '',
    email: 'shreeomkumawat276@gmail.com',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    locale: 'en-IN',
    defaultBranchId: 'main-branch',
    receiptPrefix: 'RCPT',
    taxEnabled: false,
    privacyNoticeVersion: '1.0',
    createdBy: 'r0F3lLglfFRk8HSGHFE0MMrjNCq2',
  },
  'iM9vuuBEGnuFguoNXyzw': {
    id: 'iM9vuuBEGnuFguoNXyzw',
    name: 'RELATIONSHIT POST',
    phone: '',
    email: 'relationshitposting@gmail.com',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    locale: 'en-IN',
    defaultBranchId: 'main-branch',
    receiptPrefix: 'RCPT',
    taxEnabled: false,
    privacyNoticeVersion: '1.0',
    createdBy: 'IFf1m9xlQSOlpOz8uhWBOr2khuF3',
  },
  'gZepq404iaBIyPzcnBJ1': {
    id: 'gZepq404iaBIyPzcnBJ1',
    name: 'TEST GYM',
    phone: '',
    email: 'test@gymdesk.in',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    locale: 'en-IN',
    defaultBranchId: 'main-branch',
    receiptPrefix: 'RCPT',
    taxEnabled: false,
    privacyNoticeVersion: '1.0',
    createdBy: 'mock-tester-uid',
  }
};

// Known email to gymId mappings
const KNOWN_EMAIL_TO_GYM: Record<string, string> = {
  'shreeomkumawat276@gmail.com': 'uVRMtHa6ETYi6RQ7Dqla',
  'relationshitposting@gmail.com': 'iM9vuuBEGnuFguoNXyzw',
  'ux.siddharth@gmail.com': 'uVRMtHa6ETYi6RQ7Dqla'
};

export function createDefaultGym(id: string, name: string, email: string, ownerUid: string): Gym {
  const known = KNOWN_GYMS[id];
  return {
    id,
    name: known?.name || name || 'Fit X Gym',
    phone: known?.phone || '',
    email: known?.email || email || '',
    timezone: known?.timezone || 'Asia/Kolkata',
    currency: known?.currency || 'INR',
    locale: known?.locale || 'en-IN',
    defaultBranchId: known?.defaultBranchId || 'main-branch',
    receiptPrefix: known?.receiptPrefix || 'RCPT',
    taxEnabled: false,
    privacyNoticeVersion: '1.0',
    reminderTemplates: {
      feeDueEnglish: 'Dear member, your fee is due.',
      feeDueHindi: 'Priya sadasya, aapki fees baki hai.',
      expiryEnglish: 'Dear member, your membership is expiring soon.',
      expiryHindi: 'Priya sadasya, aapki membership jald samapt ho rahi hai.'
    },
    retentionSettings: {
      archivedRetentionDays: 365,
      enableRetentionReminders: true
    },
    createdBy: known?.createdBy || ownerUid,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isEmailLookupLoading: boolean;
  isExistingUser: boolean;
  isMasterAdmin: boolean;
  authError: string | null;
  gym: Gym | null;
  staffRecord: Staff | null;
  role: UserRole | null;
  gymsList: { gymId: string; role: UserRole; name: string }[];
  selectGym: (gymId: string) => Promise<void>;
  login: () => Promise<void>;
  loginBypass: () => Promise<void>;
  logout: () => Promise<void>;
  refreshGymData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmailLookupLoading, setIsEmailLookupLoading] = useState(false);
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [staffRecord, setStaffRecord] = useState<Staff | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [gymsList, setGymsList] = useState<{ gymId: string; role: UserRole; name: string }[]>([]);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const userIsMasterAdmin = isMasterAdmin(user?.email);

  const login = async () => {
    setAuthError(null);
    localStorage.removeItem('gymdesk_mock_user');
    localStorage.removeItem('gymdesk_offline_mode');
    try {
      await enableNetwork(db);
    } catch {
      // already enabled
    }
    await signInWithGoogle(isMobile);
  };

  const loginBypass = async () => {
    localStorage.setItem('gymdesk_offline_mode', 'true');
    localStorage.setItem('gymdesk_trusted_device', 'true');
    const mockUser = {
      uid: 'mock-tester-uid',
      email: 'tester@gymdesk.in',
      displayName: 'Local Tester',
      photoURL: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48',
      emailVerified: true,
      isAnonymous: false,
    } as unknown as User;

    localStorage.setItem('gymdesk_mock_user', JSON.stringify(mockUser));
    window.location.reload();
  };

  const logout = async () => {
    localStorage.removeItem('gymdesk_mock_user');
    localStorage.removeItem('gymdesk_offline_mode');
    await logoutUser();
    setUser(null);
    setGym(null);
    setStaffRecord(null);
    setRole(null);
    setGymsList([]);
    setIsExistingUser(false);
    setIsEmailLookupLoading(false);
  };

  const loadGymWorkspace = async (gymId: string, currentUser: User): Promise<Gym | null> => {
    try {
      let gymData: Gym | null = null;
      try {
        const gymSnap = await getDoc(doc(db, 'gyms', gymId));
        if (gymSnap.exists()) {
          gymData = { id: gymSnap.id, ...gymSnap.data() } as Gym;
        }
      } catch (err) {
        console.warn(`Direct fetch of gym doc ${gymId} failed, using fallback:`, err);
      }

      if (!gymData) {
        // Fallback to known gym definition
        const known = KNOWN_GYMS[gymId];
        if (known) {
          gymData = createDefaultGym(gymId, known.name || '', known.email || '', known.createdBy || currentUser.uid);
        }
      }

      if (!gymData) return null;

      setGym(gymData);

      // Check staff role
      const isSuper = isMasterAdmin(currentUser.email);
      if (isSuper) {
        setStaffRecord({
          uid: currentUser.uid,
          fullName: currentUser.displayName || 'Master Admin',
          email: currentUser.email || MASTER_ADMIN_EMAIL,
          role: 'owner',
          joinedAt: new Date(),
          status: 'active'
        });
        setRole('owner');
      } else {
        try {
          const staffSnap = await getDoc(doc(db, 'gyms', gymId, 'staff', currentUser.uid));
          if (staffSnap.exists()) {
            const sRecord = staffSnap.data() as Staff;
            setStaffRecord(sRecord);
            setRole(sRecord.role);
          } else {
            // Check if user is the creator or matches gym email
            if (gymData.createdBy === currentUser.uid || (gymData.email && normalizeEmail(gymData.email) === normalizeEmail(currentUser.email))) {
              setStaffRecord({
                uid: currentUser.uid,
                fullName: currentUser.displayName || 'Gym Owner',
                email: currentUser.email || '',
                role: 'owner',
                joinedAt: new Date(),
                status: 'active'
              });
              setRole('owner');
            } else {
              setStaffRecord(null);
              setRole(null);
            }
          }
        } catch {
          // Default to owner for creator
          setStaffRecord({
            uid: currentUser.uid,
            fullName: currentUser.displayName || 'Gym Owner',
            email: currentUser.email || '',
            role: 'owner',
            joinedAt: new Date(),
            status: 'active'
          });
          setRole('owner');
        }
      }

      return gymData;
    } catch (err) {
      console.error('Error loading gym workspace:', err);
      return null;
    }
  };

  const selectGym = async (gymId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      await loadGymWorkspace(gymId, user);
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { lastGymId: gymId });
      } catch {
        // ignore update failure if rule blocks
      }
    } catch (e) {
      console.error('Error selecting gym:', e);
    } finally {
      setLoading(false);
    }
  };

  const refreshGymData = async () => {
    if (gym && user) {
      await loadGymWorkspace(gym.id, user);
    }
  };

  useEffect(() => {
    // 1. Check if mock user was saved
    const savedMockUserStr = localStorage.getItem('gymdesk_mock_user');
    if (savedMockUserStr) {
      try {
        const mockUser = JSON.parse(savedMockUserStr) as User;
        if (!mockUser || !mockUser.uid) {
          localStorage.removeItem('gymdesk_mock_user');
          localStorage.removeItem('gymdesk_offline_mode');
          window.location.reload();
          return;
        }
        setUser(mockUser);
        
        const loadMockWorkspace = async () => {
          try {
            await offlineInitialized;
            const targetGymId = 'uVRMtHa6ETYi6RQ7Dqla';
            await loadGymWorkspace(targetGymId, mockUser);
            setIsExistingUser(true);
          } catch (err) {
            console.warn('Failed to load local offline profile:', err);
          } finally {
            setLoading(false);
            setIsEmailLookupLoading(false);
          }
        };

        loadMockWorkspace();
        return;
      } catch (err) {
        console.error('Failed to parse saved mock user:', err);
      }
    }

    // Handle redirect results for mobile devices
    if (isMobile) {
      getRedirectResult(auth)
        .then((result) => {
          if (result?.user) {
            setUser(result.user);
          }
        })
        .catch((error) => {
          console.error('Redirect sign-in error:', error);
          setAuthError(error.message || 'Mobile redirect sign-in failed');
        });
    }

    // Safety timeout to prevent infinite spinner
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('Auth loading safety timeout triggered after 6 seconds.');
          return false;
        }
        return false;
      });
      setIsEmailLookupLoading(false);
    }, 6000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (!currentUser) {
        setGym(null);
        setStaffRecord(null);
        setRole(null);
        setGymsList([]);
        setIsExistingUser(false);
        setIsEmailLookupLoading(false);
        clearTimeout(safetyTimer);
        return;
      }

      setIsEmailLookupLoading(true);
      const normalizedEmail = normalizeEmail(currentUser.email);

      // --- STRICT MASTER ADMIN CHECK ---
      if (isMasterAdmin(normalizedEmail)) {
        setIsExistingUser(true);
        setRole('owner');
        // If master admin had a target gym, pre-load it, otherwise ready for portal
        const targetGymId = 'uVRMtHa6ETYi6RQ7Dqla';
        await loadGymWorkspace(targetGymId, currentUser);
        setIsEmailLookupLoading(false);
        clearTimeout(safetyTimer);
        return;
      }

      // --- REGULAR USER ACCOUNT RESOLUTION VIA GMAIL ---
      try {
        let resolvedGymId: string | null = null;

        // Step 1: Check known email mappings
        if (KNOWN_EMAIL_TO_GYM[normalizedEmail]) {
          resolvedGymId = KNOWN_EMAIL_TO_GYM[normalizedEmail];
        }

        // Step 2: Check users collection by UID
        if (!resolvedGymId) {
          try {
            const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
            if (userSnap.exists()) {
              const uData = userSnap.data();
              if (uData.lastGymId) resolvedGymId = uData.lastGymId;
              else if (uData.gyms && Object.keys(uData.gyms).length > 0) {
                resolvedGymId = Object.keys(uData.gyms)[0];
              }
            }
          } catch (err) {
            console.warn('User doc lookup by UID failed:', err);
          }
        }

        // Step 3: Query users collection by email
        if (!resolvedGymId) {
          try {
            const q = query(collection(db, 'users'), where('email', '==', normalizedEmail));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const uData = snap.docs[0].data();
              if (uData.lastGymId) resolvedGymId = uData.lastGymId;
              else if (uData.gyms && Object.keys(uData.gyms).length > 0) {
                resolvedGymId = Object.keys(uData.gyms)[0];
              }
            }
          } catch (err) {
            console.warn('User query by email failed:', err);
          }
        }

        // Step 4: Check localStorage cache for this email
        if (!resolvedGymId) {
          const cachedGymId = localStorage.getItem(`gymdesk_gym_${normalizedEmail}`);
          if (cachedGymId) resolvedGymId = cachedGymId;
        }

        // --- OUTCOME ---
        if (resolvedGymId) {
          const loadedGym = await loadGymWorkspace(resolvedGymId, currentUser);
          if (loadedGym) {
            setIsExistingUser(true);
            localStorage.setItem(`gymdesk_gym_${normalizedEmail}`, resolvedGymId);
          } else {
            setIsExistingUser(false);
          }
        } else {
          // No gym exists anywhere for this email
          setIsExistingUser(false);
        }
      } catch (err: any) {
        console.error('Account lookup error:', err);
        setAuthError(err.message || 'Failed to lookup account');
      } finally {
        setIsEmailLookupLoading(false);
        clearTimeout(safetyTimer);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isEmailLookupLoading,
      isExistingUser,
      isMasterAdmin: userIsMasterAdmin,
      authError,
      gym,
      staffRecord,
      role,
      gymsList,
      selectGym,
      login,
      loginBypass,
      logout,
      refreshGymData
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
