import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { Dumbbell, ShieldAlert } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, authError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoadingGoogle(true);
    const timer = setTimeout(() => {
      setLoadingGoogle(false);
    }, 25000);
    try {
      await login();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was closed. Please click below to try again.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignored
      } else {
        setError(err.message || 'Failed to authenticate with Google.');
      }
    } finally {
      clearTimeout(timer);
      setLoadingGoogle(false);
    }
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

        {(error || authError) && (
          <div className="w-full bg-red-950/30 border border-red-500/50 p-3 rounded-lg mb-6 flex gap-2 items-center text-red-200 text-sm">
            <ShieldAlert className="h-5 w-5 text-red-500 shrink-0" />
            <span>{error || authError}</span>
          </div>
        )}

        {/* Continue with Google button */}
        <button
          onClick={handleLogin}
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

        {/* Local Offline Bypass for Testing */}
        <button
          onClick={useAuth().loginBypass}
          className="mt-4 w-full bg-surface-light border border-border-muted text-text-main hover:bg-neutral-800 active:scale-[0.98] transition-all font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 shadow-md cursor-pointer"
        >
          <span>Local Testing Bypass</span>
        </button>


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
