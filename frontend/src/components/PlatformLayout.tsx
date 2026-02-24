import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { usePlatformSearch } from '../contexts/PlatformSearchContext';
import { useTheme } from '../contexts/ThemeContext';
import { clientSignOut } from '../utils/auth';
import { apiCall } from '../utils/api';
import { Home, Wallet, DollarSign, LogOut, User, Compass, Search, Menu, X, ArrowDown, ArrowUp, Bell } from '../utils/iconMapping';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { CookieBanner } from './CookieBanner';
import { ClientBanner } from './ClientBanner';
import { ManagerChatWidget } from './ManagerChatWidget';
import { useIsMobile, useIsPhone } from './ui/use-mobile';
import { logPlatformAction } from '../utils/platformLogger';
import '../styles/PlatformTypography.css';
import '../styles/PlatformButtons.css';
import '../styles/PlatformInputs.css';
import '../styles/PlatformNotifications.css';

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export function PlatformLayout({ children }: PlatformLayoutProps) {
  const MOBILE_BOTTOM_NAV_HEIGHT = 72;
  // Bottom nav is mobile-only; tablet/desktop keep the sidebar visible.
  const BOTTOM_NAV_BREAKPOINT = 768;
  const { currentUser } = useUser();
  const { searchTerm, setSearchTerm } = usePlatformSearch();
  const { settings, loading: settingsLoading } = useTheme();
  const platformName = !settingsLoading ? (settings?.platform_name || 'Plateforme').trim() : '';
  const platformButtonBg =
    (settings?.secondary_color || '').trim() ||
    (settings?.primary_color || '').trim() ||
    '#030213';
  const platformPrimaryBg = (settings?.primary_color || '').trim() || '#030213';
  const platformSecondaryBg = (settings?.secondary_color || '').trim() || 'var(--secondary)';
  const platformAccentBg = 'var(--accent)';
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showBottomNav, setShowBottomNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productsIndex, setProductsIndex] = useState<any[]>([]);
  const [productsIndexLoading, setProductsIndexLoading] = useState(false);
  const [assetsIndex, setAssetsIndex] = useState<any[]>([]);
  const [assetsIndexLoading, setAssetsIndexLoading] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(60); // Default header height
  const [clientNotifications, setClientNotifications] = useState<Array<{
    id: string;
    notificationType: string;
    title: string;
    message: string;
    read: boolean;
    payload: Record<string, unknown>;
    createdAt: string;
  }>>([]);
  const [clientUnreadCount, setClientUnreadCount] = useState(0);
  const [clientNotificationsLoading, setClientNotificationsLoading] = useState(false);
  const [clientNotificationsOpen, setClientNotificationsOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BOTTOM_NAV_BREAKPOINT}px)`);
    const onChange = () => setShowBottomNav(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Measure header height and update CSS variable
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        const height = headerRef.current.getBoundingClientRect().height;
        setHeaderHeight(height);
        document.documentElement.style.setProperty('--platform-header-height', `${height}px`);
        // Also set scroll-padding-top on html to prevent content from being hidden behind sticky header
        document.documentElement.style.scrollPaddingTop = `calc(var(--client-banner-height, 0px) + ${height}px)`;
      }
    };

    // Use requestAnimationFrame to ensure header is rendered before measuring
    requestAnimationFrame(() => {
      updateHeaderHeight();
    });
    
    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      document.documentElement.style.scrollPaddingTop = '';
    };
  }, [isMobile, showBottomNav]);

  useEffect(() => {
    // When bottom navigation is active, keep the side menu folded by default.
    if (showBottomNav) {
      setSidebarOpen(false);
    }
  }, [showBottomNav]);

  // Log page views
  useEffect(() => {
    // Only log if we have a valid client user and pathname
    if (!location.pathname || !currentUser?.userType || currentUser.userType !== 'client') {
      return;
    }
    
    // Ensure we have a client ID before logging
    if (!currentUser?.id) {
      return;
    }
    
    // Small delay to ensure token is available in storage
    const timeoutId = setTimeout(() => {
      logPlatformAction('page_view', { route: location.pathname });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [location.pathname, currentUser?.userType, currentUser?.id]);

  // Load product index once so the header search can show results.
  useEffect(() => {
    if (!currentUser?.id) return;
    
    let cancelled = false;

    const loadSearchIndex = async () => {
      try {
        setProductsIndexLoading(true);
        setAssetsIndexLoading(true);

        const [clientProductsRes, clientAssetsRes] = await Promise.all([
          apiCall(`/api/clients/${currentUser.id}/products/`).catch(() => null),
          apiCall(`/api/clients/${currentUser.id}/assets/`).catch(() => null),
        ]);

        // Extract products from ClientProduct objects
        const clientProducts = ((clientProductsRes as any)?.products || []) as any[];
        const productsList = clientProducts.map((cp: any) => {
          // Handle both structures: {product: {...}} and direct product object
          return cp.product || cp;
        }).filter(Boolean);
        const activeProducts = Array.isArray(productsList)
          ? productsList.filter((p: any) => p?.status === 'Actif')
          : [];

        // Extract assets from ClientAsset objects
        const clientAssets = ((clientAssetsRes as any)?.assets || []) as any[];
        const assetsList = clientAssets.map((ca: any) => {
          // Handle both structures: {asset: {...}} and direct asset object
          return ca.asset || ca;
        }).filter(Boolean);

        if (!cancelled) {
          setProductsIndex(activeProducts);
          setAssetsIndex(assetsList);
        }
      } catch (e) {
        console.warn('Unable to load search index for header search:', e);
        if (!cancelled) {
          setProductsIndex([]);
          setAssetsIndex([]);
        }
      } finally {
        if (!cancelled) {
          setProductsIndexLoading(false);
          setAssetsIndexLoading(false);
        }
      }
    };

    loadSearchIndex();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const fetchClientNotifications = React.useCallback(async (markAllReadOnOpen = false) => {
    if (!currentUser?.id) return;
    setClientNotificationsLoading(true);
    try {
      const data = await apiCall('/api/client/notifications/?limit=20') as {
        notifications?: typeof clientNotifications;
        unreadCount?: number;
      };
      setClientNotifications(data?.notifications || []);
      setClientUnreadCount(data?.unreadCount ?? 0);
      if (markAllReadOnOpen) {
        try {
          await apiCall('/api/client/notifications/read-all/', { method: 'PATCH' });
          setClientNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          setClientUnreadCount(0);
        } catch {
          // ignore
        }
      }
    } catch {
      setClientNotifications([]);
      setClientUnreadCount(0);
    } finally {
      setClientNotificationsLoading(false);
    }
  }, [currentUser?.id]);

  React.useEffect(() => {
    if (!clientNotificationsOpen) return;
    fetchClientNotifications(true);
  }, [clientNotificationsOpen, fetchClientNotifications]);

  React.useEffect(() => {
    const t = setInterval(() => fetchClientNotifications(false), 60000);
    return () => clearInterval(t);
  }, [fetchClientNotifications]);

  const handleClientNotificationMarkRead = async (id: string) => {
    try {
      await apiCall(`/api/client/notifications/${id}/read/`, { method: 'PATCH' });
      setClientNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setClientUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await clientSignOut();
    navigate('/login');
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: Home, path: '/platform' },
    { id: 'portfolio', label: 'Portefeuille', icon: Wallet, path: '/platform/portfolio' },
    { id: 'funds', label: 'Fonds', icon: DollarSign, path: '/platform/funds' },
    { id: 'discover', label: 'Découvrir', icon: Compass, path: '/platform/discover' },
  ];

  const handleMenuClick = (path: string) => {
    navigate(path);
    if (showBottomNav) {
      setSidebarOpen(false);
    }
  };

  const handleFundsAction = (movement: 'depot' | 'retrait') => {
    navigate(`/platform/funds?movement=${movement}`);
    if (showBottomNav) {
      setSidebarOpen(false);
    }
  };

  const normalizedSearch = (searchTerm || '').trim().toLowerCase();
  const assetMatches = useMemo(() => {
    if (!normalizedSearch) return [];
    const matches = (assetsIndex || []).filter((a: any) => {
      const name = String(a?.name || '').toLowerCase();
      const reference = String(a?.reference || a?.symbol || '').toLowerCase();
      return name.includes(normalizedSearch) || reference.includes(normalizedSearch);
    });
    return matches.slice(0, 8);
  }, [assetsIndex, normalizedSearch]);

  const productMatches = useMemo(() => {
    if (!normalizedSearch) return [];
    const matches = (productsIndex || []).filter((p: any) => {
      const name = String(p?.name || '').toLowerCase();
      const reference = String(p?.reference || '').toLowerCase();
      return name.includes(normalizedSearch) || reference.includes(normalizedSearch);
    });
    return matches.slice(0, 8);
  }, [productsIndex, normalizedSearch]);

  const stickyTopOffset = `calc(var(--client-banner-height, 0px) + var(--platform-header-height, ${headerHeight}px))`;
  const sidebarHeight = `calc(100vh - (var(--client-banner-height, 0px) + var(--platform-header-height, ${headerHeight}px)))`;

  return (
    <div
      className="platform-root"
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        ['--platform-button-bg' as any]: platformButtonBg,
      }}
    >
      {/* Client Banner */}
      <ClientBanner topOffset={0} />
      
      {/* Header */}
      <header 
        ref={headerRef}
        style={{
          backgroundColor: 'var(--primary)',
          color: 'var(--accent-foreground)',
          borderBottom: '1px solid color-mix(in srgb, var(--accent-foreground) 20%, transparent)',
          padding: isMobile ? '12px 16px' : '15px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: isMobile ? '12px' : '20px',
          position: 'sticky',
          top: 'var(--client-banner-height, 0px)',
          // Keep header (and close X) above the drawer overlay.
          zIndex: showBottomNav ? 500 : 100,
        }}>
        {/* Mobile Menu Button */}
        {showBottomNav && (
          <Button
            variant="outline"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ 
              padding: '8px',
              minWidth: '40px',
              height: '40px',
            }}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        )}
        
        {/* Search Bar */}
        <div style={{ 
          flex: 1, 
          maxWidth: isMobile ? '100%' : '600px', 
          position: 'relative',
        }}>
          <div style={{ 
            position: 'absolute', 
            top: '50%', 
            transform: 'translateY(-50%)', 
            left: isMobile ? '12px' : '20px', 
            pointerEvents: 'none',
            zIndex: 1
          }}>
            <Search size={isMobile ? 18 : 20} color="#9ca3af" />
          </div>
          <Input
            className="platform-header-search"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => {
              // Allow click on dropdown items before closing.
              window.setTimeout(() => setSearchOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            style={{
              paddingLeft: isMobile ? '40px' : '55px',
              paddingRight: isMobile ? '12px' : '20px',
              height: isMobile ? '34px' : '40px',
              fontSize: isMobile ? '13px' : '14px',
              borderRadius: 14,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--input-background)',
              color: 'var(--accent-foreground)',
              caretColor: 'var(--accent-foreground)',
              width: '100%',
            }}
          />

          {searchOpen && (normalizedSearch.length > 0) && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: 'rgba(255, 255, 255, 0.92)',
                border: '1px solid rgba(0, 0, 0, 0.10)',
                borderRadius: 16,
                boxShadow: '0 18px 50px rgba(2, 6, 23, 0.18)',
                overflow: 'hidden',
                zIndex: 999,
              }}
              role="listbox"
              aria-label="Résultats de recherche"
            >
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                {(productsIndexLoading || assetsIndexLoading) ? 'Recherche…' : `Actifs (${assetMatches.length}) • Produits (${productMatches.length})`}
              </div>

              {!productsIndexLoading && !assetsIndexLoading && assetMatches.length === 0 && productMatches.length === 0 ? (
                <div style={{ padding: '12px', fontSize: 13, color: '#6b7280' }}>
                  Aucun résultat
                </div>
              ) : (
                <>
                  {assetMatches.length > 0 && (
                    <>
                      <div style={{ padding: '8px 12px', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#6b7280', background: 'rgba(0,0,0,0.03)' }}>
                        Actifs
                      </div>
                      {assetMatches.map((a: any) => (
                        <button
                          key={`asset-${a.id}`}
                          type="button"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background-color 0.2s, color 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = platformPrimaryBg;
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = '';
                          }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSearchOpen(false);
                            setSearchTerm('');
                            navigate(`/platform/product/${a.id}`);
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {a?.name || 'Actif'}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {a?.reference || a?.symbol || '—'}
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, color: '#9ca3af', fontSize: 12 }}>↵</div>
                        </button>
                      ))}
                    </>
                  )}

                  {productMatches.length > 0 && (
                    <>
                      <div style={{ padding: '8px 12px', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#6b7280', background: 'rgba(0,0,0,0.03)' }}>
                        Produits
                      </div>
                      {productMatches.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color 0.2s, color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = platformAccentBg;
                      e.currentTarget.style.color = platformPrimaryBg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '';
                    }}
                    onMouseDown={(e) => {
                      // Prevent blur before click handler runs
                      e.preventDefault();
                    }}
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchTerm('');
                      navigate(`/platform/product/${p.id}`);
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p?.name || 'Produit'}
                      </div>
                      {!!p?.reference && (
                        <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.reference}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, color: '#9ca3af', fontSize: 12 }}>↵</div>
                  </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: isMobile ? '8px' : '15px',
          flexShrink: 0,
        }}>
          <DropdownMenu open={clientNotificationsOpen} onOpenChange={setClientNotificationsOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Notifications"
                style={{
                  position: 'relative',
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  border: '1px solid color-mix(in srgb, var(--accent-foreground) 25%, transparent)',
                  background: 'transparent',
                  color: 'var(--accent-foreground)',
                }}
              >
                <Bell size={20} />
                {clientUnreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9999,
                      background: 'var(--destructive, #dc2626)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                    }}
                  >
                    {clientUnreadCount > 99 ? '99+' : clientUnreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="platform-notification-dropdown"
              sideOffset={8}
            >
              <DropdownMenuLabel className="platform-notification-label">
                Notifications
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="platform-notification-separator" />
              {clientNotificationsLoading ? (
                <div className="platform-notification-loading">
                  <span>Chargement...</span>
                </div>
              ) : clientNotifications.length === 0 ? (
                <div className="platform-notification-empty">
                  <div className="platform-notification-empty-icon">
                    <Bell size={24} />
                  </div>
                  Aucune notification
                </div>
              ) : (
                <div className="platform-notification-list">
                  {clientNotifications.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className={`platform-notification-item ${n.read ? '' : 'platform-notification-item-unread'}`}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (!n.read) handleClientNotificationMarkRead(n.id);
                      }}
                    >
                      <span className="platform-notification-item-title">{n.title}</span>
                      <span className="platform-notification-item-message">{n.message}</span>
                      <span className="platform-notification-item-date">
                        {n.createdAt
                          ? new Date(n.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div style={{ display: 'flex', position: 'relative' }}>
        {/* Drawer Overlay (when bottom nav is active) */}
        {showBottomNav && sidebarOpen && (
          <div
            style={{
              position: 'fixed',
              // Don't cover the header; it contains the close (X) button.
              top: stickyTopOffset,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 300,
            }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside style={{
          // Narrower to avoid horizontal overflow on some screens.
          width: showBottomNav ? (sidebarOpen ? '280px' : '0') : '360px',
          height: sidebarHeight,
          padding: 0,
          // Keep drawer behavior on mobile bottom nav.
          // On desktop we keep a spacer in flow and render the actual sidebar as fixed,
          // to avoid sticky overflow issues while still reserving layout space.
          position: showBottomNav ? 'fixed' : 'relative',
          left: showBottomNav ? (sidebarOpen ? '0' : '-280px') : '0',
          // Keep the sidebar under the (sticky) header while scrolling.
          top: stickyTopOffset,
          zIndex: showBottomNav ? 400 : 10,
          transition: 'left 0.3s ease, width 0.3s ease',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Logo */}
          {(sidebarOpen || !showBottomNav) && (
            <>
              <div
                style={
                  showBottomNav
                    ? {
                        backgroundColor: 'var(--primary)',
                        color: 'var(--accent-foreground)',
                        borderRight: 'none',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }
                    : {
                        position: 'fixed',
                        top: stickyTopOffset,
                        left: 0,
                        width: 360,
                        height: sidebarHeight,
                        backgroundColor: 'var(--primary)',
                        color: 'var(--accent-foreground)',
                        borderRight: '1px solid color-mix(in srgb, var(--accent-foreground) 20%, transparent)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }
                }
              >
              {/* Scrollable area */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  padding: showBottomNav ? (sidebarOpen ? '0px 0' : '0') : '0px 0',
                }}
              >
              <div style={{ 
                // Give the logo some vertical breathing room in the sidebar.
                padding: isMobile ? '18px 20px' : '26px 30px', 
                marginBottom: 0, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'flex-start' 
              }}>
                {settings?.logo_url ? (
                  <img 
                    src={settings.logo_url} 
                    alt="Logo" 
                    style={location.pathname.startsWith('/platform/product/') 
                      ? { 
                          width: isMobile ? '64px' : '160px', 
                          height: isMobile ? '64px' : '80px', 
                          objectFit: 'contain' 
                        }
                      : { 
                          maxHeight: isMobile ? '32px' : '48px', 
                          maxWidth: isMobile ? '120px' : '160px', 
                          objectFit: 'contain' 
                        }
                    } 
                  />
                ) : (
                  <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', margin: 0 }}>{platformName}</h1>
                )}
              </div>
              
              {/* User Profile */}
              <div style={{ 
                padding: isMobile ? '10px 14px' : '12px 16px', 
                marginBottom: '20px', 
                marginLeft: isMobile ? '12px' : '20px',
                marginRight: isMobile ? '12px' : '20px',
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                borderRadius: '16px',
                border: '1px solid color-mix(in srgb, var(--accent-foreground) 16%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--accent-foreground) 10%, transparent)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
              }}>
                {currentUser?.profilePhoto ? (
                  <img 
                    src={currentUser.profilePhoto} 
                    alt="Profile" 
                    style={{ 
                      width: isMobile ? '40px' : '50px', 
                      height: isMobile ? '40px' : '50px', 
                      borderRadius: '50%', 
                      objectFit: 'cover',
                      border: '2px solid #e5e7eb'
                    }} 
                  />
                ) : (
                  <div style={{
                    width: isMobile ? '40px' : '50px',
                    height: isMobile ? '40px' : '50px',
                    borderRadius: '50%',
                    backgroundColor: '#e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #e5e7eb'
                  }}>
                    <User size={isMobile ? 20 : 24} color="#6b7280" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: isMobile ? '14px' : '16px', 
                    fontWeight: '600', 
                    color: 'var(--accent-foreground)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {currentUser?.fname || currentUser?.firstName || ''} {currentUser?.lname || currentUser?.lastName || ''}
                  </div>
                  {currentUser?.email && (
                    <div style={{ 
                      fontSize: isMobile ? '12px' : '14px', 
                      color: 'color-mix(in srgb, var(--accent-foreground) 75%, transparent)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {currentUser.email}
                    </div>
                  )}
                </div>
              </div>
              
              <nav className="platform-sidebar-nav">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleMenuClick(item.path)}
                      className="platform-hoverable platform-sidebar-link"
                      data-active={isActive ? 'true' : 'false'}
                      aria-current={isActive ? 'page' : undefined}
                      type="button"
                      style={{
                        width: '100%',
                        padding: isMobile ? '12px 20px' : '16px 30px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: isMobile ? '12px' : '16px',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: isMobile ? '16px' : '18px',
                      }}
                    >
                      <Icon size={isMobile ? 20 : 24} />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              </div>

              {/* Bottom actions (fixed at bottom of sidebar) */}
              <div
                style={{
                  flexShrink: 0,
                  backgroundColor: 'var(--primary)',
                  color: 'var(--accent-foreground)',
                  paddingTop: 12,
                  paddingBottom: 12,
                  borderTop: '1px solid color-mix(in srgb, var(--accent-foreground) 20%, transparent)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: 'stretch',
                    gap: 10,
                    marginLeft: isMobile ? 20 : 20,
                    marginRight: isMobile ? 20 : 20,
                  }}
                >
                  <button
                    onClick={() => handleFundsAction('depot')}
                    className="platform-hoverable platform-action-btn"
                    style={{
                      flex: isMobile ? 'none' : 1,
                      width: isMobile ? '100%' : undefined,
                      height: 44,
                      padding: '0 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      backgroundColor: platformButtonBg,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: isMobile ? '15px' : '16px',
                      color: 'white',
                      fontWeight: 500,
                      borderRadius: 9999,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <ArrowDown size={isMobile ? 18 : 20} />
                    Déposer des fonds
                  </button>
                  <button
                    onClick={() => handleFundsAction('retrait')}
                    className="platform-hoverable platform-action-icon"
                    style={{
                      width: isMobile ? '100%' : 55,
                      height: 44,
                      padding: isMobile ? '0 14px' : 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      backgroundColor: platformSecondaryBg,
                      border: `1px solid color-mix(in srgb, ${platformPrimaryBg} 35%, transparent)`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: isMobile ? '15px' : '16px',
                      color: 'var(--secondary-foreground)',
                      fontWeight: 500,
                      borderRadius: 9999,
                      whiteSpace: 'nowrap',
                    }}
                    aria-label="Retrait"
                  >
                    <ArrowUp size={isMobile ? 18 : 20} />
                    {isMobile && <span>Retirer des fonds</span>}
                  </button>

                  <button
                    onClick={async () => {
                      if (showBottomNav) setSidebarOpen(false);
                      await handleLogout();
                    }}
                    className="platform-hoverable platform-action-icon platform-action-logout"
                    style={{
                      width: isMobile ? '100%' : 55,
                      height: 44,
                      padding: isMobile ? '0 14px' : 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      backgroundColor: '#ef4444',
                      border: '1px solid #ef4444',
                      cursor: 'pointer',
                      color: 'white',
                      borderRadius: 9999,
                    }}
                    aria-label="Déconnexion"
                    title="Déconnexion"
                  >
                    <LogOut size={isMobile ? 18 : 20} />
                    {isMobile && <span>Se deconnecter</span>}
                  </button>
                </div>
              </div>
              </div>
            </>
          )}
        </aside>

        {/* Main Content */}
        <main style={{ 
          flex: 1, 
          paddingTop: stickyTopOffset,
          paddingRight: isPhone ? '12px' : isMobile ? '16px' : '30px',
          paddingLeft: isPhone ? '12px' : isMobile ? '16px' : '30px',
          paddingBottom: showBottomNav ? `${(isPhone ? 12 : 16) + MOBILE_BOTTOM_NAV_HEIGHT}px` : (isPhone ? '16px' : isMobile ? '20px' : '30px'),
          width: isMobile ? '100%' : 'auto',
          minWidth: 0,
          overflowX: 'hidden',
          scrollMarginTop: `calc(var(--client-banner-height, 0px) + var(--platform-header-height, ${headerHeight}px))`, // Account for sticky header height
        }}>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {showBottomNav && (
        <nav
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${MOBILE_BOTTOM_NAV_HEIGHT}px`,
            backgroundColor: 'white',
            borderTop: '1px solid #e5e7eb',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '8px 8px 12px',
          }}
          aria-label="Navigation mobile"
        >
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/platform' && location.pathname.startsWith(`${item.path}/`));

            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.path)}
                className="platform-hoverable platform-bottomnav-btn"
                data-active={isActive ? 'true' : 'false'}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '8px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: isActive ? '#111827' : '#6b7280',
                  fontWeight: isActive ? 600 : 400,
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={22} />
                <span style={{ fontSize: '11px', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Chat bubble (client -> manager) */}
      <ManagerChatWidget bottomOffsetPx={showBottomNav ? MOBILE_BOTTOM_NAV_HEIGHT : 0} />
      
      {/* Cookie Banner */}
      <CookieBanner bottomOffset={showBottomNav ? MOBILE_BOTTOM_NAV_HEIGHT : 0} />
    </div>
  );
}
