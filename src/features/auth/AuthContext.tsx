import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logoutUser, offlineInitialized } from '../../services/firebase';
import type { Gym, Staff, UserRole } from '../../types';
import { SUPER_ADMIN_EMAILS } from '../../utils/constants';

interface AuthContextType {
  user: User | null;
  loading: boolean;
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
  const [gym, setGym] = useState<Gym | null>(null);
  const [staffRecord, setStaffRecord] = useState<Staff | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [gymsList, setGymsList] = useState<{ gymId: string; role: UserRole; name: string }[]>([]);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const login = async () => {
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
  };

  const loadGymWorkspace = async (gymId: string, currentUser: User) => {
    // 1. Fetch gym settings
    const gymSnap = await getDoc(doc(db, 'gyms', gymId));
    if (!gymSnap.exists()) return;
    const gymData = gymSnap.data() as Gym;
    setGym(gymData);

    // 2. Fetch staff role
    const staffSnap = await getDoc(doc(db, 'gyms', gymId, 'staff', currentUser.uid));
    if (staffSnap.exists()) {
      const sRecord = staffSnap.data() as Staff;
      setStaffRecord(sRecord);
      setRole(sRecord.role);
    } else if (currentUser.email && SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === currentUser.email?.toLowerCase())) {
      // Impersonation mode for Master Admin
      setStaffRecord({
        uid: currentUser.uid,
        fullName: currentUser.displayName || 'Master Admin',
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
  };

  const selectGym = async (gymId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      await loadGymWorkspace(gymId, user);
      // Update lastGymId on user profile
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { lastGymId: gymId });
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
            const userRef = doc(db, 'users', mockUser.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
              const userData = userSnap.data();
              if (userData.gyms) {
                const list = Object.entries(userData.gyms).map(([id, info]: any) => ({
                  gymId: id,
                  role: info.role as UserRole,
                  name: info.name
                }));
                setGymsList(list);
              }

              const targetGymId = userData.lastGymId || (userData.gyms ? Object.keys(userData.gyms)[0] : null);
              if (targetGymId) {
                await loadGymWorkspace(targetGymId, mockUser);
              }
            }
          } catch (err) {
            console.warn('Failed to load local offline profile:', err);
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
        });
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // Fetch user doc
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const userData = userSnap.data();
            // Load user's gyms map
            if (userData.gyms) {
              const list = Object.entries(userData.gyms).map(([id, info]: any) => ({
                gymId: id,
                role: info.role as UserRole,
                name: info.name
              }));
              setGymsList(list);
            }

            const targetGymId = userData.lastGymId || (userData.gyms ? Object.keys(userData.gyms)[0] : null);
            if (targetGymId) {
              await loadGymWorkspace(targetGymId, currentUser);
            }
          }
        } catch (err) {
          console.error('Failed to load user profile details:', err);
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
