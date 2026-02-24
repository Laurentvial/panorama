import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { useUser } from '../contexts/UserContext';

interface ClientBannerProps {
  topOffset?: number;
  variant?: 'fixed' | 'inline';
}

export function ClientBanner({ topOffset = 0, variant = 'fixed' }: ClientBannerProps) {
  const { currentUser } = useUser();
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const isInline = variant === 'inline';
  const dismissedKey = currentUser?.id
    ? `client-banner-${isInline ? 'inline-' : ''}dismissed-${currentUser.id}`
    : null;

  // Check if banner was dismissed in this session
  useEffect(() => {
    if (dismissedKey) {
      const wasDismissed = sessionStorage.getItem(dismissedKey) === 'true';
      setDismissed(wasDismissed);
    }
  }, [dismissedKey]);

  useEffect(() => {
    if (isInline) return; // Inline variant does not set --client-banner-height
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
  }, [dismissed, currentUser?.bannerMessage, isInline]);

  const handleDismiss = () => {
    if (dismissedKey) {
      sessionStorage.setItem(dismissedKey, 'true');
      setDismissed(true);
    }
  };

  // Don't show banner if no message, dismissed, or not a client user
  if (!currentUser?.bannerMessage || dismissed || !currentUser.bannerMessage.trim()) {
    return null;
  }

  const baseStyle: React.CSSProperties = {
    backgroundColor: '#fef3c7', // Light yellow/amber background
    borderBottom: '1px solid #fbbf24',
    padding: '12px 20px',
    boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    flexWrap: 'wrap',
  };

  const positionStyle: React.CSSProperties = isInline
    ? { position: 'relative', borderRadius: '10px', marginBottom: '16px' }
    : {
        position: 'fixed',
        top: topOffset,
        left: 0,
        right: 0,
        zIndex: 1001, // Above cookie banner but below modals
      };

  return (
    <div
      ref={bannerRef}
      style={{ ...baseStyle, ...positionStyle }}
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
