import React, { useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { ManagerChatWidget } from './ManagerChatWidget';
import { logPlatformAction } from '../utils/platformLogger';
import '../styles/PlatformPortfolio.css';

export function PlatformMessagingPage() {
  const { currentUser } = useUser();

  useEffect(() => {
    if (!currentUser?.id) return;
    logPlatformAction('page_view', { route: '/platform/messaging', page: 'messaging' });
  }, [currentUser?.id]);

  return (
    <div
      className="platform-portfolioPage platform-messagingPage"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      <h1 className="platform-portfolioPageTitle" style={{ flexShrink: 0 }}>
        Messagerie
      </h1>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ManagerChatWidget variant="page" bottomOffsetPx={0} />
      </div>
    </div>
  );
}
