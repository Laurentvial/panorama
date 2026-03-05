import React, { useState, useEffect, useCallback } from 'react';
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
import { useTheme } from '../contexts/ThemeContext';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { apiCall } from '../utils/api';
import { formatRoleLabel } from '../utils/constants';
import '../styles/Header.css';

type AppNotification = {
  id: string;
  notificationType: string;
  title: string;
  message: string;
  read: boolean;
  payload: Record<string, unknown>;
  createdAt: string;
};

interface HeaderProps {
  user: any;
}

export function Header({ user }: HeaderProps) {
  const navigate = useNavigate();
  const { settings, loading: settingsLoading } = useTheme();
  const platformName = !settingsLoading ? (settings?.platform_name || '').trim() : '';
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const fetchNotifications = useCallback(async (markAllReadOnOpen = false) => {
    setNotificationsLoading(true);
    try {
      const data = await apiCall('/api/notifications/?limit=20') as {
        notifications?: AppNotification[];
        unreadCount?: number;
      };
      setNotifications(data?.notifications || []);
      setUnreadCount(data?.unreadCount ?? 0);
      if (markAllReadOnOpen) {
        try {
          await apiCall('/api/notifications/read-all/', { method: 'PATCH' });
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          setUnreadCount(0);
        } catch {
          // ignore
        }
      }
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    fetchNotifications(true);
  }, [notificationsOpen, fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await apiCall(`/api/notifications/${id}/read/`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) {
      handleMarkRead(n.id);
    }
    const clientId = n.payload?.client_id as string | undefined;
    if (clientId) {
      setNotificationsOpen(false);
      navigate(`/admin/clients/${clientId}`);
    }
  };

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
            <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <DropdownMenuTrigger asChild>
                <Button className="header-button header-button-notifications" aria-label="Notifications">
                  <HiOutlineBell />
                  {unreadCount > 0 && (
                    <span className="header-notification-badge" aria-hidden>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="header-dropdown header-notification-content" align="end">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notificationsLoading ? (
                  <div className="header-notification-empty">Chargement...</div>
                ) : notifications.length === 0 ? (
                  <div className="header-notification-empty">Aucune notification</div>
                ) : (
                  <div className="header-notification-list">
                    {notifications.map((n) => (
                      <DropdownMenuItem
                        key={n.id}
                        className={n.read ? 'header-notification-item' : 'header-notification-item header-notification-item-unread'}
                        onSelect={(e) => {
                          e.preventDefault();
                          handleNotificationClick(n);
                        }}
                      >
                        <div className="header-notification-item-inner">
                          <span className="header-notification-item-title">{n.title}</span>
                          <span className="header-notification-item-message">{n.message}</span>
                          <span className="header-notification-item-date">
                            {n.createdAt
                              ? new Date(n.createdAt).toLocaleDateString('fr-FR', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
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
                    {user?.role && <p className="header-user-role">{formatRoleLabel(user.role)}</p>}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/admin/profile')} className="header-profile">
                  Mon profil
                </DropdownMenuItem>
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