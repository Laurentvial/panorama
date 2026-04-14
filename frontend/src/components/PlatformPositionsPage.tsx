import React, { useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { PlatformPortfolioOrdersSection } from './PlatformPortfolioOrdersSection';
import { logPlatformAction } from '../utils/platformLogger';
import '../styles/PlatformPortfolio.css';

export function PlatformPositionsPage() {
  const { currentUser } = useUser();

  useEffect(() => {
    if (!currentUser?.id) return;
    logPlatformAction('page_view', { route: '/platform/positions', page: 'positions' });
  }, [currentUser?.id]);

  return (
    <div className="platform-portfolioPage">
      <h1 className="platform-portfolioPageTitle">Mes positions</h1>
      <PlatformPortfolioOrdersSection />
    </div>
  );
}
