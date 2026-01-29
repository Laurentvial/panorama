import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { usePlatformSearch } from '../contexts/PlatformSearchContext';
import { useTheme } from '../contexts/ThemeContext';
import { clientSignOut } from '../utils/auth';
import { apiCall } from '../utils/api';
import { Home, Wallet, DollarSign, LogOut, User, Compass, Search, Menu, X, ArrowDown, ArrowUp } from '../utils/iconMapping';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { CookieBanner } from './CookieBanner';
import { ManagerChatWidget } from './ManagerChatWidget';
import { useIsMobile } from './ui/use-mobile';
import '../styles/PlatformTypography.css';
import '../styles/PlatformButtons.css';
import '../styles/PlatformInputs.css';

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export function PlatformLayout({ children }: PlatformLayoutProps) {
  const MOBILE_BOTTOM_NAV_HEIGHT = 72;
  const BOTTOM_NAV_BREAKPOINT = 1400;
  const { currentUser } = useUser();
  const { searchTerm, setSearchTerm } = usePlatformSearch();
  const { settings, loading: settingsLoading } = useTheme();
  const platformName = !settingsLoading ? (settings?.platform_name || 'Plateforme').trim() : '';
  const platformButtonBg =
    (settings?.secondary_color || '').trim() ||
    (settings?.primary_color || '').trim() ||
    '#030213';
  const platformPrimaryBg = (settings?.primary_color || '').trim() || '#030213';
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showBottomNav, setShowBottomNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productsIndex, setProductsIndex] = useState<any[]>([]);
  const [productsIndexLoading, setProductsIndexLoading] = useState(false);
  const [assetsIndex, setAssetsIndex] = useState<any[]>([]);
  const [assetsIndexLoading, setAssetsIndexLoading] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BOTTOM_NAV_BREAKPOINT}px)`);
    const onChange = () => setShowBottomNav(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // When bottom navigation is active, keep the side menu folded by default.
    if (showBottomNav) {
      setSidebarOpen(false);
    }
  }, [showBottomNav]);

  // Load product index once so the header search can show results.
  useEffect(() => {
    let cancelled = false;

    const loadSearchIndex = async () => {
      try {
        setProductsIndexLoading(true);
        setAssetsIndexLoading(true);

        const [productsRes, assetsRes] = await Promise.all([
          apiCall('/api/products/').catch(() => null),
          apiCall('/api/assets/').catch(() => null),
        ]);

        const productsList = ((productsRes as any)?.products || productsRes || []) as any[];
        const activeProducts = Array.isArray(productsList)
          ? productsList.filter((p: any) => p?.status === 'Actif')
          : [];

        const assetsList = ((assetsRes as any)?.assets || assetsRes || []) as any[];
        const normalizedAssets = Array.isArray(assetsList) ? assetsList : [];

        if (!cancelled) {
          setProductsIndex(activeProducts);
          setAssetsIndex(normalizedAssets);
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
  }, []);

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

  return (
    <div
      className="platform-root"
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--accent)',
        ['--platform-button-bg' as any]: platformButtonBg,
      }}
    >
      {/* Header */}
      <header style={{
        backgroundColor: 'var(--primary)',
        color: 'var(--primary-foreground)',
        borderBottom: '1px solid color-mix(in srgb, var(--primary-foreground) 20%, transparent)',
        padding: isMobile ? '12px 16px' : '15px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: isMobile ? '12px' : '20px',
        position: 'sticky',
        top: 0,
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
              borderRadius: 9999,
              border: '1px solid rgba(255, 255, 255, 0.28)',
              backgroundColor: 'rgba(255, 255, 255, 0.18)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              color: 'var(--primary-foreground)',
              caretColor: 'var(--primary-foreground)',
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
        </div>
      </header>

      <div style={{ display: 'flex', position: 'relative' }}>
        {/* Drawer Overlay (when bottom nav is active) */}
        {showBottomNav && sidebarOpen && (
          <div
            style={{
              position: 'fixed',
              // Don't cover the header; it contains the close (X) button.
              top: '60px',
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
          height: 'calc(100vh - 60px)',
          padding: 0,
          // Keep drawer behavior on mobile bottom nav.
          // On desktop we keep a spacer in flow and render the actual sidebar as fixed,
          // to avoid sticky overflow issues while still reserving layout space.
          position: showBottomNav ? 'fixed' : 'relative',
          left: showBottomNav ? (sidebarOpen ? '0' : '-280px') : '0',
          // Keep the sidebar under the (sticky) header while scrolling.
          top: showBottomNav ? '60px' : '60px',
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
                        color: 'var(--primary-foreground)',
                        borderRight: 'none',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }
                    : {
                        position: 'fixed',
                        top: 60,
                        left: 0,
                        width: 360,
                        height: 'calc(100vh - 60px)',
                        backgroundColor: 'var(--primary)',
                        color: 'var(--primary-foreground)',
                        borderRight: '1px solid color-mix(in srgb, var(--primary-foreground) 20%, transparent)',
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
                  padding: showBottomNav ? (sidebarOpen ? '20px 0' : '0') : '20px 0',
                }}
              >
              <div style={{ 
                padding: isMobile ? '16px 20px' : '00px 30px', 
                marginBottom: '20px', 
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
                          width: isMobile ? '80px' : '200px', 
                          height: isMobile ? '80px' : '100px', 
                          objectFit: 'contain' 
                        }
                      : { 
                          maxHeight: isMobile ? '40px' : '60px', 
                          maxWidth: isMobile ? '150px' : '200px', 
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
                padding: isMobile ? '12px 20px' : '15px 30px', 
                marginBottom: '20px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                borderTop: '1px solid color-mix(in srgb, var(--primary-foreground) 20%, transparent)',
                borderBottom: '1px solid color-mix(in srgb, var(--primary-foreground) 20%, transparent)',
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
                    color: 'var(--primary-foreground)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {currentUser?.fname || currentUser?.firstName || ''} {currentUser?.lname || currentUser?.lastName || ''}
                  </div>
                  {currentUser?.email && (
                    <div style={{ 
                      fontSize: isMobile ? '12px' : '14px', 
                      color: 'color-mix(in srgb, var(--primary-foreground) 75%, transparent)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {currentUser.email}
                    </div>
                  )}
                </div>
              </div>
              
              <nav>
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleMenuClick(item.path)}
                      className="platform-hoverable platform-sidebar-link"
                      data-active={isActive ? 'true' : 'false'}
                      style={{
                        width: '100%',
                        padding: isMobile ? '12px 20px' : '16px 30px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: isMobile ? '12px' : '16px',
                        backgroundColor: isActive
                          ? 'color-mix(in srgb, var(--primary-foreground) 12%, transparent)'
                          : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: isMobile ? '16px' : '18px',
                        color: isActive
                          ? 'var(--primary-foreground)'
                          : 'color-mix(in srgb, var(--primary-foreground) 75%, transparent)',
                        fontWeight: isActive ? '600' : '400',
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
                  color: 'var(--primary-foreground)',
                  paddingTop: 12,
                  paddingBottom: 12,
                  borderTop: '1px solid color-mix(in srgb, var(--primary-foreground) 20%, transparent)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginLeft: isMobile ? 20 : 20,
                    marginRight: isMobile ? 20 : 20,
                  }}
                >
                  <button
                    onClick={() => handleFundsAction('depot')}
                    className="platform-hoverable platform-action-btn"
                    style={{
                      flex: 1,
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
                      width: 55,
                      height: 44,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      backgroundColor: 'white',
                      border: `1px solid color-mix(in srgb, ${platformPrimaryBg} 35%, transparent)`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: isMobile ? '15px' : '16px',
                      color: platformPrimaryBg,
                      fontWeight: 500,
                      borderRadius: 9999,
                      whiteSpace: 'nowrap',
                    }}
                    aria-label="Retrait"
                  >
                    <ArrowUp size={isMobile ? 18 : 20} />
                  </button>

                  <button
                    onClick={async () => {
                      if (showBottomNav) setSidebarOpen(false);
                      await handleLogout();
                    }}
                    className="platform-hoverable platform-action-icon platform-action-logout"
                    style={{
                      width: 55,
                      height: 44,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
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
          paddingTop: isMobile ? '16px' : '30px',
          paddingRight: isMobile ? '16px' : '30px',
          paddingLeft: isMobile ? '16px' : '30px',
          paddingBottom: showBottomNav ? `${16 + MOBILE_BOTTOM_NAV_HEIGHT}px` : '30px',
          width: isMobile ? '100%' : 'auto',
          minWidth: 0,
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
