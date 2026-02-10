import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { apiCall } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

interface ClientPlatformLogsTabProps {
  clientId: string;
}

interface PlatformLog {
  id: string;
  actionType: string;
  actionDetails: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  clientId: string;
}

const ACTION_TYPE_LABELS: { [key: string]: string } = {
  login: 'Connexion',
  logout: 'Déconnexion',
  page_view: 'Consultation de page',
  click: 'Clic',
  form_submit: 'Soumission de formulaire',
};

export function ClientPlatformLogsTab({ clientId }: ClientPlatformLogsTabProps) {
  const [platformLogs, setPlatformLogs] = useState<PlatformLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 });

  useEffect(() => {
    loadPlatformLogs();
  }, [clientId]);

  async function loadPlatformLogs(page: number = 1) {
    try {
      setLoading(true);
      const data = await apiCall(`/api/clients/${clientId}/platform-logs/?page=${page}&limit=50`);
      const logs = (data as any).platformLogs || [];
      setPlatformLogs(logs);
      if ((data as any).pagination) {
        setPagination((data as any).pagination);
      }
      // Debug: log if no logs found
      if (logs.length === 0 && page === 1) {
        console.debug('No platform logs found for client:', clientId);
      }
    } catch (error: any) {
      console.error('Error loading platform logs:', error);
      // Show error message to user
      if (error?.response?.status === 401) {
        console.error('Authentication error - make sure you are logged in as admin');
      }
    } finally {
      setLoading(false);
    }
  }

  function formatActionType(actionType: string): string {
    return ACTION_TYPE_LABELS[actionType] || actionType;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function renderActionDetails(log: PlatformLog) {
    if (!log.actionDetails || Object.keys(log.actionDetails).length === 0) {
      return null;
    }

    const details: string[] = [];
    
    if (log.actionType === 'page_view') {
      if (log.actionDetails.route) {
        details.push(`Route: ${log.actionDetails.route}`);
      }
      if (log.actionDetails.page) {
        details.push(`Page: ${log.actionDetails.page}`);
      }
    }
    
    if (log.actionType === 'click') {
      if (log.actionDetails.element) {
        details.push(`Élément: ${log.actionDetails.element}`);
      }
      if (log.actionDetails.productId) {
        details.push(`Produit ID: ${log.actionDetails.productId}`);
      }
      if (log.actionDetails.assetId) {
        details.push(`Actif ID: ${log.actionDetails.assetId}`);
      }
    }
    
    if (log.actionType === 'form_submit') {
      if (log.actionDetails.form) {
        details.push(`Formulaire: ${log.actionDetails.form}`);
      }
      if (log.actionDetails.step) {
        details.push(`Étape: ${log.actionDetails.step}`);
      }
    }

    // Login details are not displayed (method info removed)

    if (details.length === 0) {
      return (
        <div className="text-sm text-slate-600 mt-2">
          <pre className="whitespace-pre-wrap text-xs bg-slate-50 p-2 rounded">
            {JSON.stringify(log.actionDetails, null, 2)}
          </pre>
        </div>
      );
    }

    return (
      <div className="text-sm text-slate-600 mt-2 space-y-1">
        {details.map((detail, index) => (
          <div key={index}>{detail}</div>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logs plateforme</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && platformLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <LoadingIndicator />
            <p className="mt-4 text-slate-600">Chargement des logs plateforme...</p>
          </div>
        ) : platformLogs.length > 0 ? (
          <>
            <div className="space-y-3">
              {platformLogs.map((log) => (
                <div key={log.id} className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        {formatActionType(log.actionType)}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">
                        {formatDate(log.createdAt)}
                      </div>
                      {log.ipAddress && (
                        <div className="text-xs text-slate-400 mt-1">
                          IP: {log.ipAddress}
                        </div>
                      )}
                    </div>
                  </div>
                  {renderActionDetails(log)}
                </div>
              ))}
            </div>
            
            {pagination.total_pages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadPlatformLogs(pagination.page - 1)}
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
                  onClick={() => loadPlatformLogs(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                >
                  Suivant
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Aucun log plateforme disponible</p>
        )}
      </CardContent>
    </Card>
  );
}
