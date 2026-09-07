import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logoutUser, offlineInitialized } from '../../services/firebase';
import type { Gym, Staff, UserRole } from '../../types';
import { SUPER_ADMIN_EMAILS } from '../../utils/constants';
import { seedDemoData } from '../../utils/mockData';

export const SHARED_GYM_ID = 'gym_main_workspace';


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

    localStorage.setItem('gymdesk_last_gym_id', SHARED_GYM_ID);
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
      // Unify all user accounts onto the exact same gym workspace so data is never split or lost
      const targetGymName = 'GymDesk Elite Fitness';

      // Check candidate gyms where previous data might have been saved
      const previousGymId = localStorage.getItem('gymdesk_last_gym_id');
      const candidateGyms = [
        previousGymId,
        'gym_relationshitposting_gmail_com',
        'gym_ux_siddharth_gmail_com',
      ].filter((id): id is string => Boolean(id) && id !== SHARED_GYM_ID);

      // Check if SHARED_GYM_ID already has members
      let hasMembers = false;
      try {
        const primaryMembersSnap = await getDocs(collection(db, 'gyms', SHARED_GYM_ID, 'members'));
        if (!primaryMembersSnap.empty) {
          hasMembers = true;
        }
      } catch (e) {
        console.warn('[Auth] Primary check notice:', e);
      }

      // If SHARED_GYM_ID is empty, check if candidate gyms have members to migrate over
      if (!hasMembers) {
        for (const candId of candidateGyms) {
          try {
            const candMembers = await getDocs(collection(db, 'gyms', candId, 'members'));
            if (!candMembers.empty) {
              console.log(`[Auth] Migrating ${candMembers.size} members from ${candId} to ${SHARED_GYM_ID}...`);
              const batch = writeBatch(db);
              candMembers.docs.forEach(d => {
                batch.set(doc(db, 'gyms', SHARED_GYM_ID, 'members', d.id), d.data(), { merge: true });
              });
              for (const sub of ['memberships', 'dues', 'payments', 'plans']) {
                try {
                  const subSnap = await getDocs(collection(db, 'gyms', candId, sub));
                  subSnap.docs.forEach(d => {
                    batch.set(doc(db, 'gyms', SHARED_GYM_ID, sub, d.id), d.data(), { merge: true });
                  });
                } catch {
                  // Ignore
                }
              }
              await batch.commit();
              hasMembers = true;
              break;
            }
          } catch (candErr) {
            console.warn('[Auth] Candidate migration notice for', candId, candErr);
          }
        }
      }

      // If still empty, seed the full demo members and plans
      if (!hasMembers) {
        try {
          await seedDemoData(SHARED_GYM_ID, currentUser.uid, currentUser.displayName || 'Gym Owner');
          console.log('[Auth] Initialized members, plans & dues for workspace:', SHARED_GYM_ID);
        } catch (seedErr) {
          console.warn('[Auth] Seed demo data notice:', seedErr);
        }
      }

      // Persist workspace to user doc and localStorage
      localStorage.setItem('gymdesk_last_gym_id', SHARED_GYM_ID);
      setGymsList([{
        gymId: SHARED_GYM_ID,
        role: 'owner',
        name: targetGymName
      }]);

      try {
        await setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          email: currentUser.email || '',
          lastGymId: SHARED_GYM_ID,
          gyms: {
            [SHARED_GYM_ID]: {
              role: 'owner',
              name: targetGymName
            }
          }
        }, { merge: true });
      } catch (e) {
        // Ignore
      }

      await loadGymWorkspace(SHARED_GYM_ID, currentUser);
    } catch (err) {
      console.error('[Auth] findAndLoadGymForUser error:', err);
      // Resilient fallback
      await loadGymWorkspace(SHARED_GYM_ID, currentUser);
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
