import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { usePlatformSearch } from '../contexts/PlatformSearchContext';
import { useTheme } from '../contexts/ThemeContext';
import { signOut } from '../utils/auth';
import { Home, Wallet, TrendingUp, LogOut, User, Compass, Search, Menu, X } from '../utils/iconMapping';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { CookieBanner } from './CookieBanner';
import { useIsMobile } from './ui/use-mobile';

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export function PlatformLayout({ children }: PlatformLayoutProps) {
  const { currentUser } = useUser();
  const { searchTerm, setSearchTerm } = usePlatformSearch();
  const { settings } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: Home, path: '/platform' },
    { id: 'portfolio', label: 'Portefeuille', icon: Wallet, path: '/platform/portfolio' },
    { id: 'trading', label: 'Trading', icon: TrendingUp, path: '/platform/trading' },
    { id: 'discover', label: 'Découvrir', icon: Compass, path: '/platform/discover' },
  ];

  const handleMenuClick = (path: string) => {
    navigate(path);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
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
        zIndex: 100,
      }}>
        {/* Mobile Menu Button */}
        {isMobile && (
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
          display: isMobile && sidebarOpen ? 'none' : 'block',
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
          {!isMobile && (
            <Button variant="outline" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LogOut size={16} />
              Déconnexion
            </Button>
          )}
          {isMobile && (
            <Button variant="outline" onClick={handleLogout} style={{ padding: '8px', minWidth: '40px', height: '40px' }}>
              <LogOut size={18} />
            </Button>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', position: 'relative' }}>
        {/* Mobile Sidebar Overlay */}
        {isMobile && sidebarOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999,
            }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside style={{
          width: isMobile ? (sidebarOpen ? '280px' : '0') : '500px',
          backgroundColor: 'white',
          borderRight: '1px solid #e5e7eb',
          minHeight: 'calc(100vh - 60px)',
          padding: isMobile ? (sidebarOpen ? '20px 0' : '0') : '20px 0',
          position: isMobile ? 'fixed' : 'relative',
          left: isMobile ? (sidebarOpen ? '0' : '-280px') : '0',
          top: isMobile ? '60px' : '0',
          bottom: 0,
          zIndex: 10,
          transition: 'left 0.3s ease, width 0.3s ease',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {/* Logo */}
          {(sidebarOpen || !isMobile) && (
            <>
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
                  <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', margin: 0 }}>Panorama</h1>
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
            </>
          )}
        </aside>

        {/* Main Content */}
        <main style={{ 
          flex: 1, 
          padding: isMobile ? '16px' : '30px',
          width: isMobile ? '100%' : 'auto',
          minWidth: 0,
        }}>
          {children}
        </main>
      </div>
      
      {/* Cookie Banner */}
      <CookieBanner />
    </div>
  );
}
