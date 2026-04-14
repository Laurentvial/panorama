import React, { useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { PlatformPortfolioTransactionsSection } from './PlatformPortfolioTransactionsSection';
import { logPlatformAction } from '../utils/platformLogger';
import '../styles/PlatformPortfolio.css';

export function PlatformTransactionsPage() {
  const { currentUser } = useUser();

  useEffect(() => {
    if (!currentUser?.id) return;
    logPlatformAction('page_view', { route: '/platform/transactions', page: 'transactions' });
  }, [currentUser?.id]);

  return (
    <div className="platform-portfolioPage">
      <h1 className="platform-portfolioPageTitle">Transactions</h1>
      <PlatformPortfolioTransactionsSection />
    </div>
  );
}
