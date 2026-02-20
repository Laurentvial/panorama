import React from 'react';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useUser } from '../contexts/UserContext';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  /** Roles allowed to access this route (e.g. ['admin'] or ['admin', 'teamleader', 'gestionnaire']) */
  allowedRoles: string[];
}

/**
 * Protects routes by both authentication and role.
 * Users without the required role are redirected to /admin (dashboard).
 */
function RoleProtectedRoute({ children, allowedRoles }: RoleProtectedRouteProps) {
  const { currentUser, loading } = useUser();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Chargement...</div>
      </div>
    );
  }

  const userRole = (currentUser?.role ?? '').toLowerCase().trim();
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase().trim());
  const hasAccess = userRole && normalizedAllowed.includes(userRole);

  if (!hasAccess) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

/**
 * Wrapper that combines ProtectedRoute (auth) + RoleProtectedRoute (role check).
 * Use this for admin routes that require specific roles.
 */
export function AdminRoleProtectedRoute({ children, allowedRoles }: RoleProtectedRouteProps) {
  return (
    <ProtectedRoute>
      <RoleProtectedRoute allowedRoles={allowedRoles}>{children}</RoleProtectedRoute>
    </ProtectedRoute>
  );
}

export default RoleProtectedRoute;
