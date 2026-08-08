import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { doc, updateDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Member } from '../../types';
import { Laptop, AlertTriangle, Database } from 'lucide-react';
import { seedDemoData } from '../../utils/mockData';

export const Settings: React.FC = () => {
  const { gym, role } = useAuth();
  
  // Gym Profile State
  const [gymName, setGymName] = useState('');
  const [gymPhone, setGymPhone] = useState('');
  const [gymEmail, setGymEmail] = useState('');
  const [gymAddress, setGymAddress] = useState('');
  const [gymGSTIN, setGymGSTIN] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(18);

  // Reminders templates
  const [feeDueEnglish, setFeeDueEnglish] = useState('');
  const [feeDueHindi, setFeeDueHindi] = useState('');
  const [expiryEnglish, setExpiryEnglish] = useState('');
  const [expiryHindi, setExpiryHindi] = useState('');

  // Trusted Device State
  const [isTrusted, setIsTrusted] = useState(localStorage.getItem('gymdesk_trusted_device') === 'true');

  // Archived Members list
  const [archivedMembers, setArchivedMembers] = useState<Member[]>([]);

  const [saving, setSaving] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'reminders' | 'device' | 'archive' | 'demo'>('profile');

  useEffect(() => {
    if (!gym) return;
    setGymName(gym.name);
    setGymPhone(gym.phone);
    setGymEmail(gym.email);
    setGymAddress(gym.address || '');
    setGymGSTIN(gym.optionalGSTIN || '');
    setTaxEnabled(gym.taxEnabled || false);
    setTaxRate(gym.optionalTaxRate || 18);

    setFeeDueEnglish(gym.reminderTemplates?.feeDueEnglish || '');
    setFeeDueHindi(gym.reminderTemplates?.feeDueHindi || '');
    setExpiryEnglish(gym.reminderTemplates?.expiryEnglish || '');
    setExpiryHindi(gym.reminderTemplates?.expiryHindi || '');

    // Query archived members
    const unsub = onSnapshot(collection(db, 'gyms', gym.id, 'members'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Member))
        .filter(m => m.recordStatus === 'archived');
      setArchivedMembers(list);
    });

    return () => unsub();
  }, [gym]);

  const handleSaveGymProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gym || role !== 'owner') return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'gyms', gym.id), {
        name: gymName,
        phone: gymPhone,
        email: gymEmail,
        address: gymAddress,
        optionalGSTIN: gymGSTIN || null,
        taxEnabled,
        optionalTaxRate: Number(taxRate),
        updatedAt: new Date(),
      });
      alert('Gym profile updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to update gym profile settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gym || role !== 'owner') return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'gyms', gym.id), {
        reminderTemplates: {
          feeDueEnglish,
          feeDueHindi,
          expiryEnglish,
          expiryHindi,
        },
        updatedAt: new Date(),
      });
      alert('Reminder templates updated!');
    } catch (err) {
      console.error(err);
      alert('Failed to update templates.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTrustedDevice = () => {
    const nextVal = !isTrusted;
    setIsTrusted(nextVal);
    localStorage.setItem('gymdesk_trusted_device', nextVal ? 'true' : 'false');
    alert(`Device configuration updated! Please reload the page to initialize Firestore ${nextVal ? 'persistent offline cache' : 'memory cache'}.`);
  };

  const handleSeedDemoData = async () => {
    if (!gym || role !== 'owner') {
      alert("Only owners can seed demo data.");
      return;
    }
    if (!confirm('This will insert 15+ demo records (plans, members, payments) into your database. Continue?')) return;
    
    setSaving(true);
    try {
      const actorName = 'System Demo';
      // Fallback actorUid in case user is not available
      await seedDemoData(gym.id, 'demo_user', actorName);
      alert('Demo data seeded successfully!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to seed demo data.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="border-b border-border-dark pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">System Settings</h1>
        <p className="text-sm text-muted-gray">Configure gym workspace rules, reminders and offline states</p>
      </div>

      {/* Nav Row */}
      <div className="flex border-b border-border-dark overflow-x-auto gap-2">
        <button
          onClick={() => setActiveSubTab('profile')}
          className={`px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer ${
            activeSubTab === 'profile' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          Gym Profile
        </button>
        <button
          onClick={() => setActiveSubTab('reminders')}
          className={`px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer ${
            activeSubTab === 'reminders' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          WhatsApp Templates
        </button>
        <button
          onClick={() => setActiveSubTab('device')}
          className={`px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer ${
            activeSubTab === 'device' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          Offline & Device
        </button>
        <button
          onClick={() => setActiveSubTab('archive')}
          className={`px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer ${
            activeSubTab === 'archive' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          Archived Members ({archivedMembers.length})
        </button>
        <button
          onClick={() => setActiveSubTab('demo')}
          className={`px-4 py-2 text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === 'demo' ? 'text-primary border-b-2 border-primary font-bold' : 'text-muted-gray hover:text-text-main'
          }`}
        >
          <Database className="h-4 w-4" />
          Demo Data
        </button>
      </div>

      {/* SUBTABS */}

      {/* 1. Profile settings */}
      {activeSubTab === 'profile' && (
        <form onSubmit={handleSaveGymProfile} className="bg-surface border border-border-dark p-6 rounded-2xl max-w-xl space-y-4 shadow-md">
          <h3 className="text-sm font-semibold text-text-main mb-2">Gym Workspace Settings</h3>
          
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">Gym Name *</label>
              <input
                type="text"
                required
                disabled={role !== 'owner'}
                value={gymName}
                onChange={e => setGymName(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-gray mb-1.5 font-medium">Phone Number *</label>
                <input
                  type="text"
                  required
                  disabled={role !== 'owner'}
                  value={gymPhone}
                  onChange={e => setGymPhone(e.target.value)}
                  className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
                />
              </div>

              <div>
                <label className="block text-muted-gray mb-1.5 font-medium">Email Address *</label>
                <input
                  type="email"
                  required
                  disabled={role !== 'owner'}
                  value={gymEmail}
                  onChange={e => setGymEmail(e.target.value)}
                  className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">Address</label>
              <input
                type="text"
                disabled={role !== 'owner'}
                value={gymAddress}
                onChange={e => setGymAddress(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
              />
            </div>

            <div className="border-t border-border-dark pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-text-main">Enable GST Taxation</p>
                  <p className="text-[10px] text-muted-gray">Applies taxation rates on new plan memberships</p>
                </div>
                <input
                  type="checkbox"
                  disabled={role !== 'owner'}
                  checked={taxEnabled}
                  onChange={e => setTaxEnabled(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </div>

              {taxEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-muted-gray mb-1.5 font-medium">GSTIN (15-character ID) *</label>
                    <input
                      type="text"
                      required
                      disabled={role !== 'owner'}
                      value={gymGSTIN}
                      onChange={e => setGymGSTIN(e.target.value.toUpperCase())}
                      className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
                      placeholder="e.g. 29GGGGG1234F1Z5"
                    />
                  </div>

                  <div>
                    <label className="block text-muted-gray mb-1.5 font-medium">GST Rate (%) *</label>
                    <input
                      type="number"
                      required
                      disabled={role !== 'owner'}
                      value={taxRate}
                      onChange={e => setTaxRate(parseFloat(e.target.value) || 18)}
                      className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {role === 'owner' && (
            <div className="flex justify-end pt-4 border-t border-border-dark">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary hover:bg-primary-dark text-white font-semibold py-2 px-4 rounded-xl text-xs cursor-pointer shadow-md"
              >
                {saving ? 'Saving...' : 'Save Gym Profile'}
              </button>
            </div>
          )}
        </form>
      )}

      {/* 2. Reminders */}
      {activeSubTab === 'reminders' && (
        <form onSubmit={handleSaveTemplates} className="bg-surface border border-border-dark p-6 rounded-2xl max-w-xl space-y-4 shadow-md">
          <h3 className="text-sm font-semibold text-text-main mb-2">WhatsApp Templates</h3>
          <p className="text-[10px] text-muted-gray">
            Configure English and Hindi message structures. Use tokens to embed data: `{'{member_name}'}`, `{'{amount}'}`, `{'{due_date}'}`, `{'{gym_name}'}`, `{'{gym_phone}'}`.
          </p>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">English Fee Due Template</label>
              <textarea
                rows={3}
                disabled={role !== 'owner'}
                value={feeDueEnglish}
                onChange={e => setFeeDueEnglish(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
              />
            </div>

            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">Hindi Fee Due Template</label>
              <textarea
                rows={3}
                disabled={role !== 'owner'}
                value={feeDueHindi}
                onChange={e => setFeeDueHindi(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
              />
            </div>

            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">English Membership Expired Template</label>
              <textarea
                rows={3}
                disabled={role !== 'owner'}
                value={expiryEnglish}
                onChange={e => setExpiryEnglish(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
              />
            </div>

            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">Hindi Membership Expired Template</label>
              <textarea
                rows={3}
                disabled={role !== 'owner'}
                value={expiryHindi}
                onChange={e => setExpiryHindi(e.target.value)}
                className="w-full bg-canvas border border-border-muted rounded-xl px-3 py-2 text-text-main outline-none"
              />
            </div>
          </div>

          {role === 'owner' && (
            <div className="flex justify-end pt-4 border-t border-border-dark">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary hover:bg-primary-dark text-white font-semibold py-2 px-4 rounded-xl text-xs cursor-pointer shadow-md"
              >
                {saving ? 'Saving...' : 'Save Templates'}
              </button>
            </div>
          )}
        </form>
      )}

      {/* 3. Offline & Device Settings */}
      {activeSubTab === 'device' && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl max-w-xl space-y-6 shadow-md">
          <div className="flex gap-4 items-start">
            <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl">
              <Laptop className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-main m-0">Trusted Device Settings</h3>
              <p className="text-xs text-muted-gray mt-1">Configure offline client caching limits based on device access conditions.</p>
            </div>
          </div>

          <div className="border-t border-border-dark pt-4 space-y-4 text-xs">
            <div className="flex items-center justify-between bg-canvas p-4 rounded-xl border border-border-muted">
              <div>
                <p className="font-semibold text-text-main">This is a trusted personal device</p>
                <p className="text-[10px] text-muted-gray mt-0.5">Enables persistent caching. Member info is kept indexed on this browser.</p>
              </div>
              <input
                type="checkbox"
                checked={isTrusted}
                onChange={toggleTrustedDevice}
                className="w-5 h-5 accent-primary cursor-pointer"
              />
            </div>

            <div className="bg-amber-950/20 border border-amber-500/25 p-3 rounded-lg text-amber-300 flex gap-2 items-start text-[10px]">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <span>
                <strong>Warning:</strong> Never enable persistent offline caching on shared cyber-cafe or shared gym staff tablets. Enabling caching downloads local copies of memberships and logs which may present information leakage hazards if left unchecked.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Archived Members */}
      {activeSubTab === 'archive' && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl shadow-md space-y-4">
          <h3 className="text-sm font-semibold text-text-main">Archived Member Records (Soft Deleted)</h3>
          <p className="text-xs text-muted-gray">
            Archive records are hidden from standard lists but financial histories are kept available for auditing/owner access.
          </p>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-dark text-muted-gray font-semibold bg-canvas/30">
                  <th className="p-3">Code</th>
                  <th className="p-3">Member Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Join Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {archivedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-gray">No archived members found.</td>
                  </tr>
                ) : (
                  archivedMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-light">
                      <td className="p-3 font-mono">{m.memberCode}</td>
                      <td className="p-3 font-semibold text-text-main">{m.fullName}</td>
                      <td className="p-3">{m.phone}</td>
                      <td className="p-3">{m.joinDate}</td>
                      <td className="p-3 text-right gap-1.5 flex justify-end">
                        <button
                          onClick={async () => {
                            if (confirm('Restore member profile?')) {
                              await updateDoc(doc(db, 'gyms', gym!.id, 'members', m.id), {
                                recordStatus: 'current',
                                archivedAt: null,
                                archivedBy: null
                              });
                            }
                          }}
                          className="bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-500/20 px-2.5 py-1 rounded-lg hover:bg-emerald-900 cursor-pointer"
                        >
                          Restore
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
      {/* 5. Demo Data */}
      {activeSubTab === 'demo' && (
        <div className="bg-surface border border-border-dark p-6 rounded-2xl max-w-xl space-y-4 shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-main m-0">Developer & Demo Tools</h3>
              <p className="text-xs text-muted-gray mt-1">Populate your workspace with mock data to test features.</p>
            </div>
          </div>
          
          <div className="border-t border-border-dark pt-4 space-y-4 text-xs">
            <div className="bg-neutral-850 p-4 rounded-xl border border-border-muted space-y-3">
              <p className="text-text-main text-sm font-medium">Seed Demo Data</p>
              <p className="text-muted-gray leading-relaxed">
                Clicking the button below will instantly generate realistic demo records in your database, including:
              </p>
              <ul className="list-disc list-inside text-muted-gray ml-2 space-y-1">
                <li>3 subscription plans (Monthly, Quarterly, Annual)</li>
                <li>4 mock members with varied statuses (Active, Expired, Overdue)</li>
                <li>Automatically generated memberships and dues</li>
                <li>Corresponding audit logs and counter updates</li>
              </ul>
              
              <div className="pt-2">
                <button
                  onClick={handleSeedDemoData}
                  disabled={saving || role !== 'owner'}
                  className="w-full sm:w-auto bg-primary hover:bg-primary-dark text-white font-bold py-2.5 px-6 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Seeding Data...' : 'Seed 15+ Demo Records Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
