import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { DateInputWithCalendar } from './ui/date-input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { apiCall } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import '../styles/PageHeader.css';

interface PlatformLog {
  id: string;
  actionType: string;
  actionDetails: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  clientId: string;
  clientDisplayName?: string;
}

const ACTION_TYPE_LABELS: { [key: string]: string } = {
  login: 'Connexion',
  logout: 'Déconnexion',
  page_view: 'Consultation de page',
  click: 'Clic',
  form_submit: 'Soumission de formulaire',
  password_reset: 'Réinitialisation mot de passe',
  otp_login_requested: 'Demande connexion OTP',
};

const ACTION_TYPE_OPTIONS = [
  { value: 'all', label: 'Toutes les actions' },
  { value: 'login', label: 'Connexion' },
  { value: 'logout', label: 'Déconnexion' },
  { value: 'page_view', label: 'Consultation de page' },
  { value: 'click', label: 'Clic' },
  { value: 'form_submit', label: 'Soumission de formulaire' },
  { value: 'password_reset', label: 'Réinitialisation mot de passe' },
  { value: 'otp_login_requested', label: 'Demande connexion OTP' },
];

function getTodayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function PlatformLogs() {
  const [platformLogs, setPlatformLogs] = useState<PlatformLog[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 });
  const [filters, setFilters] = useState({
    clientId: 'all',
    actionType: 'login',
    dateFrom: getTodayISO(),
    dateTo: getTodayISO(),
  });

  const loadClients = useCallback(async () => {
    try {
      const data: any = await apiCall('/api/clients/');
      setClients(data.clients || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  }, []);

  const loadPlatformLogs = useCallback(async (page: number = 1, filterOverrides?: typeof filters) => {
    const f = filterOverrides ?? filters;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '50');
      if (f.clientId && f.clientId !== 'all') {
        params.set('client_id', f.clientId);
      }
      if (f.actionType && f.actionType !== 'all') {
        params.set('action_type', f.actionType);
      }
      if (f.dateFrom) {
        params.set('date_from', f.dateFrom);
      }
      if (f.dateTo) {
        params.set('date_to', f.dateTo);
      }
      const data = await apiCall(`/api/platform-logs/?${params.toString()}`);
      const logs = (data as any).platformLogs || [];
      setPlatformLogs(logs);
      if ((data as any).pagination) {
        setPagination((data as any).pagination);
      }
    } catch (error: any) {
      console.error('Error loading platform logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    loadPlatformLogs(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      second: '2-digit',
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
          log.clientDisplayName ||
          "l'utilisateur";
        return `Connexion de ${actorName} le ${date} à ${time}`;
      }
      return `Connexion le ${date} à ${time}`;
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
      if (log.actionDetails.route) details.push(`Route: ${log.actionDetails.route}`);
      if (log.actionDetails.page) details.push(`Page: ${log.actionDetails.page}`);
    }
    if (log.actionType === 'click') {
      if (log.actionDetails.element) details.push(`Élément: ${log.actionDetails.element}`);
      if (log.actionDetails.productId) details.push(`Produit ID: ${log.actionDetails.productId}`);
      if (log.actionDetails.assetId) details.push(`Actif ID: ${log.actionDetails.assetId}`);
    }
    if (log.actionType === 'form_submit') {
      if (log.actionDetails.form) details.push(`Formulaire: ${log.actionDetails.form}`);
      if (log.actionDetails.step) details.push(`Étape: ${log.actionDetails.step}`);
    }
    if (details.length > 0) return details.join(' | ');
    return JSON.stringify(log.actionDetails);
  }

  function applyFilters() {
    loadPlatformLogs(1, filters);
  }

  return (
    <div className="space-y-6">
      <div className="page-header-section">
        <h1 className="page-title">Logs plateforme</h1>
        <p className="page-subtitle">Activité de tous les clients sur la plateforme</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select
                value={filters.clientId}
                onValueChange={(v) => setFilters((f) => ({ ...f, clientId: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les clients</SelectItem>
                  {clients.map((c) => {
                    const name = `${(c.fname || '').trim()} ${(c.lname || '').trim()}`.trim() || c.email || c.id;
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type d&apos;action</Label>
              <Select
                value={filters.actionType}
                onValueChange={(v) => setFilters((f) => ({ ...f, actionType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date de début</Label>
              <DateInputWithCalendar
                value={filters.dateFrom}
                onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Date de fin</Label>
              <DateInputWithCalendar
                value={filters.dateTo}
                onChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))}
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={applyFilters} className="rounded-md">Appliquer les filtres</Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
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
                      <TableHead className="w-[180px]">Client</TableHead>
                      <TableHead className="w-[280px]">Action</TableHead>
                      <TableHead>Détails</TableHead>
                      <TableHead className="w-[140px]">IP</TableHead>
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
                          <TableCell className="text-sm text-slate-700">
                            {log.clientDisplayName || log.clientId || '-'}
                          </TableCell>
                          <TableCell className="font-medium text-slate-900 text-sm">
                            {getActionLabel(log)}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            <span className="block max-w-[400px] truncate" title={detailsSummary}>
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
                    onClick={() => loadPlatformLogs(pagination.page - 1, filters)}
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
                    onClick={() => loadPlatformLogs(pagination.page + 1, filters)}
                    disabled={pagination.page >= pagination.total_pages}
                  >
                    Suivant
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Aucun log plateforme pour les filtres sélectionnés</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
