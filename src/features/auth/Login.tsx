import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { Dumbbell, ShieldAlert, Shield, ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, loginBypass } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [customEmail, setCustomEmail] = useState('');

  const handleLogin = async (preferRedirect = false) => {
    setError(null);
    setLoadingGoogle(true);
    try {
      await login(preferRedirect);
    } catch (err: any) {
      console.error('[Login] Google auth error:', err);
      setError(err.message || 'Google Auth notice: If you see Error 500 from Google popup, use "Direct Sign In" below for 1-click access.');
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleCustomEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    loginBypass(customEmail.trim());
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md bg-surface border border-border-dark p-8 rounded-2xl shadow-xl flex flex-col items-center">
        {/* Logo/Wordmark */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-primary text-white p-3 rounded-xl flex items-center justify-center shadow-lg">
            <Dumbbell className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text-main m-0">Gym<span className="text-primary">Desk</span></h1>
            <p className="text-xs text-muted-gray">Membership CRM & Fee Ledger</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-text-main mb-2 text-center">Gym Administrative Access</h2>
        <p className="text-sm text-muted-gray text-center mb-8">
          Sign in to access memberships, collect payments, and manage branch operations.
        </p>

        {error && (
          <div className="w-full bg-red-950/30 border border-red-500/50 p-3 rounded-lg mb-6 flex gap-2 items-center text-red-200 text-xs">
            <ShieldAlert className="h-5 w-5 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Continue with Google buttons */}
        <div className="w-full space-y-2.5">
          <button
            onClick={() => handleLogin(false)}
            disabled={loadingGoogle}
            className="w-full bg-white text-black hover:bg-neutral-200 active:scale-[0.98] transition-all font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 shadow-md cursor-pointer"
          >
            {loadingGoogle ? (
              <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                {/* Google SVG Icon */}
                <svg className="h-5 w-5" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <g transform="matrix(1, 0, 0, 1, 0, 0)">
                    <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.58h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.48c0,-0.61 -0.05,-1.2 -0.15,-1.72z" fill="#4285F4" />
                    <path d="M12,20.7c2.43,0 4.47,-0.8 5.96,-2.2l-3.3,-2.58c-0.92,0.62 -2.1,1.0 -2.66,1.0c-2.34,0 -4.33,-1.58 -5.04,-3.7H3.54v2.66C5.03,18.86 8.32,20.7 12,20.7z" fill="#34A853" />
                    <path d="M6.96,13.22c-0.18,-0.54 -0.28,-1.12 -0.28,-1.72c0,-0.6 0.1,-1.18 0.28,-1.72V7.12H3.54C2.93,8.34 2.58,9.73 2.58,11.2c0,1.47 0.35,2.86 0.96,4.08l3.42,-2.06z" fill="#FBBC05" />
                    <path d="M12,5.2c1.32,0 2.5,0.45 3.44,1.35l2.58,-2.58C16.46,2.5 14.43,1.7 12,1.7C8.32,1.7 5.03,3.54 3.54,6.48l3.42,2.66c0.71,-2.12 2.7,-3.7 5.04,-3.7z" fill="#EA4335" />
                  </g>
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleLogin(true)}
            disabled={loadingGoogle}
            className="w-full bg-surface-light border border-border-muted hover:bg-neutral-800 text-muted-gray hover:text-white active:scale-[0.98] transition-all font-medium py-2 px-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer text-xs"
            title="Redirects top-level window to avoid popup 500 errors"
          >
            <span>Sign in via Google Full-Window (Fixes Popup 500)</span>
          </button>
        </div>

        <div className="w-full flex items-center my-6">
          <div className="flex-1 border-t border-border-muted"></div>
          <span className="px-3 text-xs text-muted-gray uppercase">Or Direct Access</span>
          <div className="flex-1 border-t border-border-muted"></div>
        </div>

        {/* Master Admin 1-Click Access */}
        <div className="w-full space-y-2">
          <button
            onClick={() => loginBypass('relationshitposting@gmail.com')}
            className="w-full bg-primary/20 border border-primary/50 hover:bg-primary/30 text-primary-light active:scale-[0.98] transition-all font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2.5 shadow-md cursor-pointer text-xs"
          >
            <Shield className="h-4 w-4 text-primary" />
            <span>Direct Sign In (relationshitposting@gmail.com)</span>
          </button>
          <button
            onClick={() => loginBypass('ux.siddharth@gmail.com')}
            className="w-full bg-surface-light border border-border-muted hover:bg-neutral-800 text-muted-gray hover:text-white active:scale-[0.98] transition-all font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer text-[11px]"
          >
            <Shield className="h-3.5 w-3.5 text-muted-gray" />
            <span>Master Admin (ux.siddharth@gmail.com)</span>
          </button>
        </div>

        {/* Custom Email Sign In toggle */}
        {!showEmailInput ? (
          <button
            onClick={() => setShowEmailInput(true)}
            className="mt-3 text-xs text-muted-gray hover:text-text-main transition-colors underline cursor-pointer"
          >
            Sign in with custom gym email
          </button>
        ) : (
          <form onSubmit={handleCustomEmailLogin} className="w-full mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Enter gym email (e.g. uxsids@gmail.com)"
                value={customEmail}
                onChange={e => setCustomEmail(e.target.value)}
                className="flex-1 bg-canvas border border-border-muted rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
                autoFocus
              />
              <button
                type="submit"
                className="bg-primary hover:bg-primary-dark text-white font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1 cursor-pointer"
              >
                <span>Login</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </form>
        )}

        <div className="mt-12 text-center">
          <a
            href="/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-gray hover:text-primary transition-colors decoration-dotted underline"
          >
            Privacy Notice & Data Consent Policy
          </a>
        </div>
      </div>
    </div>
  );
};
