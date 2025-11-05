import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { Bell, User, LogOut, Building2 } from 'lucide-react';
import api from '../utils/api';
import React from 'react';
import '../styles/Header.css';

interface HeaderProps {
  user: any;
}

export function Header({ user }: HeaderProps) {
  const navigate = useNavigate();

//   const [unreadMessages, setUnreadMessages] = useState(0);

//   useEffect(() => {
//     loadNotifications();
//     const interval = setInterval(loadNotifications, 30000); // Check every 30s
//     return () => clearInterval(interval);
//   }, []);

//   async function loadNotifications() {
//     try {
//       const response = await api.get('/messages');
//       const messages = response.data?.messages || response.data || [];
//       const unread = messages.filter((m: any) => !m.read && m.recipientId === user.id).length;
//       setUnreadMessages(unread);
//     } catch (error) {
//       console.error('Error loading notifications:', error);
//     }
//   }

  function handleLogout() {
    navigate('/logout');
  }

  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-logo">
            </div>
            <div className="header-title-section">
              <h1 className="header-title">P.A.N.O.R.A.M.A</h1>
              <p className="header-subtitle">Gestion CRM & Investissements</p>
            </div>
          </div>
          
          <div className="header-actions">
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="header-button header-button-notifications">
                  <Bell className="header-icon" />
                  {/* {unreadMessages > 0 && (
                    <Badge className="header-badge">
                      {unreadMessages}
                    </Badge>
                  )} */}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="header-dropdown" align="end">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* {unreadMessages > 0 ? (
                  <div className="header-notification-content">
                    Vous avez {unreadMessages} message{unreadMessages > 1 ? 's' : ''} non lu{unreadMessages > 1 ? 's' : ''}
                  </div>
                ) : (
                  <div className="header-notification-empty">
                    Aucune notification
                  </div>
                )} */}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="header-button header-button-user">
                  <User className="header-icon" />
                  <span className="header-user-name">
                    {user?.username || user?.email || ''}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="header-dropdown" align="end">
                <DropdownMenuLabel>
                  <div className="header-user-info">
                    <p className="header-user-name-full">{user?.username || `${user?.email || ''} ${user?.userId || ''}`.trim() || 'User'}</p>
                    <p className="header-user-email">{user?.email}</p>
                    {user?.role && <p className="header-user-role">{user?.role}</p>}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="header-logout">
                  <LogOut className="header-icon" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;