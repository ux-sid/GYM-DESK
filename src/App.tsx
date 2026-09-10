import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { Login } from './features/auth/Login';
import { FirstRunSetup } from './features/auth/FirstRunSetup';
import { Dashboard } from './features/dashboard/Dashboard';
import { MembersList } from './features/members/MembersList';
import { MemberProfile } from './features/members/MemberProfile';
import { AddMemberWizard } from './features/members/AddMemberWizard';
import { PlansList } from './features/plans/PlansList';
import { PaymentsDues } from './features/payments/PaymentsDues';
import { Reports } from './features/reports/Reports';
import { StaffList } from './features/staff/StaffList';
import { Settings } from './features/settings/Settings';
import { SuperAdminDashboard } from './features/superadmin/SuperAdminDashboard';
import { OfflineBanner } from './components/OfflineBanner';
import { SUPER_ADMIN_EMAILS } from './utils/constants';
import { 
  Dumbbell, LayoutDashboard, Users, CreditCard, 
  Settings as SettingsIcon, LogOut, FileText, Menu, X, PlusCircle, Calendar, Sun, Moon, Shield
} from 'lucide-react';

const GymDeskApp: React.FC = () => {
  const { user, gym, loading, isEmailLookupLoading, isExistingUser, isMasterAdmin: isMasterAdminUser, logout, role } = useAuth();
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // If user is Master Admin and has no specific gym loaded yet, direct to superadmin portal
  useEffect(() => {
    if (isMasterAdminUser && !gym) {
      setActiveTab('superadmin');
    }
  }, [isMasterAdminUser, gym]);

  // Theme State
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const saved = localStorage.getItem('gymdesk-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  React.useEffect(() => {
    if (isDarkTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('gymdesk-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('gymdesk-theme', 'light');
    }
  }, [isDarkTheme]);
  const [isAddingMember, setIsAddingMember] = useState(false);
  
  // Mobile menu toggle
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 1. Loading state (Auth loading OR Email lookup loading)
  if (loading || isEmailLookupLoading) {
    return (
      <div className="min-h-screen bg-canvas flex justify-center items-center">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // 2. Unauthenticated state
  if (!user) {
    return <Login />;
  }

  // 3. New User state (ONLY when user is authenticated, email lookup completed, isExistingUser === false, and NOT master admin)
  if (!isMasterAdminUser && !isExistingUser && !gym) {
    return <FirstRunSetup />;
  }

  // 3. Workspace main app view

  const handleNavigate = (tab: string) => {
    setActiveTab(tab);
    setSelectedMemberId(null);
    setIsAddingMember(false);
    setMobileMenuOpen(false);
  };

  const handleSelectMember = (id: string) => {
    setSelectedMemberId(id);
    setIsAddingMember(false);
  };

  const handleAddMemberSuccess = (id: string) => {
    setIsAddingMember(false);
    setSelectedMemberId(id);
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Top Offline Connection Banner */}
      <OfflineBanner />

      <div className="flex-1 flex flex-col md:flex-row relative">
        
        {/* DESKTOP SIDEBAR NAV */}
        <aside className="hidden md:flex md:w-64 bg-surface border-r border-border-dark flex-col justify-between shrink-0 sticky top-0 h-screen p-6">
          <div className="space-y-8">
            {/* Logo/Wordmark */}
            <div>
              <div className="flex items-center gap-3">
                <div className="bg-primary text-white p-2 rounded-lg">
                  <Dumbbell className="h-5 w-5" />
                </div>
                <span className="font-extrabold tracking-tight text-text-main text-lg">Gym<span className="text-primary">Desk</span></span>
              </div>
              {gym && (
                <div className="mt-2 bg-surface-light px-3 py-1.5 rounded-lg border border-border-muted">
                  <p className="text-[10px] text-muted-gray uppercase font-semibold">Active Gym</p>
                  <p className="text-xs font-bold text-text-main truncate" title={gym.name}>{gym.name}</p>
                </div>
              )}
            </div>

            {/* Nav Tabs */}
            <nav className="space-y-1.5 flex flex-col">
              <button
                onClick={() => handleNavigate('dashboard')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'dashboard' && !selectedMemberId && !isAddingMember
                    ? 'bg-primary text-white font-bold shadow-md'
                    : 'text-muted-gray hover:text-text-main hover:bg-surface-light'
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => handleNavigate('members')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  (activeTab === 'members' || isAddingMember)
                    ? 'bg-primary text-white font-bold shadow-md'
                    : 'text-muted-gray hover:text-text-main hover:bg-surface-light'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>Members</span>
              </button>

              <button
                onClick={() => handleNavigate('ledger')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'ledger'
                    ? 'bg-primary text-white font-bold shadow-md'
                    : 'text-muted-gray hover:text-text-main hover:bg-surface-light'
                }`}
              >
                <CreditCard className="h-4 w-4" />
                <span>Ledger & Dues</span>
              </button>

              <button
                onClick={() => handleNavigate('plans')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'plans'
                    ? 'bg-primary text-white font-bold shadow-md'
                    : 'text-muted-gray hover:text-text-main hover:bg-surface-light'
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span>Gym Plans</span>
              </button>

              <button
                onClick={() => handleNavigate('reports')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'reports'
                    ? 'bg-primary text-white font-bold shadow-md'
                    : 'text-muted-gray hover:text-text-main hover:bg-surface-light'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Reports & Import</span>
              </button>

              <button
                onClick={() => handleNavigate('staff')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'staff'
                    ? 'bg-primary text-white font-bold shadow-md'
                    : 'text-muted-gray hover:text-text-main hover:bg-surface-light'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>Staff Panel</span>
              </button>

              <button
                onClick={() => handleNavigate('settings')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-primary text-white font-bold shadow-md'
                    : 'text-muted-gray hover:text-text-main hover:bg-surface-light'
                }`}
              >
                <SettingsIcon className="h-4 w-4" />
                <span>Settings</span>
              </button>

              {user?.email && SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase()) && (
                <button
                  onClick={() => handleNavigate('superadmin')}
                  className={`flex items-center gap-3 px-4 py-2.5 mt-4 rounded-xl text-xs font-semibold cursor-pointer transition-colors border ${
                    activeTab === 'superadmin'
                      ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 font-bold shadow-md'
                      : 'border-transparent text-red-400 hover:bg-red-50/50 dark:hover:bg-red-900/10'
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  <span>Master Admin</span>
                </button>
              )}
            </nav>
            
            {/* Theme Toggle */}
            <div className="mt-4 px-2">
              <button
                onClick={() => setIsDarkTheme(!isDarkTheme)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-surface-light border border-border-muted text-xs font-semibold text-muted-gray hover:text-text-main transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {isDarkTheme ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  <span>{isDarkTheme ? 'Dark Mode' : 'Light Mode'}</span>
                </div>
                <div className="w-8 h-4 bg-black/40 rounded-full relative shadow-inner">
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-primary transition-all duration-300 ${isDarkTheme ? 'right-0.5' : 'left-0.5'}`}></div>
                </div>
              </button>
            </div>
          </div>

          {/* User profile info & logout */}
          <div className="border-t border-border-dark pt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-canvas border border-border-muted rounded-full flex items-center justify-center font-bold text-xs text-primary shrink-0">
                {user.displayName?.charAt(0) || 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-text-main truncate m-0">{user.displayName || (isMasterAdminUser ? 'Master Admin' : 'Gym Owner')}</p>
                <p className="text-[9px] text-primary uppercase font-bold tracking-wider mt-0.5">{isMasterAdminUser ? 'MASTER ADMIN' : role}</p>
                <p className="text-[9px] text-muted-gray truncate mt-0.5" title={user.email || ''}>{user.email}</p>
              </div>
            </div>
            
            <button
              onClick={logout}
              className="w-full bg-surface-light hover:bg-border-muted hover:text-text-main text-text-main font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors border border-border-muted"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </aside>

        {/* MOBILE TOP BANNER */}
        <header className="md:hidden bg-surface border-b border-border-dark px-4 py-3 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-white p-1.5 rounded-md">
              <Dumbbell className="h-4 w-4" />
            </div>
            <span className="font-extrabold tracking-tight text-text-main text-base">Gym<span className="text-primary">Desk</span></span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] bg-neutral-850 px-2 py-0.5 rounded uppercase font-bold text-primary">{role}</span>
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1 text-text-main hover:text-primary transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {/* MOBILE OVERLAY MENU */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-[49px] bg-black/95 z-40 flex flex-col justify-between p-6 md:hidden">
            <nav className="space-y-3 text-sm font-semibold">
              <button onClick={() => handleNavigate('dashboard')} className="w-full text-left py-2 border-b border-border-dark text-text-main">Dashboard</button>
              <button onClick={() => handleNavigate('members')} className="w-full text-left py-2 border-b border-border-dark text-text-main">Members</button>
              <button onClick={() => handleNavigate('ledger')} className="w-full text-left py-2 border-b border-border-dark text-text-main">Ledger & Dues</button>
              <button onClick={() => handleNavigate('plans')} className="w-full text-left py-2 border-b border-border-dark text-text-main">Gym Plans</button>
              <button onClick={() => handleNavigate('reports')} className="w-full text-left py-2 border-b border-border-dark text-text-main">Reports & Import</button>
              <button onClick={() => handleNavigate('staff')} className="w-full text-left py-2 border-b border-border-dark text-text-main">Staff Panel</button>
              <button onClick={() => handleNavigate('settings')} className="w-full text-left py-2 border-b border-border-dark text-text-main">Settings</button>
              {user?.email && SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase()) && (
                <button onClick={() => handleNavigate('superadmin')} className="w-full text-left py-2 border-b border-red-900/30 text-red-500 font-bold flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Master Admin
                </button>
              )}
            </nav>

            <button
              onClick={logout}
              className="w-full bg-surface-light border border-border-muted text-text-main font-bold py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </button>
          </div>
        )}

        {/* MAIN BODY AREA */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-full pb-24 md:pb-8">
          
          {/* Active component router resolver */}
          {isAddingMember ? (
            <AddMemberWizard 
              onSuccess={handleAddMemberSuccess}
              onCancel={() => setIsAddingMember(false)}
            />
          ) : selectedMemberId ? (
            <MemberProfile 
              memberId={selectedMemberId}
              onBack={() => setSelectedMemberId(null)}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                gym ? (
                  <Dashboard 
                    onNavigate={handleNavigate}
                    onAddMember={() => setIsAddingMember(true)}
                  />
                ) : (
                  <SuperAdminDashboard onNavigate={handleNavigate} />
                )
              )}
              {activeTab === 'members' && (
                <MembersList 
                  onSelectMember={handleSelectMember}
                  onAddMember={() => setIsAddingMember(true)}
                />
              )}
              {activeTab === 'ledger' && <PaymentsDues onSelectMember={handleSelectMember} />}
              {activeTab === 'plans' && <PlansList />}
              {activeTab === 'reports' && <Reports />}
              {activeTab === 'staff' && <StaffList />}
              {activeTab === 'settings' && <Settings />}
              {activeTab === 'superadmin' && isMasterAdminUser && <SuperAdminDashboard onNavigate={handleNavigate} />}
            </>
          )}
        </main>

        {/* MOBILE BOTTOM NAVIGATION BAR */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border-dark py-2 px-6 flex justify-between items-center z-30 shadow-lg">
          <button 
            onClick={() => handleNavigate('dashboard')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'dashboard' && !selectedMemberId && !isAddingMember ? 'text-primary' : 'text-muted-gray'
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[9px] font-semibold">Home</span>
          </button>

          <button 
            onClick={() => handleNavigate('members')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              (activeTab === 'members' || selectedMemberId) && !isAddingMember ? 'text-primary' : 'text-muted-gray'
            }`}
          >
            <Users className="h-5 w-5" />
            <span className="text-[9px] font-semibold">Members</span>
          </button>

          {/* Central Add Member FAB */}
          <button 
            onClick={() => setIsAddingMember(true)}
            className="w-12 h-12 bg-primary hover:bg-primary-dark text-white rounded-full flex items-center justify-center shadow-lg -mt-6 border-4 border-canvas cursor-pointer active:scale-95 transition-all"
          >
            <PlusCircle className="h-6 w-6" />
          </button>

          <button 
            onClick={() => handleNavigate('ledger')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'ledger' ? 'text-primary' : 'text-muted-gray'
            }`}
          >
            <CreditCard className="h-5 w-5" />
            <span className="text-[9px] font-semibold">Ledger</span>
          </button>

          <button 
            onClick={() => handleNavigate('settings')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'settings' ? 'text-primary' : 'text-muted-gray'
            }`}
          >
            <SettingsIcon className="h-5 w-5" />
            <span className="text-[9px] font-semibold">Settings</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <GymDeskApp />
    </AuthProvider>
  );
};

export default App;
