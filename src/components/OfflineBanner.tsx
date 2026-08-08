import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div className="bg-amber-950/30 border-b border-amber-500/40 px-4 py-1.5 flex justify-center items-center gap-2 text-amber-300 text-xs animate-pulse">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Working Offline. Financial operations will be queued as drafts.</span>
    </div>
  );
};
