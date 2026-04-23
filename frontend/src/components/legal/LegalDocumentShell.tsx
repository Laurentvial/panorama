import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { CLIENT_ACCESS_TOKEN } from '../../utils/constants';
import { Button } from '../ui/button';
import '../../styles/PlatformTypography.css';

interface LegalDocumentShellProps {
  title: string;
  children: React.ReactNode;
}

export function LegalDocumentShell({ title, children }: LegalDocumentShellProps) {
  const navigate = useNavigate();
  const { settings } = useTheme();
  const hasLogo = Boolean(settings?.logo_url);
  const bannerLogoSrc = settings?.logo_url || '';
  const rawName = (settings?.platform_name || '').trim();
  const platformName =
    rawName && rawName.toLowerCase() !== 'panorama' ? rawName : 'Plateforme';
  const buttonBg =
    (settings?.secondary_color || '').trim() ||
    (settings?.primary_color || '').trim() ||
    '#030213';

  const hasClientSession =
    typeof window !== 'undefined' && Boolean(localStorage.getItem(CLIENT_ACCESS_TOKEN));

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'rgba(255, 255, 255, 0.92)',
          borderBottom: '1px solid #e2e8f0',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: '0 auto',
            padding: '12px 20px',
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            columnGap: 12,
          }}
        >
          <div style={{ justifySelf: 'start', display: 'flex', alignItems: 'center' }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="gap-1"
              style={{ color: '#0f172a' }}
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Button>
          </div>
          <Link
            to={hasClientSession ? '/platform' : '/login'}
            style={{
              justifySelf: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              color: 'inherit',
              lineHeight: 0,
            }}
          >
            {hasLogo ? (
              <img
                src={bannerLogoSrc}
                alt={platformName}
                style={{
                  display: 'block',
                  maxHeight: 36,
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                }}
              />
            ) : (
              <span style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{platformName}</span>
            )}
          </Link>
          <div style={{ justifySelf: 'end', width: '100%', minWidth: 0 }} aria-hidden />
        </div>
      </header>

      <main style={{ flex: 1, padding: '24px 20px 48px' }}>
        <article
          style={{
            maxWidth: 720,
            margin: '0 auto',
            background: '#fff',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            padding: '28px 24px 36px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
          }}
        >
          <h1 className="platform-page-title" style={{ marginBottom: 24 }}>
            {title}
          </h1>
          <div
            className="legal-doc-prose"
            style={{
              fontSize: 15,
              lineHeight: 1.65,
              color: '#334155',
            }}
          >
            {children}
          </div>
        </article>
        {hasClientSession && (
          <div
            style={{
              maxWidth: 720,
              margin: '20px auto 0',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              justifyContent: 'center',
              fontSize: 13,
            }}
          >
            <Link to="/platform" style={{ color: buttonBg, fontWeight: 600 }}>
              Tableau de bord
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
