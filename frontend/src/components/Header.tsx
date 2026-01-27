import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { HiOutlineBell, HiOutlineLogout, HiOutlineUser } from 'react-icons/hi';
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import '../styles/Header.css';

interface HeaderProps {
  user: any;
}

export function Header({ user }: HeaderProps) {
  const navigate = useNavigate();
  const { settings, loading: settingsLoading } = useTheme();
  const platformName = !settingsLoading ? (settings?.platform_name || '').trim() : '';

  // Returns full name only if both firstName and lastName exist and are non-empty (after trimming)
  function getFullName() {
    const firstName = (user?.firstName || '').trim();
    const lastName = (user?.lastName || '').trim();
    // Show fullname only if at least one is non-empty
    if (firstName || lastName) {
      return `${firstName}${firstName && lastName ? ' ' : ''}${lastName}`.trim();
    }
    // If no names, fallback to empty string
    return '';
  }

  function handleLogout() {
    localStorage.clear();
    navigate('/admin/login');
  }

  // Use full name if available, otherwise fallback to email/userId/'User' for User Menu label
  const fullName = getFullName();
  const mainUserDisplay = fullName || user?.email || user?.userId || 'User';
  const profilePhotoUrl: string | undefined = typeof user?.profilePhoto === 'string' ? user.profilePhoto : undefined;
  const fallbackInitials = (() => {
    const source = (
      fullName ||
      (typeof user?.email === 'string' ? user.email : '') ||
      (typeof user?.userId === 'string' ? user.userId : '') ||
      ''
    ).trim();
    if (!source) return '';
    if (source.toLowerCase() === 'user') return '';

    const base = source.includes('@') ? source.split('@')[0] : source;
    const parts = base
      .replace(/[_\-.]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const first = parts[0]?.[0] || '';
    const second = parts.length > 1 ? (parts[1]?.[0] || '') : (parts[0]?.[1] || '');
    return (first + second).toUpperCase();
  })();

  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-logo">
            </div>
            <div className="header-title-section">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="header-logo-img" style={{ maxHeight: 100, maxWidth: 140 }} />
              ) : (
                <div className="header-platform-name">
                  {platformName}
                </div>
              )}
              <p className="header-subtitle">Protected Asset Network Offering Robust All‑class Market Access</p>
            </div>
          </div>
          
          <div className="header-actions">
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="header-button header-button-notifications">
                  <HiOutlineBell />
                  {/* Notifications badge logic could go here */}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="header-dropdown" align="end">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="header-notification-empty">
                  Aucune notification
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="header-button header-button-user">
                  <Avatar className="header-user-avatar">
                    <AvatarImage src={profilePhotoUrl} alt={mainUserDisplay} />
                    <AvatarFallback className="header-user-avatar-fallback" aria-label={mainUserDisplay}>
                      {fallbackInitials ? (
                        <span className="header-user-avatar-initials">{fallbackInitials}</span>
                      ) : (
                        <HiOutlineUser />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="header-dropdown" align="end">
                <DropdownMenuLabel>
                  <div className="header-user-info">
                    <p className="header-user-name-full">
                      {fullName || user?.email || 'Email introuvable'}
                    </p>
                    {/* Show email if full name is available, otherwise it's already shown above */}
                    {fullName && user?.email && (
                      <p className="header-user-email">{user?.email}</p>
                    )}
                    {user?.role && <p className="header-user-role">{user?.role}</p>}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="header-logout">
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;