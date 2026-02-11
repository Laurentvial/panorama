import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { apiCall } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

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
  const [clientDisplayName, setClientDisplayName] = useState<string>('');

  useEffect(() => {
    loadPlatformLogs();
    loadClientDisplayName();
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

  async function loadClientDisplayName() {
    try {
      const data: any = await apiCall(`/api/clients/${clientId}/`);
      const client = data?.client || data || {};
      const firstName = (client.fname || client.firstName || '').toString().trim();
      const lastName = (client.lname || client.lastName || '').toString().trim();
      const fullName = `${firstName} ${lastName}`.trim();
      setClientDisplayName(fullName || client.email || clientId);
    } catch {
      setClientDisplayName(clientId);
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

  function formatDateParts(dateString: string): { date: string; time: string } {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      time: date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  }

  function getActionLabel(log: PlatformLog): string {
    if (log.actionType === 'login') {
      const { date, time } = formatDateParts(log.createdAt);
      if (log.actionDetails?.source === 'crm_impersonation') {
        const actorName =
          log.actionDetails?.client_name ||
          log.actionDetails?.clientName ||
          clientDisplayName ||
          "l'utilisateur";
        return `Connexion de ${actorName} le ${date} a ${time}`;
      }
      return `Connexion du client le ${date} a ${time}`;
    }

    return formatActionType(log.actionType);
  }

  function getActionDetailsSummary(log: PlatformLog): string {
    if (!log.actionDetails || Object.keys(log.actionDetails).length === 0) {
      return '-';
    }

    const isCrmImpersonationLogin =
      log.actionType === 'login' && log.actionDetails?.source === 'crm_impersonation';
    if (isCrmImpersonationLogin) {
      return '-';
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

    if (details.length > 0) {
      return details.join(' | ');
    }

    return JSON.stringify(log.actionDetails);
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
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[190px]">Date</TableHead>
                    <TableHead className="w-[340px]">Action</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead className="w-[170px]">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {platformLogs.map((log) => {
                    const detailsSummary = getActionDetailsSummary(log);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 text-sm">
                          {getActionLabel(log)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          <span className="block max-w-[520px] truncate" title={detailsSummary}>
                            {detailsSummary}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {log.ipAddress || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
