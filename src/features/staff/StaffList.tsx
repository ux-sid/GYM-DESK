import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, inviteStaff } from '../../services/firebase';
import type { Staff, Invite } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

export const StaffList: React.FC = () => {
  const { gym, role, user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'owner' | 'manager' | 'staff' | 'viewer'>('staff');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!gym) return;

    const unsubStaff = onSnapshot(collection(db, 'gyms', gym.id, 'staff'), (snap) => {
      setStaff(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Staff)));
    });

    const unsubInvites = onSnapshot(collection(db, 'gyms', gym.id, 'invites'), (snap) => {
      setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite)));
      setLoading(false);
    });

    return () => {
      unsubStaff();
      unsubInvites();
    };
  }, [gym]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gym || !user || !email) return;
    setSubmitting(true);
    try {
      await inviteStaff(gym.id, email, inviteRole, user.uid, user.displayName || 'Owner');
      setEmail('');
      setShowInviteForm(false);
      alert('Invitation issued successfully!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to issue invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (targetUid: string, newRole: any) => {
    if (!gym || role !== 'owner') return;
    if (targetUid === user?.uid) {
      alert('You cannot change your own role.');
      return;
    }
    try {
      await updateDoc(doc(db, 'gyms', gym.id, 'staff', targetUid), {
        role: newRole,
      });
      alert('Staff role updated.');
    } catch (err) {
      console.error(err);
      alert('Failed to change staff role.');
    }
  };

  const handleRevoke = async (targetUid: string) => {
    if (!gym || role !== 'owner') return;
    if (targetUid === user?.uid) {
      alert('You cannot revoke your own workspace access.');
      return;
    }
    if (confirm('Are you sure you want to revoke this staff member\'s access to this gym?')) {
      try {
        await updateDoc(doc(db, 'gyms', gym.id, 'staff', targetUid), {
          status: 'revoked',
        });
        alert('Access revoked successfully.');
      } catch (err) {
        console.error(err);
        alert('Failed to revoke access.');
      }
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!gym || role !== 'owner') return;
    if (confirm('Cancel this pending invitation?')) {
      try {
        await deleteDoc(doc(db, 'gyms', gym.id, 'invites', inviteId));
        alert('Invitation cancelled.');
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-96">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-border-dark pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Staff Management</h1>
          <p className="text-sm text-muted-gray">Manage staff authorizations and pending invitations</p>
        </div>
        {role === 'owner' && !showInviteForm && (
          <button
            onClick={() => setShowInviteForm(true)}
            className="bg-primary hover:bg-primary-dark transition-all text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Plus className="h-4 w-4" />
            Invite Staff
          </button>
        )}
      </div>

      {/* Invite Form Panel */}
      {showInviteForm && (
        <form onSubmit={handleInvite} className="bg-surface border border-border-dark p-6 rounded-2xl space-y-4 shadow-lg max-w-xl">
          <h3 className="text-sm font-bold text-text-main mb-2">Invite Staff Member</h3>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">Google Account Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-canvas border border-border-muted px-3 py-2.5 rounded-xl text-text-main outline-none"
                placeholder="e.g. staff.member@gmail.com"
              />
              <span className="text-[9px] text-muted-gray mt-1 block">Staff must authenticate using this specific Google account.</span>
            </div>

            <div>
              <label className="block text-muted-gray mb-1.5 font-medium">Workspace Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as any)}
                className="w-full bg-canvas border border-border-muted px-3 py-2.5 rounded-xl text-text-main outline-none"
              >
                <option value="manager">Manager (Renew, record payments, manage plans)</option>
                <option value="staff">Staff (Onboard members, record payments)</option>
                <option value="viewer">Viewer (Read-only lookup, no sensitive details)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-dark mt-6">
            <button
              type="button"
              onClick={() => setShowInviteForm(false)}
              className="bg-canvas border border-border-muted text-text-main px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary hover:bg-primary-dark text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-md"
            >
              {submitting ? 'Sending...' : 'Issue Invitation'}
            </button>
          </div>
        </form>
      )}

      {/* Staff Ledger Roster */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Staff */}
        <div className="bg-surface border border-border-dark p-6 rounded-2xl shadow-md space-y-4">
          <h3 className="text-sm font-semibold text-text-main border-b border-border-dark pb-2 mb-2">Active Staff Members</h3>
          <div className="divide-y divide-border-dark">
            {staff.map((s) => (
              <div key={s.uid} className="py-3 flex justify-between items-center first:pt-0 last:pb-0 text-xs">
                <div>
                  <p className="font-semibold text-text-main text-sm">{s.fullName} {s.uid === user?.uid ? '(You)' : ''}</p>
                  <p className="text-muted-gray mt-0.5">{s.email}</p>
                  <p className="text-[10px] text-primary font-semibold uppercase mt-1">Status: {s.status}</p>
                </div>
                
                <div className="flex gap-2 items-center">
                  {role === 'owner' && s.uid !== user?.uid ? (
                    <>
                      <select
                        value={s.role}
                        onChange={(e) => handleRoleChange(s.uid, e.target.value)}
                        className="bg-canvas border border-border-muted rounded px-2 py-1 text-[10px] text-text-main outline-none"
                      >
                        <option value="owner">Owner</option>
                        <option value="manager">Manager</option>
                        <option value="staff">Staff</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      
                      {s.status === 'active' && (
                        <button
                          onClick={() => handleRevoke(s.uid)}
                          className="bg-red-950/20 border border-red-500/30 text-red-500 font-semibold px-2.5 py-1 rounded hover:bg-red-950/40 cursor-pointer text-[10px]"
                        >
                          Revoke
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="px-2 py-0.5 bg-neutral-850 rounded text-[9px] uppercase font-bold text-muted-gray border border-border-muted">
                      {s.role}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Invites */}
        <div className="bg-surface border border-border-dark p-6 rounded-2xl shadow-md space-y-4">
          <h3 className="text-sm font-semibold text-text-main border-b border-border-dark pb-2 mb-2">Pending Staff Invitations</h3>
          <div className="divide-y divide-border-dark">
            {invites.filter(i => i.status === 'pending').length === 0 ? (
              <p className="text-xs text-muted-gray py-4 text-center">No pending invitations.</p>
            ) : (
              invites.filter(i => i.status === 'pending').map((i) => (
                <div key={i.id} className="py-3 flex justify-between items-center first:pt-0 last:pb-0 text-xs">
                  <div>
                    <p className="font-semibold text-text-main text-sm">{i.email}</p>
                    <p className="text-muted-gray mt-0.5">Invited Role: <span className="uppercase text-primary font-semibold">{i.role}</span></p>
                  </div>
                  
                  {role === 'owner' && (
                    <button
                      onClick={() => handleCancelInvite(i.id)}
                      className="p-1.5 bg-canvas hover:bg-red-950/20 text-muted-gray hover:text-red-500 rounded-lg border border-border-muted cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
