import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { 
  HiOutlineViewGrid as LayoutDashboard,
  HiOutlineCalendar as Calendar,
  HiOutlineUserGroup as Users,
  HiOutlineUserCircle as UserCircle,
  HiOutlineCreditCard as CreditCard,
  HiOutlineMail as Mail,
  HiOutlineTrendingUp as TrendingUp,
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

export function Sidebar({ currentPage, onNavigate, userRole }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin' },
    { id: 'planning', label: 'Planning', icon: Calendar, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/planning' },
    { id: 'users-teams', label: 'Utilisateurs / Équipes', icon: Users, roles: ['admin'], path: '/admin/users' },
    { id: 'clients', label: 'Clients', icon: UserCircle, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/clients' },
    { id: 'transactions', label: 'Transactions', icon: CreditCard, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/transactions' },
    { id: 'messagerie', label: 'Messagerie', icon: Mail, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/messagerie' },
    { id: 'manage-assets', label: 'Actifs externes', icon: TrendingUp, roles: ['admin'], path: '/admin/manage/assets' },
    { id: 'placements', label: 'Produits financiers internes', icon: Package, roles: ['admin'], path: '/admin/produits-investissements' },
    { id: 'manage-ribs', label: 'Gestion RIBs', icon: Wallet, roles: ['admin'], path: '/admin/manage/ribs' },
    { id: 'manage-links', label: 'Gestion Liens Utiles', icon: LinkIcon, roles: ['admin'], path: '/admin/manage/useful-links' },
    { id: 'manage-news', label: 'Gestion Actualités', icon: Newspaper, roles: ['admin'], path: '/admin/manage/news' },
    { id: 'settings', label: 'Paramètres', icon: SettingsIcon, roles: ['admin'], path: '/admin/settings' },
  ];

  // Normalize user role for comparison
  // Only accept: admin, teamleader, gestionnaire
  const normalizedUserRole = userRole?.toLowerCase()?.trim() || '';
  const validRoles = ['admin', 'teamleader', 'gestionnaire'];
  const isValidRole = validRoles.includes(normalizedUserRole);
  
  // Filter menu items based on role
  let visibleItems = menuItems.filter(item => {
    if (!isValidRole) return false;
    return item.roles.some(role => role.toLowerCase() === normalizedUserRole);
  });
  
  // Fallback: if no items match and we have a valid role, show all items for debugging
  // This helps identify role matching issues
  if (visibleItems.length === 0 && isValidRole) {
    console.warn('Aucun élément de menu visible pour le rôle:', userRole);
    console.warn('Affichage de tous les éléments pour débogage');
    // Show all items if role doesn't match (for debugging)
    visibleItems = menuItems;
  }
  
  // If role is invalid or undefined, show all items as fallback
  if (!isValidRole) {
    visibleItems = menuItems;
  }

  const handleNavigation = (item: typeof menuItems[0]) => {
    if (item.path) {
      navigate(item.path);
    } else {
      onNavigate(item.id);
    }
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || currentPage === item.id;
          
          return (
            <div key={item.id} className="sidebar-nav-item">
              <Button
                variant={isActive ? 'default' : 'ghost'}
                className="sidebar-button"
                onClick={() => handleNavigation(item)}
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

export default Sidebar;