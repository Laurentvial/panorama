import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { apiCall } from '../utils/api';
import { 
  HiOutlineViewGrid as LayoutDashboard,
  HiOutlineUserGroup as Users,
  HiOutlineUserCircle as UserCircle,
  HiOutlineCreditCard as CreditCard,
  HiOutlineClipboardList as ClipboardList,
  HiOutlineMail as Mail,
  HiOutlineTrendingUp as TrendingUp,
  HiOutlineChartPie as ChartPie,
  HiOutlineCube as Package,
  HiOutlineLink as LinkIcon,
  HiOutlineCog as SettingsIcon,
  HiOutlineNewspaper as Newspaper
} from 'react-icons/hi';
import { FaBitcoin } from 'react-icons/fa';
import { Wallet } from '../utils/iconMapping';
import '../styles/Sidebar.css';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userRole: string;
}

const menuGroups = [
  {
    label: 'Principal',
    items: [
      { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin' },
      { id: 'clients',      label: 'Clients',      icon: UserCircle,      roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/clients' },
      { id: 'transactions', label: 'Transactions', icon: CreditCard,      roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/transactions' },
      { id: 'positions',    label: 'Positions',    icon: ChartPie,        roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/positions' },
      { id: 'messagerie',   label: 'Messagerie',   icon: Mail,            roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/messagerie' },
    ],
  },
  {
    label: 'Gestion',
    items: [
      { id: 'manage-assets',   label: 'Actifs externes',          icon: TrendingUp,  roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/manage/assets' },
      { id: 'placements',      label: 'Produits financiers',       icon: Package,     roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/produits-investissements' },
      { id: 'manage-ribs',     label: 'RIBs',                     icon: Wallet,      roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/manage/ribs' },
      { id: 'manage-wallets',  label: 'Wallets',                  icon: FaBitcoin,   roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/manage/wallets' },
      { id: 'manage-links',    label: 'Liens utiles',             icon: LinkIcon,    roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/manage/useful-links' },
      { id: 'manage-news',     label: 'Actualités',               icon: Newspaper,   roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/manage/news' },
      { id: 'platform-logs',   label: 'Logs plateforme',          icon: ClipboardList, roles: ['admin', 'teamleader', 'gestionnaire'], path: '/admin/platform-logs' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'users-teams', label: 'Utilisateurs / Équipes', icon: Users,       roles: ['admin', 'teamleader'], path: '/admin/users' },
      { id: 'settings',    label: 'Paramètres',             icon: SettingsIcon, roles: ['admin'],              path: '/admin/settings' },
    ],
  },
];

const validRoles = ['admin', 'teamleader', 'gestionnaire'];

const routePrefetchMap: Record<string, () => Promise<any>> = {
  '/admin': () => import('../components/Dashboard'),
  '/admin/clients': () => import('../components/Clients'),
  '/admin/transactions': () => import('../components/Transactions').then(m => ({ default: m.Transactions })),
  '/admin/platform-logs': () => import('../components/PlatformLogs').then(m => ({ default: m.PlatformLogs })),
  '/admin/positions': () => import('../components/Positions').then(m => ({ default: m.Positions })),
  '/admin/messagerie': () => import('../components/Messagerie').then(m => ({ default: m.Messagerie })),
  '/admin/manage/assets': () => import('../components/ManageAssets').then(m => ({ default: m.ManageAssets })),
  '/admin/produits-investissements': () => import('../components/ProduitsInvestissements').then(m => ({ default: m.ProduitsInvestissements })),
  '/admin/manage/ribs': () => import('../components/ManageRibs').then(m => ({ default: m.ManageRibs })),
  '/admin/manage/wallets': () => import('../components/ManageWallets').then(m => ({ default: m.ManageWallets })),
  '/admin/manage/useful-links': () => import('../components/ManageUsefulLinks').then(m => ({ default: m.ManageUsefulLinks })),
  '/admin/manage/news': () => import('../components/ManageNews').then(m => ({ default: m.ManageNews })),
  '/admin/settings': () => import('../components/Settings').then(m => ({ default: m.Settings })),
  '/admin/users': () => import('../components/UsersTeams'),
};

function Sidebar({ currentPage, onNavigate, userRole }: SidebarProps) {
  const location = useLocation();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const fetchUnreadMessagesCount = useCallback(async () => {
    try {
      const data = await apiCall(`/api/notifications/unread-messages-count/?_=${Date.now()}`) as { unreadCount?: number };
      setUnreadMessagesCount(data?.unreadCount ?? 0);
    } catch {
      setUnreadMessagesCount(0);
    }
  }, []);

  useEffect(() => { fetchUnreadMessagesCount(); }, [fetchUnreadMessagesCount]);
  useEffect(() => {
    const interval = setInterval(fetchUnreadMessagesCount, 10000);
    return () => clearInterval(interval);
  }, [fetchUnreadMessagesCount]);

  const normalizedUserRole = useMemo(() => userRole?.toLowerCase()?.trim() || '', [userRole]);
  const isValidRole = useMemo(() => validRoles.includes(normalizedUserRole), [normalizedUserRole]);

  const visibleGroups = useMemo(() => {
    return menuGroups.map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (!isValidRole) return true;
        return item.roles.some(r => r.toLowerCase() === normalizedUserRole);
      }),
    })).filter(group => group.items.length > 0);
  }, [normalizedUserRole, isValidRole]);

  const handlePrefetch = useCallback((path: string) => {
    routePrefetchMap[path]?.()?.catch(() => {});
  }, []);

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {visibleGroups.map((group, gi) => (
          <div key={gi} className="sidebar-group">
            <p className="sidebar-group-label">{group.label}</p>
            {group.items.map(item => {
              const Icon = item.icon as React.ComponentType<{ className?: string }>;
              const isActive = location.pathname === item.path || currentPage === item.id;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`sidebar-item${isActive ? ' sidebar-item--active' : ''}`}
                  onMouseEnter={() => handlePrefetch(item.path)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="sidebar-item-icon" />
                  <span className="sidebar-item-label">{item.label}</span>
                  {item.id === 'messagerie' && unreadMessagesCount > 0 && (
                    <span className="sidebar-badge" aria-label={`${unreadMessagesCount} non lu(s)`}>
                      {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export default React.memo(Sidebar);
