import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { usePlatformSearch } from '../contexts/PlatformSearchContext';
import { useTheme } from '../contexts/ThemeContext';
import { signOut } from '../utils/auth';
import { Home, Wallet, TrendingUp, LogOut, User, Compass, Search } from '../utils/iconMapping';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { CookieBanner } from './CookieBanner';

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export function PlatformLayout({ children }: PlatformLayoutProps) {
  const { currentUser } = useUser();
  const { searchTerm, setSearchTerm } = usePlatformSearch();
  const { settings } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '15px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px',
      }}>
        {/* Search Bar */}
        <div style={{ flex: 1, maxWidth: '600px', position: 'relative' }}>
          <Search className="absolute top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" style={{ pointerEvents: 'none', left: '20px' }} />
          <Input
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              paddingLeft: '55px',
              paddingRight: '20px',
              height: '48px',
              fontSize: '16px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              width: '100%',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4" style={{ marginRight: '8px' }} />
            Déconnexion
          </Button>
        </div>
      </header>

      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <aside style={{
          width: '500px',
          backgroundColor: 'white',
          borderRight: '1px solid #e5e7eb',
          minHeight: 'calc(100vh - 60px)',
          padding: '20px 0',
        }}>
          {/* Logo */}
          <div style={{ padding: '20px 30px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
            {settings?.logo_url ? (
              <img 
                src={settings.logo_url} 
                alt="Logo" 
                style={{ maxHeight: '60px', maxWidth: '200px', objectFit: 'contain' }} 
              />
            ) : (
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Panorama</h1>
            )}
          </div>
          
          {/* User Profile */}
          <div style={{ 
            padding: '15px 30px', 
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
                  width: '50px', 
                  height: '50px', 
                  borderRadius: '50%', 
                  objectFit: 'cover',
                  border: '2px solid #e5e7eb'
                }} 
              />
            ) : (
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                backgroundColor: '#e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #e5e7eb'
              }}>
                <User className="h-6 w-6" style={{ color: '#6b7280' }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontSize: '16px', 
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
                  fontSize: '14px', 
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
                  onClick={() => navigate(item.path)}
                  style={{
                    width: '100%',
                    padding: '16px 30px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    backgroundColor: isActive ? '#f3f4f6' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '18px',
                    color: isActive ? '#111827' : '#6b7280',
                    fontWeight: isActive ? '600' : '400',
                  }}
                >
                  <Icon className="h-6 w-6" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main style={{ flex: 1, padding: '30px' }}>
          {children}
        </main>
      </div>
      
      {/* Cookie Banner */}
      <CookieBanner />
    </div>
  );
}
