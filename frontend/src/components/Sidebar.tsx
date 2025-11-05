import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  UserCircle, 
  CreditCard, 
  Mail, 
  TrendingUp,
  Package
} from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userRole: string;
}

export function Sidebar({ currentPage, onNavigate, userRole }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teamLeader', 'gestionnaire'], path: '/' },
    { id: 'planning', label: 'Planning', icon: Calendar, roles: ['admin', 'teamLeader', 'gestionnaire'], path: '/planning' },
    { id: 'users-teams', label: 'Utilisateurs / Équipes', icon: Users, roles: ['admin'], path: '/users' },
    { id: 'clients', label: 'Clients', icon: UserCircle, roles: ['admin', 'teamLeader', 'gestionnaire'], path: '/clients' },
    { id: 'transactions', label: 'Transactions', icon: CreditCard, roles: ['admin', 'teamLeader', 'gestionnaire'], path: '/transactions' },
    { id: 'messagerie', label: 'Messagerie', icon: Mail, roles: ['admin', 'teamLeader', 'gestionnaire'], path: '/messagerie' },
    { id: 'placements', label: 'Placements', icon: Package, roles: ['admin'], path: '/placements' },
  ];

  // Normalize user role for comparison
  const normalizedUserRole = userRole?.toLowerCase()?.trim();
  
  let visibleItems = menuItems.filter(item => {
    if (!normalizedUserRole || normalizedUserRole === '0') return false;
    return item.roles.some(role => role.toLowerCase() === normalizedUserRole);
  });
  
  // Fallback: if no items match, show all items (for debugging)
  // Remove this in production if you want strict role-based filtering
  if (visibleItems.length === 0 && normalizedUserRole) {
    console.warn('Aucun élément de menu visible pour le rôle:', userRole);
    // Temporary: show all items if role doesn't match (for debugging)
    // visibleItems = menuItems;
  }
  
  // If role is '0' or undefined, show all items as fallback
  if (!normalizedUserRole || normalizedUserRole === '0') {
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
    <aside className="w-64 bg-white border-r border-slate-200 min-h-[calc(100vh-73px)]">
      <nav className="p-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || currentPage === item.id;
          
          return (
            <Button
              key={item.id}
              variant={isActive ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => handleNavigation(item)}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.label}
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;