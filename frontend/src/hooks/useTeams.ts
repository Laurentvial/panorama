import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { Team } from '../types';

interface UseTeamsOptions {
  autoLoad?: boolean;
}

export function useTeams(options: UseTeamsOptions = { autoLoad: true }) {
  const { autoLoad = true } = options;
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/teams');
      setTeams(response.data?.teams || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erreur lors du chargement des équipes');
      setError(error);
      console.error('Error loading teams:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      loadTeams();
    }
  }, [autoLoad, loadTeams]);

  return { teams, loading, error, refetch: loadTeams };
}

