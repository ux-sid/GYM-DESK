import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from './AuthContext';
import { createGymWorkspace } from '../../services/firebase';
import { gymSetupSchema } from '../../validation/schemas';
import { Dumbbell, PlusCircle, ShieldAlert } from 'lucide-react';

export const FirstRunSetup: React.FC = () => {
  const { user, selectGym, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const onSubmit = async (data: any) => {
    if (!user || !user.uid) {
      setError('Your session is missing user details. Please sign out and click bypass login again.');
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
          defaultBranchId: 'main-branch', // placeholder matching setup
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
      
      // Select the gym to update state
      await selectGym(gymId);
      window.location.reload(); // Refresh to boot full app layout
    } catch (err: any) {
      setError(err.message || 'Failed to setup gym workspace.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas py-12 px-4 flex flex-col justify-center items-center">
      <div className="w-full max-w-xl bg-surface border border-border-dark p-8 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-primary text-white p-2.5 rounded-lg">
            <Dumbbell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main m-0">Setup Gym Workspace</h1>
            <p className="text-xs text-muted-gray">Create your gym CRM workspace</p>
          </div>
        </div>

        <p className="text-sm text-muted-gray mb-8">
          Welcome! You are the first user to set up GymDesk. Please fill in your gym details to configure the currency, receipting system, and default branch settings.
        </p>

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
