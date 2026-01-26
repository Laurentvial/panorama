import React, { useRef, useState, useEffect } from 'react';
import { Button } from './ui/button';

interface CookieBannerProps {
  bottomOffset?: number;
}

export function CookieBanner({ bottomOffset = 0 }: CookieBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);

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
      style={{
        position: 'fixed',
        bottom: bottomOffset,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTop: '1px solid #e5e7eb',
        padding: '20px',
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, minWidth: '300px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: '#111827' }}>
            Nous utilisons des cookies pour améliorer votre expérience
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
            En continuant à utiliser ce site, vous acceptez notre utilisation des cookies pour l'analyse et la personnalisation.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Button
          variant="outline"
          onClick={handleDecline}
          style={{ fontSize: '14px' }}
        >
          Refuser
        </Button>
        <Button
          onClick={handleAccept}
          style={{ fontSize: '14px' }}
        >
          Accepter
        </Button>
      </div>
    </div>
  );
}
