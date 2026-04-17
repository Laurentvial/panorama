import React, { useRef, useEffect } from 'react';
import { Megaphone, X } from 'lucide-react';
import { Button } from './ui/button';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';

interface ClientBannerProps {
  topOffset?: number;
  variant?: 'fixed' | 'inline';
}

export function ClientBanner({ topOffset = 0, variant = 'fixed' }: ClientBannerProps) {
  const { currentUser } = useUser();
  const { settings } = useTheme();
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

  const brandStripe =
    (settings?.secondary_color || settings?.accent_color || '').trim() || '#ea580c';

  const baseStyle: React.CSSProperties = {
    background: 'linear-gradient(105deg, #fffbeb 0%, #ffedd5 42%, #fef3c7 100%)',
    borderBottom: '1px solid rgba(245, 158, 11, 0.38)',
    boxShadow:
      '0 10px 28px -12px rgba(180, 83, 9, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.75)',
    padding: isInline ? '14px 18px' : '14px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderLeft: `4px solid ${brandStripe}`,
    boxSizing: 'border-box',
  };

  const positionStyle: React.CSSProperties = isInline
    ? { borderRadius: '12px', marginBottom: '16px' }
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          width: '100%',
          maxWidth: 'min(960px, 100%)',
          paddingLeft: 48,
          paddingRight: 48,
          boxSizing: 'border-box',
        }}
      >
        <div
          aria-hidden
          style={{
            flexShrink: 0,
            width: 42,
            height: 42,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(150deg, #f97316 0%, #ea580c 55%, #c2410c 100%)',
            boxShadow: '0 4px 14px rgba(234, 88, 12, 0.45)',
          }}
        >
          <Megaphone size={22} color="#ffffff" strokeWidth={2.25} />
        </div>
        <div style={{ minWidth: 0, textAlign: 'center' }}>
          <p
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 600,
              lineHeight: 1.45,
              letterSpacing: '-0.01em',
              color: '#451a03',
              textAlign: 'center',
            }}
          >
            {currentUser.bannerMessage}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '14px',
          color: '#78350f',
          minWidth: '40px',
          height: '40px',
          borderRadius: 9999,
          zIndex: 2,
        }}
      >
        <X className="w-5 h-5" strokeWidth={2} />
      </Button>
    </div>
  );
}
