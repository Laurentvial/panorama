import { useLayoutEffect, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { syncFaviconBadgeAccess } from '../utils/faviconBadge';

export function FaviconBadgeGate() {
  const location = useLocation();
  const { currentUser, loading } = useUser();

  useLayoutEffect(() => {
    syncFaviconBadgeAccess(location.pathname, Boolean(currentUser?.id), loading);
  }, [currentUser?.id, loading, location.pathname]);

  useEffect(() => {
    return () => {
      syncFaviconBadgeAccess('/login', false, false);
    };
  }, []);

  return null;
}
