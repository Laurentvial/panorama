import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link, Outlet } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { usePlatformSearch } from '../contexts/PlatformSearchContext';
import { useTheme } from '../contexts/ThemeContext';
import { clientSignOut } from '../utils/auth';
import { apiCall, clearApiCache } from '../utils/api';
import { LogOut, User, Search, Menu, X, ArrowDown, ArrowUp, Bell } from '../utils/iconMapping';
import { HiOutlineShare } from 'react-icons/hi';
import { Copy } from 'lucide-react';
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
import { LegalFooterLinks } from './legal/LegalFooterLinks';
import { ClientBanner } from './ClientBanner';
import { ManagerChatWidget } from './ManagerChatWidget';
import { useIsMobile, useIsPhone } from './ui/use-mobile';
import { logPlatformAction } from '../utils/platformLogger';
import { toast } from 'sonner';
import '../styles/PlatformTypography.css';
import '../styles/PlatformButtons.css';
import '../styles/PlatformInputs.css';
import '../styles/PlatformNotifications.css';
import '../styles/Modal.css';

const UI_COMPACT_SHELL_PLATFORM_CLASS = 'ui-compact-shell-platform';

/**
 * Renders the shell (header, sidebar) and the active child route via <Outlet />.
 * Nested under App.tsx `/platform/*` so the layout is not unmounted on every page change
 * (avoids re-fetching search index + notifications on each navigation).
 */
