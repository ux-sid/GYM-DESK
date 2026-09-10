import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Plan, Membership } from '../../types';
import { formatINR } from '../../utils/financeUtils';
import { Plus, Edit2 } from 'lucide-react';

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

export const PlansList: React.FC = () => {
  const { gym, role } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationValue, setDurationValue] = useState(1);
  const [durationUnit, setDurationUnit] = useState<'days' | 'months' | 'years'>('months');
  const [standardPrice, setStandardPrice] = useState(1000);
  const [joiningFee, setJoiningFee] = useState(0);
  const [billingFrequency, setBillingFrequency] = useState<'upfront' | 'monthly'>('upfront');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gym) {
      setLoading(false);
      return;
    }

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 4000);

    const unsubPlans = onSnapshot(
      collection(db, 'gyms', gym.id, 'plans'), 
      (snap) => {
        setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan)));
      },
      (err) => {
        console.warn('PlansList plans snapshot error:', err);
      }
    );

    const unsubMemberships = onSnapshot(
      collection(db, 'gyms', gym.id, 'memberships'), 
      (snap) => {
        clearTimeout(safetyTimer);
        setMemberships(snap.docs.map(d => ({ id: d.id, ...d.data() } as Membership)));
        setLoading(false);
      },
      (err) => {
        clearTimeout(safetyTimer);
        console.warn('PlansList memberships snapshot error:', err);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      unsubPlans();
      unsubMemberships();
    };
  }, [gym]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gym) return;

    const payload = {
      name,
      description: description || undefined,
      durationValue: Number(durationValue),
      durationUnit,
      standardPrice: Number(standardPrice),
      joiningFee: Number(joiningFee),
      billingFrequency,
      active,
      branchIds: [gym.defaultBranchId || 'main-branch'],
      updatedAt: new Date(),
    };

    setError(null);
    try {
      if (editPlanId) {
        updateDoc(doc(db, 'gyms', gym.id, 'plans', editPlanId), cleanUndefined(payload));
      } else {
        addDoc(collection(db, 'gyms', gym.id, 'plans'), cleanUndefined({
          ...payload,
          createdAt: new Date(),
        }));
      }
      resetForm();
    } catch (err: any) {
      console.error('Failed to save plan:', err);
      setError(err.message || 'Failed to save plan.');
    }
  };

  const startEdit = (plan: Plan) => {
    setEditPlanId(plan.id);
    setName(plan.name);
    setDescription(plan.description || '');
    setDurationValue(plan.durationValue);
    setDurationUnit(plan.durationUnit);
    setStandardPrice(plan.standardPrice);
    setJoiningFee(plan.joiningFee);
    setBillingFrequency(plan.billingFrequency);
    setActive(plan.active);
    setShowAddForm(true);
  };

  const handleDeactivate = async (plan: Plan) => {
    if (!gym) return;
    try {
      await updateDoc(doc(db, 'gyms', gym.id, 'plans', plan.id), {
        active: !plan.active,
        updatedAt: new Date(),
      });
    } catch (err) {
      console.error('Failed to change plan state:', err);
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditPlanId(null);
    setName('');
    setDescription('');
    setDurationValue(1);
    setDurationUnit('months');
    setStandardPrice(1000);
    setJoiningFee(0);
    setBillingFrequency('upfront');
    setActive(true);
    setError(null);
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
          <h1 className="text-2xl font-bold tracking-tight text-text-main m-0">Gym Plans</h1>
          <p className="text-sm text-muted-gray">Manage reusable membership packages</p>
        </div>
        {role !== 'viewer' && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-primary hover:bg-primary-dark transition-all text-white font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Plus className="h-4 w-4" />
            Create Plan
          </button>
        )}
      </div>

      {/* Form Panel */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-border-dark p-6 rounded-2xl space-y-4 shadow-lg max-w-xl">
          <h3 className="text-sm font-bold text-text-main mb-2">{editPlanId ? 'Edit Package' : 'Create Package'}</h3>

          {error && (
            <div className="w-full bg-red-950/30 border border-red-500/50 p-3 rounded-lg flex items-center gap-2 text-red-200 text-xs">
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-muted-gray mb-1">Plan Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                placeholder="e.g. Monthly General"
              />
            </div>

            <div>
              <label className="block text-muted-gray mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-gray mb-1">Duration Value *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={durationValue}
                  onChange={e => setDurationValue(parseInt(e.target.value) || 1)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                />
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Duration Unit *</label>
                <select
                  value={durationUnit}
                  onChange={e => setDurationUnit(e.target.value as any)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2.5 rounded-xl text-text-main outline-none"
                >
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-gray mb-1">Standard Price (₹) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={standardPrice}
                  onChange={e => setStandardPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                />
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Joining Fee (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={joiningFee}
                  onChange={e => setJoiningFee(parseFloat(e.target.value) || 0)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2 rounded-xl text-text-main outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-muted-gray mb-1">Billing Frequency</label>
                <select
                  value={billingFrequency}
                  onChange={e => setBillingFrequency(e.target.value as any)}
                  className="w-full bg-canvas border border-border-muted px-3 py-2.5 rounded-xl text-text-main outline-none"
                >
                  <option value="upfront">Upfront Payment</option>
                  <option value="monthly">Monthly Subscription</option>
                </select>
              </div>

              <div>
                <label className="block text-muted-gray mb-1">Status</label>
                <select
                  value={active ? 'true' : 'false'}
                  onChange={e => setActive(e.target.value === 'true')}
                  className="w-full bg-canvas border border-border-muted px-3 py-2.5 rounded-xl text-text-main outline-none"
                >
                  <option value="true">Active Package</option>
                  <option value="false">Deactivated</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-dark mt-6">
            <button
              type="button"
              onClick={resetForm}
              className="bg-canvas border border-border-muted text-text-main px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-primary hover:bg-primary-dark text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-md"
            >
              Save Plan Settings
            </button>
          </div>
        </form>
      )}

      {/* Grid of Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((p) => {
          // Count members currently using this plan
          const activeSubscribers = memberships.filter(
            m => m.planId === p.id && m.baseStatus === 'active'
          ).length;

          return (
            <div key={p.id} className="bg-surface border border-border-dark p-6 rounded-2xl flex flex-col justify-between shadow-md">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="text-base font-bold text-text-main m-0">{p.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[8px] uppercase font-bold ${
                    p.active ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-neutral-800 text-muted-gray border border-border-muted'
                  }`}>
                    {p.active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                
                <p className="text-xs text-muted-gray">{p.description || 'No custom description provided.'}</p>
                
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-dark text-xs text-muted-gray">
                  <div>
                    <span className="block text-[10px]">Price</span>
                    <span className="text-text-main font-bold text-sm">{formatINR(p.standardPrice, false)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px]">Joining Fee</span>
                    <span className="text-text-main font-semibold">{formatINR(p.joiningFee, false)}</span>
                  </div>
                  <div className="mt-1">
                    <span className="block text-[10px]">Duration</span>
                    <span className="text-text-main font-semibold">{p.durationValue} {p.durationUnit}</span>
                  </div>
                  <div className="mt-1">
                    <span className="block text-[10px]">Billing Setup</span>
                    <span className="text-text-main font-semibold uppercase">{p.billingFrequency}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-border-dark pt-4 mt-6">
                <span className="text-[10px] text-primary font-semibold">{activeSubscribers} Active Subscriber(s)</span>
                
                {role !== 'viewer' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeactivate(p)}
                      className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-canvas border border-border-muted text-text-main hover:border-primary cursor-pointer transition-colors"
                    >
                      {p.active ? 'Disable' : 'Enable'}
                    </button>
                    
                    <button
                      onClick={() => startEdit(p)}
                      className="p-1.5 rounded-lg bg-surface-light border border-border-muted hover:border-primary text-text-main cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
