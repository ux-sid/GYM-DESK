import React, { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../services/firebase';

interface MemberPhotoProps {
  path?: string;
  fallbackLetter: string;
  className?: string;
  onClick?: (url: string | null) => void;
}

export const MemberPhoto: React.FC<MemberPhotoProps> = ({ 
  path, 
  fallbackLetter, 
  className = "w-full h-full object-cover",
  onClick
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setResolvedUrl(null);
      return;
    }
    
    // If it's a Base64 data URL, local blob, or normal HTTP URL, use it directly
    if (
      path.startsWith('data:') || 
      path.startsWith('http:') || 
      path.startsWith('https:') || 
      path.startsWith('blob:')
    ) {
      setResolvedUrl(path);
      return;
    }

    // Otherwise, attempt to load from Firebase Storage
    let active = true;
    getDownloadURL(ref(storage, path))
      .then((url) => {
        if (active) setResolvedUrl(url);
      })
      .catch((err) => {
        console.warn('Failed to load storage photo path:', path, err);
      });

    return () => {
      active = false;
    };
  }, [path]);

  if (resolvedUrl) {
    return (
      <img 
        src={resolvedUrl} 
        alt="Profile" 
        className={className} 
        onError={() => setResolvedUrl(null)} 
        onClick={(e) => { e.stopPropagation(); onClick && onClick(resolvedUrl); }}
      />
    );
  }

  return (
    <div 
      className={`w-full h-full bg-primary/10 flex items-center justify-center font-bold text-primary ${onClick ? 'cursor-pointer' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick && onClick(null); }}
    >
      {fallbackLetter}
    </div>
  );
};
