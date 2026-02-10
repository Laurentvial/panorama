import React, { useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { 
  HiOutlineViewGrid as LayoutDashboard,
  HiOutlineUserGroup as Users,
  HiOutlineUserCircle as UserCircle,
  HiOutlineCreditCard as CreditCard,
  HiOutlineMail as Mail,
  HiOutlineTrendingUp as TrendingUp,
  HiOutlineChartPie as ChartPie,
  HiOutlineCube as Package,
  HiOutlineLink as LinkIcon,
  HiOutlineCog as SettingsIcon,
  HiOutlineNewspaper as Newspaper
} from 'react-icons/hi';
import { Wallet } from '../utils/iconMapping';
import '../styles/Sidebar.css';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userRole: string;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin' },
  { id: 'clients', label: 'Clients', icon: UserCircle, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/clients' },
  { id: 'transactions', label: 'Transactions', icon: CreditCard, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/transactions' },
  { id: 'positions', label: 'Positions', icon: ChartPie, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/positions' },
  { id: 'messagerie', label: 'Messagerie', icon: Mail, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/messagerie' },
  { id: 'manage-assets', label: 'Actifs externes', icon: TrendingUp, roles: ['admin'], path: '/admin/manage/assets' },
  { id: 'placements', label: 'Produits financiers internes', icon: Package, roles: ['admin'], path: '/admin/produits-investissements' },
  { id: 'manage-ribs', label: 'Gestion RIBs', icon: Wallet, roles: ['admin'], path: '/admin/manage/ribs' },
  { id: 'manage-links', label: 'Gestion Liens Utiles', icon: LinkIcon, roles: ['admin'], path: '/admin/manage/useful-links' },
  { id: 'manage-news', label: 'Gestion Actualités', icon: Newspaper, roles: ['admin'], path: '/admin/manage/news' },
  { id: 'users-teams', label: 'Utilisateurs / Équipes', icon: Users, roles: ['admin'], path: '/admin/users' },
  { id: 'settings', label: 'Paramètres', icon: SettingsIcon, roles: ['admin'], path: '/admin/settings' },
];

const validRoles = ['admin', 'teamleader', 'gestionnaire'];

function Sidebar({ currentPage, onNavigate, userRole }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Memoize normalized user role
  const normalizedUserRole = useMemo(() => userRole?.toLowerCase()?.trim() || '', [userRole]);
  
  // Memoize role validation
  const isValidRole = useMemo(() => validRoles.includes(normalizedUserRole), [normalizedUserRole]);
  
  // Memoize filtered menu items
  const visibleItems = useMemo(() => {
    let filtered = menuItems.filter(item => {
      if (!isValidRole) return false;
      return item.roles.some(role => role.toLowerCase() === normalizedUserRole);
    });
    
    // Fallback: if no items match and we have a valid role, show all items for debugging
    if (filtered.length === 0 && isValidRole) {
      console.warn('Aucun élément de menu visible pour le rôle:', userRole);
      console.warn('Affichage de tous les éléments pour débogage');
      filtered = menuItems;
    }
    
    // If role is invalid or undefined, show all items as fallback
    if (!isValidRole) {
      filtered = menuItems;
    }
    
    return filtered;
  }, [normalizedUserRole, isValidRole, userRole]);

  // Memoize navigation handler
  const handleNavigation = useCallback((item: typeof menuItems[0]) => {
    if (item.path) {
      navigate(item.path);
    } else {
      onNavigate(item.id);
    }
  }, [navigate, onNavigate]);

  // Prefetch route components on hover
  const handleMouseEnter = useCallback((item: typeof menuItems[0]) => {
    if (!item.path) return;
    
    // Map menu item paths to their lazy-loaded component imports
    const routePrefetchMap: Record<string, () => Promise<any>> = {
      '/admin': () => import('../components/Dashboard'),
      '/admin/dashboard': () => import('../components/Dashboard'),
      '/admin/users': () => import('../components/UsersTeams'),
      '/admin/clients': () => import('../components/Clients'),
      '/admin/clients/add': () => import('../components/AddClient'),
      '/admin/transactions': () => import('../components/Transactions').then(m => ({ default: m.Transactions })),
      '/admin/positions': () => import('../components/Positions').then(m => ({ default: m.Positions })),
      '/admin/messagerie': () => import('../components/Messagerie').then(m => ({ default: m.Messagerie })),
      '/admin/manage/assets': () => import('../components/ManageAssets').then(m => ({ default: m.ManageAssets })),
      '/admin/produits-investissements': () => import('../components/ProduitsInvestissements').then(m => ({ default: m.ProduitsInvestissements })),
      '/admin/produits-investissements/add': () => import('../components/AddProduct').then(m => ({ default: m.AddProduct })),
      '/admin/manage/ribs': () => import('../components/ManageRibs').then(m => ({ default: m.ManageRibs })),
      '/admin/manage/useful-links': () => import('../components/ManageUsefulLinks').then(m => ({ default: m.ManageUsefulLinks })),
      '/admin/manage/news': () => import('../components/ManageNews').then(m => ({ default: m.ManageNews })),
      '/admin/settings': () => import('../components/Settings').then(m => ({ default: m.Settings })),
    };

    const prefetchFn = routePrefetchMap[item.path];
    if (prefetchFn) {
      // Prefetch the component module
      prefetchFn().catch(() => {
        // Silently fail if prefetch fails - navigation will still work
      });
    }
  }, []);

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {visibleItems.map((item) => {
          const Icon = item.icon as React.ComponentType<{ className?: string }>;
          const isActive = location.pathname === item.path || currentPage === item.id;
          
          return (
            <div key={item.id} className="sidebar-nav-item">
              <Button
                variant={isActive ? 'default' : 'ghost'}
                className="sidebar-button"
                onClick={() => handleNavigation(item)}
                onMouseEnter={() => handleMouseEnter(item)}
              >
                <Icon className="sidebar-icon" />
                {item.label}
              </Button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export default React.memo(Sidebar);