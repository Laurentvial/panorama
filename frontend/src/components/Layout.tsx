import React from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useUser } from '../contexts/UserContext';
import '../styles/Layout.css';

interface LayoutProps {
  children?: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { currentUser, loading } = useUser();
  const location = useLocation();

  // Map route paths to sidebar page IDs
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === '/admin' || path === '/admin/dashboard') return 'dashboard';
    if (path === '/admin/users') return 'users-teams';
    if (path === '/admin/clients') return 'clients';
    if (path === '/admin/planning') return 'planning';
    if (path === '/admin/transactions') return 'transactions';
    if (path === '/admin/messagerie') return 'messagerie';
    if (path === '/admin/produits-investissements' || path.startsWith('/admin/produits-investissements/')) return 'placements';
    if (path === '/admin/placements') return 'placements'; // Legacy support
    if (path === '/admin/manage/ribs') return 'manage-ribs';
    if (path === '/admin/manage/assets') return 'manage-assets';
    if (path === '/admin/manage/useful-links') return 'manage-links';
    if (path === '/admin/manage/news') return 'manage-news';
    if (path === '/admin/settings') return 'settings';
    return 'dashboard';
  };

  const handleNavigate = (page: string) => {
    // Sidebar will handle navigation using useNavigate internally
    // This is just a placeholder for the onNavigate prop
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="layout-container">
      <Header user={currentUser} />
      <div style={{ display: 'flex' }}>
        <Sidebar 
          currentPage={getCurrentPage()} 
          onNavigate={handleNavigate} 
          userRole={currentUser?.role || 'admin'} 
        />
        <div className="layout-content">
          {children}
        </div>
      </div>
    </div>
  );
}

