import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { User } from '../types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usersData = await api.get('/api/users');
      setUsers(usersData.data.users || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erreur lors du chargement des utilisateurs');
      setError(error);
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const deleteUser = useCallback(async (userId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
    
    try {
      await api.delete(`/api/users/${userId}/`);
      await loadUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      throw err;
    }
  }, [loadUsers]);

  const toggleUserActive = useCallback(async (userId: string) => {
    try {
      await api.post(`/api/users/${userId}/toggle-active/`);
      await loadUsers();
    } catch (err) {
      console.error('Error toggling user status:', err);
      throw err;
    }
  }, [loadUsers]);

  return { users, loading, error, refetch: loadUsers, deleteUser, toggleUserActive };
}

