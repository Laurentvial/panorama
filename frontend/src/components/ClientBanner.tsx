import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { useUser } from '../contexts/UserContext';

interface ClientBannerProps {
  topOffset?: number;
}

export function ClientBanner({ topOffset = 0 }: ClientBannerProps) {
  const { currentUser } = useUser();
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  // Check if banner was dismissed in this session
  useEffect(() => {
    if (currentUser?.id) {
      const dismissedKey = `client-banner-dismissed-${currentUser.id}`;
      const wasDismissed = sessionStorage.getItem(dismissedKey) === 'true';
      setDismissed(wasDismissed);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const el = bannerRef.current;
      if (!el) return;
      const height = el.getBoundingClientRect().height || 0;
      root.style.setProperty('--client-banner-height', `${height}px`);
    };

    if (!bannerRef.current || dismissed || !currentUser?.bannerMessage) {
      root.style.setProperty('--client-banner-height', '0px');
      return;
    }

    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      root.style.setProperty('--client-banner-height', '0px');
    };
  }, [dismissed, currentUser?.bannerMessage]);

  const handleDismiss = () => {
    if (currentUser?.id) {
      const dismissedKey = `client-banner-dismissed-${currentUser.id}`;
      sessionStorage.setItem(dismissedKey, 'true');
      setDismissed(true);
    }
  };

  // Don't show banner if no message, dismissed, or not a client user
  if (!currentUser?.bannerMessage || dismissed || !currentUser.bannerMessage.trim()) {
    return null;
  }

  return (
    <div
      ref={bannerRef}
      style={{
        position: 'fixed',
        top: topOffset,
        left: 0,
        right: 0,
        backgroundColor: '#fef3c7', // Light yellow/amber background
        borderBottom: '1px solid #fbbf24',
        padding: '12px 20px',
        boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
        zIndex: 1001, // Above cookie banner but below modals
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, minWidth: '200px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: '#92400e' }}>
            {currentUser.bannerMessage}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        style={{ 
          fontSize: '14px',
          color: '#92400e',
          minWidth: '32px',
          height: '32px',
        }}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
