import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { LEGAL_LINKS } from './legalRoutes';

const DEFAULT_LEGAL_LINK_COLOR = '#2563eb';

interface LegalFooterLinksProps {
  /** Slightly lighter text for dark-on-light login-style pages */
  variant?: 'default' | 'login' | 'sidebar';
  layout?: 'row' | 'column';
  className?: string;
}

export function LegalFooterLinks({
  variant = 'default',
  layout = 'row',
  className,
}: LegalFooterLinksProps) {
  const { settings, loading: settingsLoading } = useTheme();

  /** Couleur d’accent pour les liens (variant default) : toujours une chaîne CSS délibérée. */
  const themeAccentLinkColor = ((): string => {
    if (settingsLoading) {
      return DEFAULT_LEGAL_LINK_COLOR;
    }
    const secondary = (settings?.secondary_color || '').trim();
    if (secondary) return secondary;
    const primary = (settings?.primary_color || '').trim();
    if (primary) return primary;
    return DEFAULT_LEGAL_LINK_COLOR;
  })();

  const linkColor =
    variant === 'login'
      ? 'rgba(2, 6, 23, 0.75)'
      : variant === 'sidebar'
        ? 'color-mix(in srgb, var(--accent-foreground) 82%, white)'
        : themeAccentLinkColor;

  const isColumn = layout === 'column';

  return (
    <nav
      className={className}
      aria-label="Informations légales"
      style={{
        display: 'flex',
        flexDirection: isColumn ? 'column' : 'row',
        flexWrap: isColumn ? 'nowrap' : 'wrap',
        gap: isColumn ? 8 : '10px 16px',
        justifyContent: isColumn ? 'flex-start' : 'center',
        alignItems: isColumn ? 'stretch' : 'center',
        fontSize: variant === 'login' ? 13 : 12,
        lineHeight: 1.4,
      }}
    >
      {LEGAL_LINKS.map(({ href, label }, i) => (
        <React.Fragment key={href}>
          {!isColumn && i > 0 && (
            <span style={{ color: 'rgba(15, 23, 42, 0.25)', userSelect: 'none' }} aria-hidden>
              ·
            </span>
          )}
          <Link
            to={href}
            style={{
              color: linkColor,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            {label}
          </Link>
        </React.Fragment>
      ))}
    </nav>
  );
}
