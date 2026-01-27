import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { usePlatformSearch } from '../contexts/PlatformSearchContext';
import { useTheme } from '../contexts/ThemeContext';
import { clientSignOut } from '../utils/auth';
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
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
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
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              paddingLeft: isMobile ? '40px' : '55px',
              paddingRight: isMobile ? '12px' : '20px',
              height: isMobile ? '40px' : '48px',
              fontSize: isMobile ? '14px' : '16px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              width: '100%',
            }}
          />
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
                        backgroundColor: 'white',
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
                        backgroundColor: 'white',
                        borderRight: '1px solid #e5e7eb',
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
                borderTop: '1px solid #e5e7eb',
                borderBottom: '1px solid #e5e7eb',
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
                    color: '#111827',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {currentUser?.fname || currentUser?.firstName || ''} {currentUser?.lname || currentUser?.lastName || ''}
                  </div>
                  {currentUser?.email && (
                    <div style={{ 
                      fontSize: isMobile ? '12px' : '14px', 
                      color: '#6b7280',
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
                      style={{
                        width: '100%',
                        padding: isMobile ? '12px 20px' : '16px 30px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: isMobile ? '12px' : '16px',
                        backgroundColor: isActive ? '#f3f4f6' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: isMobile ? '16px' : '18px',
                        color: isActive ? '#111827' : '#6b7280',
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
                  backgroundColor: 'white',
                  paddingTop: 12,
                  paddingBottom: 12,
                  borderTop: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginLeft: isMobile ? 20 : 30,
                    marginRight: isMobile ? 20 : 30,
                  }}
                >
                  <button
                    onClick={() => handleFundsAction('depot')}
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
                    style={{
                      width: 48,
                      height: 44,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      backgroundColor: platformPrimaryBg,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: isMobile ? '15px' : '16px',
                      color: 'white',
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
                    style={{
                      width: 48,
                      height: 44,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                      border: '1px solid #fecaca',
                      cursor: 'pointer',
                      color: '#ef4444',
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
