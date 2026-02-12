import React, { useRef, useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useIsMobile } from './ui/use-mobile';
import { Cookie } from 'lucide-react';

interface CookieBannerProps {
  bottomOffset?: number;
}

export function CookieBanner({ bottomOffset = 0 }: CookieBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    // Check if user has already made a choice
    const cookieConsent = localStorage.getItem('cookieConsent');
    if (!cookieConsent) {
      // Show banner after a short delay
      setTimeout(() => {
        setShowBanner(true);
      }, 1000);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const el = bannerRef.current;
      if (!el) return;
      const height = el.getBoundingClientRect().height || 0;
      root.style.setProperty('--cookie-banner-height', `${height}px`);
    };

    if (!showBanner) {
      root.style.setProperty('--cookie-banner-height', '0px');
      return;
    }

    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      root.style.setProperty('--cookie-banner-height', '0px');
    };
  }, [showBanner, bottomOffset]);

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'accepted');
    localStorage.setItem('cookieConsentDate', new Date().toISOString());
    setShowBanner(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', 'declined');
    localStorage.setItem('cookieConsentDate', new Date().toISOString());
    setShowBanner(false);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-label="Préférences de cookies"
      style={{
        position: 'fixed',
        bottom: bottomOffset + (isMobile ? 10 : 16),
        left: 0,
        right: 0,
        paddingLeft: isMobile ? 12 : 20,
        paddingRight: isMobile ? 12 : 20,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          background: 'rgba(255, 255, 255, 0.92)',
          border: '1px solid rgba(229, 231, 235, 1)',
          borderRadius: 16,
          boxShadow: '0 18px 50px rgba(2, 6, 23, 0.14)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: isMobile ? 14 : 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            justifyContent: 'space-between',
            gap: isMobile ? 12 : 18,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  background: 'rgba(2, 6, 23, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Cookie size={16} color="#111827" />
              </div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827' }}>
                Nous utilisons des cookies
              </p>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: '#6b7280',
                lineHeight: 1.5,
              }}
            >
              Pour l&apos;analyse et la personnalisation. Vous pouvez accepter ou refuser.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 10,
              alignItems: 'stretch',
              flexShrink: 0,
            }}
          >
            <Button
              variant="outline"
              onClick={handleDecline}
              style={{
                fontSize: 14,
                borderRadius: 14,
                width: isMobile ? '100%' : undefined,
              }}
            >
              Refuser
            </Button>
            <Button
              onClick={handleAccept}
              variant="platform"
              style={{
                fontSize: 14,
                borderRadius: 14,
                width: isMobile ? '100%' : undefined,
                ['--platform-button-bg' as any]: '#111827',
              }}
            >
              Accepter
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
