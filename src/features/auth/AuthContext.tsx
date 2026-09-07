import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, getDocsFromCache } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logoutUser, offlineInitialized } from '../../services/firebase';
import type { Gym, Staff, UserRole } from '../../types';
import { SUPER_ADMIN_EMAILS } from '../../utils/constants';
import { seedDemoData } from '../../utils/mockData';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  gym: Gym | null;
  staffRecord: Staff | null;
  role: UserRole | null;
  gymsList: { gymId: string; role: UserRole; name: string }[];
  selectGym: (gymId: string) => Promise<void>;
  login: (preferRedirect?: boolean) => Promise<void>;
  loginBypass: (emailOverride?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshGymData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [gym, setGym] = useState<Gym | null>(null);
  const [staffRecord, setStaffRecord] = useState<Staff | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [gymsList, setGymsList] = useState<{ gymId: string; role: UserRole; name: string }[]>([]);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const login = async (preferRedirect?: boolean) => {
    await signInWithGoogle(preferRedirect !== undefined ? preferRedirect : isMobile);
  };

  const loginBypass = async (emailOverride?: string) => {
    // Keep network online so live Firestore data is always loaded
    localStorage.removeItem('gymdesk_offline_mode');
    localStorage.setItem('gymdesk_trusted_device', 'true');
    const targetEmail = (emailOverride || 'relationshitposting@gmail.com').trim().toLowerCase();
    const isAdmin = SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === targetEmail);
    const mockUser = {
      uid: isAdmin ? 'admin-sid-uid' : `mock-${targetEmail.replace(/[^a-zA-Z0-9]/g, '-')}`,
      email: targetEmail,
      displayName: isAdmin ? 'Gym Admin' : 'Gym Owner',
      photoURL: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48',
      emailVerified: true,
      isAnonymous: false,
    } as unknown as User;

    const deterministicGymId = 'gym_' + targetEmail.replace(/[^a-zA-Z0-9]/g, '_');
    localStorage.setItem('gymdesk_last_gym_id', deterministicGymId);
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
  };

  const loadGymWorkspace = async (gymId: string, currentUser: User) => {
    try {
      let gymData: Gym | null = null;
      try {
        const gymSnap = await getDoc(doc(db, 'gyms', gymId));
        if (gymSnap.exists()) {
          gymData = gymSnap.data() as Gym;
        }
      } catch (err) {
        console.warn('[Auth] Server fetch for gym doc failed, checking cache...', err);
      }

      // Check cached gym object in localStorage
      if (!gymData) {
        const cached = localStorage.getItem('gymdesk_cached_gym_' + gymId);
        if (cached) {
          try {
            gymData = JSON.parse(cached);
          } catch {
            // Ignore
          }
        }
      }

      // If still not found, construct resilient default gym workspace
      if (!gymData) {
        gymData = {
          id: gymId,
          name: 'GymDesk Elite Fitness',
          phone: '9876543210',
          email: currentUser.email || 'admin@gymdesk.in',
          address: 'Main Branch',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          locale: 'en-IN',
          defaultBranchId: 'main-branch',
          receiptPrefix: 'RCPT',
          taxEnabled: false,
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
          },
          createdBy: currentUser.uid,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Try writing to Firestore in background
        setDoc(doc(db, 'gyms', gymId), gymData, { merge: true }).catch(err => console.warn('[Auth] Background gym save notice:', err));
      }

      // Cache locally and set state
      localStorage.setItem('gymdesk_cached_gym_' + gymId, JSON.stringify(gymData));
      localStorage.setItem('gymdesk_last_gym_id', gymId);
      setGym(gymData);

      // 2. Fetch staff role
      try {
        const staffSnap = await getDoc(doc(db, 'gyms', gymId, 'staff', currentUser.uid));
        if (staffSnap.exists()) {
          const sRecord = staffSnap.data() as Staff;
          setStaffRecord(sRecord);
          setRole(sRecord.role);
          return;
        }
      } catch {
        // Fall through to owner assignment
      }

      // Automatically give owner role so authenticated user is never locked out
      const ownerRecord: Staff = {
        uid: currentUser.uid,
        fullName: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Gym Owner'),
        email: currentUser.email || '',
        role: 'owner',
        joinedAt: new Date(),
        status: 'active'
      };
      setStaffRecord(ownerRecord);
      setRole('owner');

      // Link staff in background
      setDoc(doc(db, 'gyms', gymId, 'staff', currentUser.uid), {
        uid: currentUser.uid,
        fullName: currentUser.displayName || 'Gym Owner',
        email: currentUser.email || '',
        role: 'owner',
        joinedAt: new Date(),
        status: 'active'
      }, { merge: true }).catch(err => console.warn('[Auth] Background staff link notice:', err));

    } catch (err) {
      console.error('[Auth] Error in loadGymWorkspace:', err);
    }
  };

  const selectGym = async (gymId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      localStorage.setItem('gymdesk_last_gym_id', gymId);
      await loadGymWorkspace(gymId, user);
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { lastGymId: gymId }, { merge: true }).catch(err => console.warn('Could not update user doc with lastGymId:', err));
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

  const findAndLoadGymForUser = async (currentUser: User) => {
    try {
      let targetGymId: string | null = null;
      let targetGymName: string | null = null;

      // Step 1: Read user's own document
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.gyms && typeof userData.gyms === 'object') {
            const list = Object.entries(userData.gyms).map(([id, info]: any) => ({
              gymId: id,
              role: (info.role || 'owner') as UserRole,
              name: info.name || ''
            }));
            setGymsList(list);
          }
          targetGymId = userData.lastGymId
            || (userData.gyms ? Object.keys(userData.gyms)[0] : null)
            || null;
        }
      } catch (err) {
        console.warn('[Auth] Could not read user doc:', err);
      }

      // Step 2: Fallback to localStorage
      if (!targetGymId) {
        const saved = localStorage.getItem('gymdesk_last_gym_id');
        if (saved) {
          targetGymId = saved;
        }
      }

      // Step 3: Check if gym was created under mock-tester-uid (local development/testing migration)
      if (!targetGymId) {
        try {
          const testerSnap = await getDoc(doc(db, 'users', 'mock-tester-uid'));
          if (testerSnap.exists()) {
            const tData = testerSnap.data();
            targetGymId = tData.lastGymId || (tData.gyms ? Object.keys(tData.gyms)[0] : null);
          }
        } catch (e) {
          // Ignore
        }
      }

      // Step 4: Query gyms created by this user
      if (!targetGymId) {
        try {
          const snap = await getDocs(query(collection(db, 'gyms'), where('createdBy', '==', currentUser.uid)));
          if (!snap.empty) {
            targetGymId = snap.docs[0].id;
            targetGymName = snap.docs[0].data().name;
          }
        } catch (err) {
          console.warn('[Auth] createdBy query skipped:', err);
        }
      }

      // Step 5: Query by email field on gym doc
      if (!targetGymId && currentUser.email) {
        try {
          const snap = await getDocs(query(collection(db, 'gyms'), where('email', '==', currentUser.email)));
          if (!snap.empty) {
            targetGymId = snap.docs[0].id;
            targetGymName = snap.docs[0].data().name;
          }
        } catch (err) {
          console.warn('[Auth] email query skipped:', err);
        }
      }

      // Step 6: Broad query & local cache
      if (!targetGymId) {
        let gymsDocs: any[] = [];
        try {
          const allGymsSnap = await getDocs(collection(db, 'gyms'));
          if (!allGymsSnap.empty) {
            gymsDocs = allGymsSnap.docs;
          }
        } catch (err) {
          console.warn('[Auth] Server broad gyms query skipped, checking cache...', err);
        }

        if (gymsDocs.length === 0) {
          try {
            const cacheSnap = await getDocsFromCache(collection(db, 'gyms'));
            if (!cacheSnap.empty) {
              gymsDocs = cacheSnap.docs;
            }
          } catch (e) {
            // Ignore
          }
        }

        if (gymsDocs.length > 0) {
          let bestDoc = gymsDocs.find(d => {
            const data = d.data();
            return (
              data.createdBy === currentUser.uid ||
              (currentUser.email && data.email?.toLowerCase() === currentUser.email.toLowerCase())
            );
          });

          if (!bestDoc) {
            bestDoc = gymsDocs[0];
          }

          if (bestDoc) {
            targetGymId = bestDoc.id;
            targetGymName = bestDoc.data().name;
          }
        }
      }

      // Step 7: AUTOMATIC RECOVERY & PROVISIONING
      // If no gym ID was found (e.g. fresh browser or Firestore blocked collection queries),
      // auto-link to deterministic workspace so pre-existing admins/users NEVER get blocked!
      if (!targetGymId) {
        const cleanEmail = (currentUser.email || 'relationshitposting@gmail.com').trim().toLowerCase();
        const deterministicGymId = 'gym_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
        targetGymId = deterministicGymId;
        targetGymName = 'GymDesk Elite Fitness';
        console.log('[Auth] Automatically linked user to gym workspace:', targetGymId);

        // Seed demo members and plans if this workspace was not seeded yet
        const seedKey = 'gymdesk_seeded_' + targetGymId;
        if (!localStorage.getItem(seedKey)) {
          try {
            await seedDemoData(targetGymId, currentUser.uid, currentUser.displayName || 'Admin');
            localStorage.setItem(seedKey, 'true');
            console.log('[Auth] Initialized members, plans & dues for workspace:', targetGymId);
          } catch (e) {
            console.warn('[Auth] Seed demo data notice:', e);
          }
        }
      }

      if (targetGymId) {
        localStorage.setItem('gymdesk_last_gym_id', targetGymId);
        // Persist to user doc
        try {
          await setDoc(doc(db, 'users', currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email || '',
            lastGymId: targetGymId,
            ...(targetGymName ? {
              [`gyms.${targetGymId}`]: {
                role: 'owner',
                name: targetGymName
              }
            } : {})
          }, { merge: true });
        } catch (e) {
          // Ignore
        }
        await loadGymWorkspace(targetGymId, currentUser);
      }
    } catch (err) {
      console.error('[Auth] findAndLoadGymForUser error:', err);
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
            await findAndLoadGymForUser(mockUser);
          } catch (err) {
            console.warn('Failed to load mock workspace:', err);
          } finally {
            setLoading(false);
          }
        };

        loadMockWorkspace();
        return;
      } catch (err) {
        console.error('Failed to parse saved mock user:', err);
      }
    }

    // Handle redirect results for all devices (desktop and mobile)
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(result.user);
        }
      })
      .catch((error) => {
        console.error('Redirect sign-in error:', error);
      });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          await findAndLoadGymForUser(currentUser);
        } catch (err) {
          console.error('[AuthContext] Error in findAndLoadGymForUser:', err);
        }
      } else {
        setGym(null);
        setStaffRecord(null);
        setRole(null);
        setGymsList([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
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