export function PlatformLayout() {
  const MOBILE_BOTTOM_NAV_HEIGHT = 72;
  // Bottom nav is mobile-only; tablet/desktop keep the sidebar visible.
  const BOTTOM_NAV_BREAKPOINT = 768;
  const { currentUser } = useUser();
  const { searchTerm, setSearchTerm } = usePlatformSearch();
  const { settings } = useTheme();
  const platformName = (settings?.platform_name || 'Plateforme').trim();
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
  const [referralModalOpen, setReferralModalOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BOTTOM_NAV_BREAKPOINT}px)`);
    const onChange = () => setShowBottomNav(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  /** Tighter rem root than admin CRM (see UiCompactShell.css); no zoom — avoids footer/viewport gaps. */
  useEffect(() => {
    document.documentElement.classList.add(UI_COMPACT_SHELL_PLATFORM_CLASS);
    return () => {
      document.documentElement.classList.remove(UI_COMPACT_SHELL_PLATFORM_CLASS);
    };
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

    // Product/asset detail views are logged from ProductDetail with enriched metadata
    // (entity name/type) once data is loaded.
    if (location.pathname.startsWith('/platform/product/')) {
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

  const fetchClientNotifications = React.useCallback(async (markAllReadOnOpen = false, options?: { bypassCache?: boolean; silent?: boolean }) => {
    if (!currentUser?.id) return;
    const { bypassCache = false, silent = false } = options ?? {};
    if (bypassCache) {
      clearApiCache('/api/client/notifications');
    }
    if (!silent) setClientNotificationsLoading(true);
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
      if (!silent) setClientNotificationsLoading(false);
    }
  }, [currentUser?.id]);

  // Charger les notifications au montage pour afficher le badge
  React.useEffect(() => {
    if (currentUser?.userType === 'client' && currentUser?.id) {
      fetchClientNotifications(false, { bypassCache: true });
    }
  }, [currentUser?.userType, currentUser?.id, fetchClientNotifications]);

  // Polling pour recevoir les nouvelles notifications en temps réel (ex: message du gestionnaire)
  React.useEffect(() => {
    if (currentUser?.userType !== 'client' || !currentUser?.id) return;
    const interval = setInterval(() => {
      fetchClientNotifications(false, { bypassCache: true, silent: true });
    }, 30000); // toutes les 30 secondes
    return () => clearInterval(interval);
  }, [currentUser?.userType, currentUser?.id, fetchClientNotifications]);

  React.useEffect(() => {
    if (!clientNotificationsOpen) return;
    fetchClientNotifications(true);
  }, [clientNotificationsOpen, fetchClientNotifications]);

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

  const menuItems = useMemo(() => {
    const items = [
      { id: 'dashboard', label: 'Tableau de bord', iconChar: '\uE88A', path: '/platform' },
      { id: 'portfolio', label: 'Mon portefeuille', iconChar: '\uE850', path: '/platform/portfolio' },
      { id: 'transactions', label: 'Transactions', iconChar: '\uE8B0', path: '/platform/transactions' },
      { id: 'positions', label: 'Mes positions', iconChar: '\uE6E1', path: '/platform/positions' },
      { id: 'funds', label: 'Mon solde', iconChar: '\uE8A1', path: '/platform/funds' },
      { id: 'discover', label: 'Découvrir', iconChar: '\uE87B', path: '/platform/discover' },
      { id: 'messaging', label: 'Messagerie', iconChar: '\uE0E1', path: '/platform/messaging' },
      { id: 'useful-links', label: 'Liens utiles', iconChar: '\uE157', path: '/platform/useful-links' },
    ];
    if (currentUser?.userType === 'client' && currentUser?.hasUsefulLinks === false) {
      return items.filter((item) => item.id !== 'useful-links');
    }
    return items;
  }, [currentUser?.userType, currentUser?.hasUsefulLinks]);

  /** Barre du bas : moins d’entrées pour éviter la surcharge (Transactions / Mes positions restent dans le menu latéral). */
  const bottomNavMenuItems = useMemo(
    () => menuItems.filter((item) => item.id !== 'transactions' && item.id !== 'positions'),
    [menuItems]
  );

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
          boxShadow: '0 6px 24px rgba(15, 23, 42, 0.07), inset 0 1px 0 color-mix(in srgb, var(--accent-foreground) 12%, transparent)',
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
          <div
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              left: isMobile ? '12px' : '20px',
              pointerEvents: 'none',
              zIndex: 1,
              color: 'color-mix(in srgb, var(--accent-foreground) 38%, transparent)',
            }}
          >
            <Search size={isMobile ? 18 : 20} color="currentColor" />
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
          <DropdownMenu
            modal={false}
            open={clientNotificationsOpen}
            onOpenChange={setClientNotificationsOpen}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Notifications"
                style={{
                  position: 'relative',
                  width: 40,
                  height: 40,
                  borderRadius: 9999,
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
          <Button
            type="button"
            variant="outline"
            size={showBottomNav ? 'icon' : 'sm'}
            onClick={async () => {
              if (showBottomNav) setSidebarOpen(false);
              await handleLogout();
            }}
            aria-label="Se déconnecter"
            title="Se déconnecter"
            style={{
              flexShrink: 0,
              height: 40,
              borderRadius: 9999,
              border: '1px solid color-mix(in srgb, var(--accent-foreground) 25%, transparent)',
              background: 'transparent',
              color: 'var(--accent-foreground)',
              ...(showBottomNav
                ? { width: 40, padding: 0 }
                : {
                    paddingLeft: 14,
                    paddingRight: 14,
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 500,
                  }),
            }}
          >
            <LogOut size={showBottomNav ? 20 : 18} />
            {!showBottomNav && <span>Se déconnecter</span>}
          </Button>
        </div>
      </header>

      <div
        style={{
          display: 'flex',
          position: 'relative',
          alignItems: 'stretch',
          minHeight: sidebarHeight,
        }}
      >
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
          width: showBottomNav ? (sidebarOpen ? '280px' : '0') : '340px',
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
                        width: 340,
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
                <button
                  type="button"
                  onClick={() => navigate('/platform')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                  }}
                  aria-label="Retour au tableau de bord"
                >
                  {settings?.logo_url ? (
                    <img 
                      src={settings.logo_url} 
                      alt="Logo" 
                      style={location.pathname.startsWith('/platform/product/') 
                        ? { 
                            width: isPhone ? '96px' : isMobile ? '64px' : '160px', 
                            height: isPhone ? '96px' : isMobile ? '64px' : '80px', 
                            objectFit: 'contain' 
                          }
                        : { 
                            maxHeight: isPhone ? '64px' : isMobile ? '48px' : '64px', 
                            maxWidth: isPhone ? '200px' : isMobile ? '180px' : '220px', 
                            objectFit: 'contain' 
                          }
                      } 
                    />
                  ) : (
                    <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', margin: 0 }}>{platformName}</h1>
                  )}
                </button>
              </div>
              
              {/* User Profile - clickable to open Mon profil */}
              <div style={{ 
                paddingLeft: isMobile ? '12px' : '20px',
                paddingRight: isMobile ? '12px' : '20px',
                marginRight: isMobile ? '8px' : '16px',
                marginBottom: '20px',
                minWidth: 0,
              }}>
                <button
                  type="button"
                  onClick={() => {
                    navigate('/platform/profile');
                    if (showBottomNav) setSidebarOpen(false);
                  }}
                  style={{ 
                    width: '100%',
                    padding: isMobile ? '10px 14px' : '12px 16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px',
                    borderRadius: '16px',
                    border: `1px solid ${location.pathname === '/platform/profile' ? 'color-mix(in srgb, var(--accent-foreground) 40%, transparent)' : 'color-mix(in srgb, var(--accent-foreground) 16%, transparent)'}`,
                    backgroundColor: location.pathname === '/platform/profile' ? 'color-mix(in srgb, var(--accent-foreground) 18%, transparent)' : 'color-mix(in srgb, var(--accent-foreground) 10%, transparent)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                className="platform-hoverable"
                aria-label="Ouvrir mon profil"
                aria-current={location.pathname === '/platform/profile' ? 'page' : undefined}
              >
                {currentUser?.profilePhoto ? (
                  <img 
                    src={currentUser.profilePhoto} 
                    alt="Profile" 
                    style={{ 
                      width: isMobile ? '40px' : '50px', 
                      height: isMobile ? '40px' : '50px', 
                      minWidth: isMobile ? 40 : 50,
                      borderRadius: '50%', 
                      objectFit: 'cover',
                      border: '2px solid #e5e7eb',
                      flexShrink: 0,
                    }} 
                  />
                ) : (
                  <div style={{
                    width: isMobile ? '40px' : '50px',
                    height: isMobile ? '40px' : '50px',
                    minWidth: isMobile ? 40 : 50,
                    flexShrink: 0,
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
              </button>
              </div>
              
              <nav className="platform-sidebar-nav">
                {menuItems.map((item) => {
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
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: isMobile ? 20 : 24 }}
                        aria-hidden
                      >
                        {item.iconChar}
                      </span>
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
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderTop: '1px solid color-mix(in srgb, var(--accent-foreground) 20%, transparent)',
                }}
              >
                <div
                  className="platform-sidebar-stack-actions"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 6,
                    marginLeft: 16,
                    marginRight: 16,
                  }}
                >
                  <Link
                    to="/platform/funds?movement=depot"
                    onClick={() => showBottomNav && setSidebarOpen(false)}
                    className="platform-hoverable platform-action-btn"
                    style={{
                      width: '100%',
                      minHeight: 32,
                      height: 32,
                      padding: '0 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: platformButtonBg,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '13px',
                      lineHeight: 1.2,
                      color: 'white',
                      fontWeight: 500,
                      borderRadius: 8,
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}
                  >
                    <ArrowDown size={16} />
                    Déposer des fonds
                  </Link>
                  <Link
                    to="/platform/funds?movement=retrait"
                    onClick={() => showBottomNav && setSidebarOpen(false)}
                    className="platform-hoverable platform-action-btn"
                    style={{
                      width: '100%',
                      minHeight: 32,
                      height: 32,
                      padding: '0 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: platformSecondaryBg,
                      border: `1px solid color-mix(in srgb, ${platformPrimaryBg} 35%, transparent)`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '13px',
                      lineHeight: 1.2,
                      color: 'var(--secondary-foreground)',
                      fontWeight: 500,
                      borderRadius: 8,
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}
                    aria-label="Retirer des fonds"
                  >
                    <ArrowUp size={16} />
                    Retirer des fonds
                  </Link>
                </div>
              </div>

              {/* Referral block - at bottom of sidebar */}
              <div
                style={{
                  flexShrink: 0,
                  padding: isMobile ? '12px 20px' : '16px 20px',
                  borderTop: '1px solid color-mix(in srgb, var(--accent-foreground) 20%, transparent)',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--accent-foreground)',
                }}
              >
                <div style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: 500, color: 'color-mix(in srgb, var(--accent-foreground) 90%, white)', marginBottom: 8, lineHeight: 1.35 }}>
                  Parrainez un ami : jusqu&apos;à 500€ pour vous, et lui aussi à l&apos;inscription
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReferralModalOpen(true);
                    if (showBottomNav) setSidebarOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    fontSize: isMobile ? '13px' : '14px',
                    fontWeight: 500,
                    color: 'var(--accent-foreground)',
                    backgroundColor: 'color-mix(in srgb, var(--accent-foreground) 15%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent-foreground) 25%, transparent)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                  className="platform-hoverable"
                >
                  <HiOutlineShare size={18} />
                  Partager mon invitation
                </button>
              </div>
              </div>
            </>
          )}
        </aside>

        {/* Main Content */}
        <main style={{ 
          flex: 1, 
          display: 'flex',
          flexDirection: 'column',
          paddingTop: `calc(${stickyTopOffset} - 12px)`,
          paddingRight: isPhone ? '12px' : isMobile ? '16px' : '30px',
          paddingLeft: isPhone ? '12px' : isMobile ? '16px' : '30px',
          paddingBottom: showBottomNav ? `${(isPhone ? 12 : 16) + MOBILE_BOTTOM_NAV_HEIGHT}px` : (isPhone ? '16px' : isMobile ? '20px' : '30px'),
          width: isMobile ? '100%' : 'auto',
          minWidth: 0,
          overflowX: 'hidden',
          scrollMarginTop: `calc(var(--client-banner-height, 0px) + var(--platform-header-height, ${headerHeight}px))`, // Account for sticky header height
        }}>
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Outlet />
          </div>
          <footer
            style={{
              flexShrink: 0,
              marginTop: isMobile ? 20 : 28,
              paddingTop: isMobile ? 16 : 20,
              paddingBottom: isMobile ? 4 : 8,
              borderTop: '1px solid color-mix(in srgb, var(--foreground) 12%, transparent)',
            }}
            aria-label="Pied de page — informations légales"
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 10,
                color: 'color-mix(in srgb, var(--foreground) 55%, transparent)',
                textAlign: 'center',
              }}
            >
              Informations légales
            </div>
            <LegalFooterLinks variant="default" layout={isMobile ? 'column' : 'row'} />
          </footer>
        </main>
      </div>

      {/* Referral share modal */}
      {referralModalOpen && (
        <div className="modal-overlay" onClick={() => setReferralModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '28rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">Partager mon invitation</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => setReferralModalOpen(false)}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <p style={{ fontSize: 14, color: '#6b7280' }}>
                Partagez ce lien avec un ami. Vous recevrez jusqu&apos;à 500€ et lui aussi à l&apos;inscription.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  readOnly
                  value={typeof window !== 'undefined' && currentUser?.id ? `${window.location.origin}/invite/${currentUser.id}` : ''}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={async () => {
                    const url = typeof window !== 'undefined' && currentUser?.id ? `${window.location.origin}/invite/${currentUser.id}` : '';
                    if (url) {
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success('Lien copié !');
                      } catch {
                        toast.error('Impossible de copier le lien');
                      }
                    }
                  }}
                  title="Copier le lien"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            padding: isPhone ? '6px 6px 10px' : '8px 8px 12px',
          }}
          aria-label="Navigation mobile"
        >
          {bottomNavMenuItems.map((item) => {
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
                  padding: isPhone ? '6px 2px' : '8px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: isPhone ? '2px' : '4px',
                  color: isActive ? '#111827' : '#6b7280',
                  minWidth: 0,
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: isPhone ? 20 : 22 }}
                  aria-hidden
                >
                  {item.iconChar}
                </span>
                <span
                  style={{
                    fontSize: isPhone ? '10px' : '11px',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    wordBreak: 'keep-all',
                    overflowWrap: 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                    display: 'block',
                  }}
                >
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
