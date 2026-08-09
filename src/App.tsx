import React, { useState } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { Login } from './features/auth/Login';
import { FirstRunSetup } from './features/auth/FirstRunSetup';
// Lazy loaded components for code splitting
const Dashboard = React.lazy(() => import('./features/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const MembersList = React.lazy(() => import('./features/members/MembersList').then(m => ({ default: m.MembersList })));
const MemberProfile = React.lazy(() => import('./features/members/MemberProfile').then(m => ({ default: m.MemberProfile })));
const AddMemberWizard = React.lazy(() => import('./features/members/AddMemberWizard').then(m => ({ default: m.AddMemberWizard })));
const PlansList = React.lazy(() => import('./features/plans/PlansList').then(m => ({ default: m.PlansList })));
const PaymentsDues = React.lazy(() => import('./features/payments/PaymentsDues').then(m => ({ default: m.PaymentsDues })));
const Reports = React.lazy(() => import('./features/reports/Reports').then(m => ({ default: m.Reports })));
const StaffList = React.lazy(() => import('./features/staff/StaffList').then(m => ({ default: m.StaffList })));
const Settings = React.lazy(() => import('./features/settings/Settings').then(m => ({ default: m.Settings })));
const SuperAdminDashboard = React.lazy(() => import('./features/superadmin/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
import { OfflineBanner } from './components/OfflineBanner';
import { SUPER_ADMIN_EMAILS } from './utils/constants';
import { 
  Dumbbell, LayoutDashboard, Users, CreditCard, 
  Settings as SettingsIcon, LogOut, FileText, Menu, X, PlusCircle, Calendar, Sun, Moon, Shield
} from 'lucide-react';

const GymDeskApp: React.FC = () => {
  const { user, gym, loading, logout, role } = useAuth();
  
  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['dashboard']));
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex justify-center items-center">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // 1. Unauthenticated state
  if (!user) {
    return <Login />;
  }

  // 2. Gym workspace setup state (First run)
  if (!gym) {
    return <FirstRunSetup />;
  }

  // 3. Workspace main app view

  const handleNavigate = (tab: string) => {
    setActiveTab(tab);
    setVisitedTabs(prev => new Set(prev).add(tab));
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
            <div className="flex items-center gap-3">
              <div className="bg-primary text-white p-2 rounded-lg">
                <Dumbbell className="h-5 w-5" />
              </div>
              <span className="font-extrabold tracking-tight text-text-main text-lg">Gym<span className="text-primary">Desk</span></span>
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
                  (activeTab === 'members' || selectedMemberId || isAddingMember)
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
                <p className="text-xs font-bold text-text-main truncate m-0">{user.displayName || 'Gym Owner'}</p>
                <p className="text-[9px] text-primary uppercase font-bold tracking-wider mt-0.5">{role}</p>
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
          
          {/* Active component router resolver with Suspense and State Retention */}
          <React.Suspense fallback={
            <div className="flex-1 flex justify-center items-center h-full min-h-[50vh]">
              <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          }>
            <div className={isAddingMember ? 'block' : 'hidden'}>
              {isAddingMember && (
                <AddMemberWizard 
                  onSuccess={handleAddMemberSuccess}
                  onCancel={() => setIsAddingMember(false)}
                />
              )}
            </div>

            <div className={(!isAddingMember && selectedMemberId) ? 'block' : 'hidden'}>
              {selectedMemberId && (
                <MemberProfile 
                  memberId={selectedMemberId}
                  onBack={() => setSelectedMemberId(null)}
                />
              )}
            </div>

            <div className={(!isAddingMember && !selectedMemberId) ? 'block' : 'hidden'}>
              {visitedTabs.has('dashboard') && (
                <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
                  <Dashboard 
                    onNavigate={handleNavigate}
                    onAddMember={() => setIsAddingMember(true)}
                  />
                </div>
              )}
              
              {visitedTabs.has('members') && (
                <div className={activeTab === 'members' ? 'block' : 'hidden'}>
                  <MembersList 
                    onSelectMember={handleSelectMember}
                    onAddMember={() => setIsAddingMember(true)}
                  />
                </div>
              )}
              
              {visitedTabs.has('ledger') && (
                <div className={activeTab === 'ledger' ? 'block' : 'hidden'}>
                  <PaymentsDues />
                </div>
              )}
              
              {visitedTabs.has('plans') && (
                <div className={activeTab === 'plans' ? 'block' : 'hidden'}>
                  <PlansList />
                </div>
              )}
              
              {visitedTabs.has('reports') && (
                <div className={activeTab === 'reports' ? 'block' : 'hidden'}>
                  <Reports />
                </div>
              )}
              
              {visitedTabs.has('staff') && (
                <div className={activeTab === 'staff' ? 'block' : 'hidden'}>
                  <StaffList />
                </div>
              )}
              
              {visitedTabs.has('settings') && (
                <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
                  <Settings />
                </div>
              )}
              
              {visitedTabs.has('superadmin') && user?.email && SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === user.email?.toLowerCase()) && (
                <div className={activeTab === 'superadmin' ? 'block' : 'hidden'}>
                  <SuperAdminDashboard onNavigate={handleNavigate} />
                </div>
              )}
            </div>
          </React.Suspense>
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
