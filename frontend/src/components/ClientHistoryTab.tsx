import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { apiCall } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

interface ClientHistoryTabProps {
  clientId: string;
}

interface HistoryLog {
  id: string;
  eventType: string;
  userId: string | null;
  userName: string | null;
  createdAt: string;
  details: any;
  oldValue: any;
  newValue: any;
}

const EVENT_TYPE_LABELS: { [key: string]: string } = {
  createClient: 'Création du client',
  editClient: 'Modification du client',
  createTransaction: 'Création de transaction',
  editTransaction: 'Modification de transaction',
  createUser: 'Création d\'utilisateur',
  editUser: 'Modification d\'utilisateur',
  createTeam: 'Création d\'équipe',
  editTeam: 'Modification d\'équipe',
  deleteTeam: 'Suppression d\'équipe',
  deleteUser: 'Suppression d\'utilisateur',
  resetPassword: 'Réinitialisation du mot de passe',
  createUsefulLink: 'Création de lien utile',
  editUsefulLink: 'Modification de lien utile',
  deleteUsefulLink: 'Suppression de lien utile',
};

export function ClientHistoryTab({ clientId }: ClientHistoryTabProps) {
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 });

  useEffect(() => {
    loadHistory();
  }, [clientId]);

  async function loadHistory(page: number = 1) {
    try {
      setLoading(true);
      const data = await apiCall(`/api/clients/${clientId}/history/?page=${page}&limit=50`);
      setHistory((data as any).history || []);
      if ((data as any).pagination) {
        setPagination((data as any).pagination);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatEventType(eventType: string): string {
    return EVENT_TYPE_LABELS[eventType] || eventType;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderDetails(log: HistoryLog) {
    if (log.eventType === 'editClient' && log.newValue?.changed_fields) {
      return (
        <div className="text-sm text-slate-600">
          Champs modifiés: {log.newValue.changed_fields.join(', ')}
        </div>
      );
    }
    
    if (log.eventType === 'createTransaction' || log.eventType === 'editTransaction') {
      const transactionData = log.newValue || log.oldValue;
      if (transactionData) {
        return (
          <div className="text-sm text-slate-600">
            {transactionData.type && <div>Type: {transactionData.type}</div>}
            {transactionData.amount && <div>Montant: {transactionData.amount} €</div>}
            {transactionData.status && <div>Statut: {transactionData.status}</div>}
          </div>
        );
      }
    }

    if (log.eventType === 'createClient' && log.newValue) {
      return (
        <div className="text-sm text-slate-600">
          {log.newValue.firstName && log.newValue.lastName && (
            <div>Nom: {log.newValue.firstName} {log.newValue.lastName}</div>
          )}
          {log.newValue.email && <div>Email: {log.newValue.email}</div>}
        </div>
      );
    }

    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historique des actions</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <LoadingIndicator />
            <p className="mt-4 text-slate-600">Chargement de l'historique...</p>
          </div>
        ) : history.length > 0 ? (
          <>
            <div className="space-y-3">
              {history.map((log) => (
                <div key={log.id} className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        {formatEventType(log.eventType)}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">
                        {formatDate(log.createdAt)}
                      </div>
                      {log.userName && (
                        <div className="text-sm text-slate-600 mt-1">
                          Par: {log.userName}
                        </div>
                      )}
                    </div>
                  </div>
                  {renderDetails(log)}
                </div>
              ))}
            </div>
            
            {pagination.total_pages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadHistory(pagination.page - 1)}
                  disabled={pagination.page === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Précédent
                </Button>
                <span className="text-sm text-slate-600">
                  Page {pagination.page} sur {pagination.total_pages} ({pagination.total} entrées)
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadHistory(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                >
                  Suivant
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Aucun historique disponible</p>
        )}
      </CardContent>
    </Card>
  );
}
