import React from 'react';
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
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['administrateur', 'chef d\'équipe', 'gestionnaire'] },
    { id: 'planning', label: 'Planning', icon: Calendar, roles: ['administrateur', 'chef d\'équipe', 'gestionnaire'] },
    { id: 'users-teams', label: 'Utilisateurs / Équipes', icon: Users, roles: ['administrateur'] },
    { id: 'clients', label: 'Clients', icon: UserCircle, roles: ['administrateur', 'chef d\'équipe', 'gestionnaire'] },
    { id: 'transactions', label: 'Transactions', icon: CreditCard, roles: ['administrateur', 'chef d\'équipe', 'gestionnaire'] },
    { id: 'messagerie', label: 'Messagerie', icon: Mail, roles: ['administrateur', 'chef d\'équipe', 'gestionnaire'] },
    { id: 'placements', label: 'Placements', icon: Package, roles: ['administrateur'] },
  ];

  const visibleItems = menuItems.filter(item => 
    item.roles.includes(userRole?.toLowerCase())
  );

  return (
    <aside className="w-64 bg-white border-r border-slate-200 min-h-[calc(100vh-73px)]">
      <nav className="p-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <Button
              key={item.id}
              variant={isActive ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => onNavigate(item.id)}
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