import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { apiCall } from '../utils/api';
import {
  getPlatformLogActorKind,
  getPlatformLogOriginPresentation,
} from '../utils/platformLogOrigin';
import LoadingIndicator from './LoadingIndicator';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import '../styles/PlatformLogOrigin.css';

interface ClientPlatformLogsTabProps {
  clientId: string;
  refreshToken?: number;
}

interface PlatformLog {
  id: string;
  actionType: string;
  origin?: string | null;
  actionDetails: any;
  ipAddress: string | null;
  userAgent: string | null;
  device?: string | null;
  os?: string | null;
  createdAt: string;
  clientId: string;
}

type PlatformLogFilter = 'client' | 'conseiller' | 'all';

const ACTION_TYPE_LABELS: { [key: string]: string } = {
  login: 'Connexion',
  logout: 'Déconnexion',
  page_view: 'Consultation de page',
  click: 'Clic',
  form_submit: 'Soumission de formulaire',
};

function normalizeRouteToPath(route: unknown): string {
  if (!route) return '';
  const raw = String(route).trim();
  if (!raw) return '';
  try {
    const baseOrigin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost';
    const u = new URL(raw, baseOrigin);
    return u.pathname;
  } catch {
    const pathOnly = raw.split('?')[0]?.split('#')[0] ?? raw;
    return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  }
}

function getFriendlyPageNameFromRoute(route: unknown): string {
  const path = normalizeRouteToPath(route);
  if (!path) return '';

  const EXACT: Record<string, string> = {
    '/login': 'Connexion client',
    '/login/otp': 'Connexion OTP',
    '/forgot-password': 'Mot de passe oublié',
    '/reset-password': 'Réinitialisation mot de passe',
    '/platform': 'Tableau de bord',
    '/platform/portfolio': 'Mon portefeuille',
    '/platform/transactions': 'Transactions',
    '/platform/positions': 'Mes positions',
    '/platform/messaging': 'Messagerie',
    '/platform/funds': 'Mon solde',
    '/platform/discover': 'Découvrir',
    '/platform/useful-links': 'Liens utiles',
    '/platform/profile': 'Profil',
    '/platform/verification': 'Vérification du compte',
    '/platform/transfert-propriete': 'Transfert de propriété',
  };

  if (EXACT[path]) return EXACT[path];

  if (/^\/platform\/product\/[^/]+$/.test(path)) return 'Détail produit';
  if (/^\/invite\/[^/]+$/.test(path)) return 'Invitation';
  if (/^\/legal\/[^/]+$/.test(path)) return 'Document légal';

  return '';
}

export function ClientPlatformLogsTab({ clientId, refreshToken = 0 }: ClientPlatformLogsTabProps) {
  const [platformLogs, setPlatformLogs] = useState<PlatformLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 });
  const [clientDisplayName, setClientDisplayName] = useState<string>('');
  const [actorFilter, setActorFilter] = useState<PlatformLogFilter>('client');

  useEffect(() => {
    loadPlatformLogs();
    loadClientDisplayName();
  }, [clientId, refreshToken]);

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
      if (log.origin === 'crm_impersonation' || log.actionDetails?.source === 'crm_impersonation') {
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
      log.actionType === 'login' &&
      (log.origin === 'crm_impersonation' || log.actionDetails?.source === 'crm_impersonation');
    if (isCrmImpersonationLogin) {
      return '-';
    }

    const details: string[] = [];
    
    if (log.actionType === 'page_view') {
      const friendly =
        log.actionDetails.page ||
        getFriendlyPageNameFromRoute(log.actionDetails.route) ||
        getFriendlyPageNameFromRoute(log.actionDetails.url);
      const url = log.actionDetails.route || log.actionDetails.url;
      if (friendly) details.push(`Page: ${friendly}`);
      if (log.actionDetails.productName) details.push(`Produit: ${log.actionDetails.productName}`);
      if (log.actionDetails.assetName) details.push(`Actif: ${log.actionDetails.assetName}`);
      if (url) details.push(`URL: ${url}`);
    }
    
    if (log.actionType === 'click') {
      if (log.actionDetails.element) {
        details.push(`Élément: ${log.actionDetails.element}`);
      }
      if (log.actionDetails.movement === 'depot' || log.actionDetails.movement === 'retrait') {
        details.push(`Onglet: ${log.actionDetails.movement === 'depot' ? 'Dépôt' : 'Retrait'}`);
      }
      if (log.actionDetails.productId) {
        details.push(`Produit ID: ${log.actionDetails.productId}`);
      }
      if (log.actionDetails.assetId) {
        details.push(`Actif ID: ${log.actionDetails.assetId}`);
      }
    }
    
    if (log.actionType === 'form_submit') {
      if (log.actionDetails.form === 'funds_withdraw_intent') {
        const step = log.actionDetails.step;
        const stepShort =
          step === 'withdraw_dialog_opened'
            ? 'RIB à compléter'
            : step === 'withdraw_request_created'
              ? 'enregistrée'
              : step === 'withdraw_submit_failed'
                ? 'échec'
                : step || '';
        const amt =
          log.actionDetails.amount != null && log.actionDetails.accountCurrency
            ? `${log.actionDetails.amount} ${log.actionDetails.accountCurrency}`
            : log.actionDetails.amount != null
              ? String(log.actionDetails.amount)
              : '';
        const dispo =
          step === 'withdraw_dialog_opened' &&
          (log.actionDetails.withdrawableFundsAtIntent || log.actionDetails.withdrawableFundsSnapshot != null)
            ? `solde indica. ${log.actionDetails.withdrawableFundsAtIntent ?? log.actionDetails.withdrawableFundsSnapshot}`
            : '';
        const err = log.actionDetails.error ? String(log.actionDetails.error) : '';
        const bits = ['Demande de retrait', stepShort, amt, dispo].filter(Boolean);
        if (step === 'withdraw_submit_failed' && err) bits.push(err);
        details.push(bits.join(' · '));
      } else if (log.actionDetails.form === 'funds_deposit_intent') {
        const step = log.actionDetails.step;
        const stepShort =
          step === 'deposit_transfer_dialog_opened'
            ? 'suite (virement)'
            : step === 'deposit_card_dialog_opened'
              ? 'suite (CB)'
              : step === 'deposit_request_created'
                ? 'enregistrée'
                : step === 'deposit_submit_failed'
                  ? 'échec'
                  : step || '';
        const amt =
          log.actionDetails.amount != null && log.actionDetails.accountCurrency
            ? `${log.actionDetails.amount} ${log.actionDetails.accountCurrency}`
            : log.actionDetails.amount != null
              ? String(log.actionDetails.amount)
              : '';
        const err = log.actionDetails.error ? String(log.actionDetails.error) : '';
        const bits = ['Demande de dépôt', stepShort, amt].filter(Boolean);
        if (step === 'deposit_submit_failed' && err) bits.push(err);
        details.push(bits.join(' · '));
      } else {
        if (log.actionDetails.form) {
          details.push(`Formulaire: ${log.actionDetails.form}`);
        }
        if (log.actionDetails.step) {
          details.push(`Étape: ${log.actionDetails.step}`);
        }
        if (log.actionDetails.form === 'product_subscription') {
          if (log.actionDetails.productName) {
            details.push(`Produit: ${log.actionDetails.productName}`);
          }
          if (log.actionDetails.productId) {
            details.push(`Produit ID: ${log.actionDetails.productId}`);
          }
          if (log.actionDetails.amount != null) {
            details.push(`Montant: ${log.actionDetails.amount}`);
          }
          if (typeof log.actionDetails.success === 'boolean') {
            details.push(log.actionDetails.success ? 'Statut: réussite' : 'Statut: échec');
          }
          if (log.actionDetails.error) {
            details.push(`Erreur: ${log.actionDetails.error}`);
          }
        }
      }
    }

    // Login details are not displayed (method info removed)

    if (details.length > 0) {
      return details.join(' | ');
    }

    return JSON.stringify(log.actionDetails);
  }

  const filteredPlatformLogs = platformLogs.filter((log) => {
    if (actorFilter === 'all') {
      return true;
    }
    const actorKind = getPlatformLogActorKind(log.origin);
    if (actorFilter === 'client') {
      return actorKind === 'client';
    }
    return actorKind === 'gestionnaire';
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="tab-section-title">Logs plateforme</CardTitle>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          La colonne <strong>Origine</strong> utilise d&apos;abord la classification serveur de connexion
          (`client_login`, `otp_login`, `crm_impersonation`) et n&apos;utilise plus l&apos;IP pour
          distinguer conseiller et client.
        </p>
      </CardHeader>
      <CardContent>
        {loading && platformLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <LoadingIndicator />
            <p className="mt-4 text-slate-600">Chargement des logs plateforme...</p>
          </div>
        ) : platformLogs.length > 0 ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Afficher :</span>
              <Button
                type="button"
                size="sm"
                variant={actorFilter === 'all' ? 'default' : 'outline'}
                aria-pressed={actorFilter === 'all'}
                className={
                  actorFilter === 'all'
                    ? 'font-semibold ring-2 ring-slate-300'
                    : 'text-slate-500 border-slate-300 bg-white hover:bg-slate-50'
                }
                onClick={() => setActorFilter('all')}
              >
                Tout
              </Button>
              <Button
                type="button"
                size="sm"
                variant={actorFilter === 'client' ? 'default' : 'outline'}
                aria-pressed={actorFilter === 'client'}
                className={
                  actorFilter === 'client'
                    ? 'font-semibold ring-2 ring-slate-300'
                    : 'text-slate-500 border-slate-300 bg-white hover:bg-slate-50'
                }
                onClick={() => setActorFilter('client')}
              >
                Client
              </Button>
              <Button
                type="button"
                size="sm"
                variant={actorFilter === 'conseiller' ? 'default' : 'outline'}
                aria-pressed={actorFilter === 'conseiller'}
                className={
                  actorFilter === 'conseiller'
                    ? 'font-semibold ring-2 ring-slate-300'
                    : 'text-slate-500 border-slate-300 bg-white hover:bg-slate-50'
                }
                onClick={() => setActorFilter('conseiller')}
              >
                Conseiller
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200 mb-8">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[190px]">Date</TableHead>
                    <TableHead className="w-[340px]">Action</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead className="w-[120px]">Origine</TableHead>
                    <TableHead className="w-[120px]">Appareil</TableHead>
                    <TableHead className="w-[120px]">Système</TableHead>
                    <TableHead className="w-[170px]">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlatformLogs.map((log) => {
                    const detailsSummary = getActionDetailsSummary(log);
                    const originKind = getPlatformLogActorKind(log.origin);
                    const origin = getPlatformLogOriginPresentation(originKind);
                    return (
                      <TableRow key={log.id} className={origin.rowClassName || undefined}>
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
                        <TableCell className="whitespace-nowrap align-middle">
                          <span className={origin.className}>{origin.label}</span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {log.device || '-'}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {log.os || '-'}
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

            {filteredPlatformLogs.length === 0 && (
              <p className="text-sm text-slate-500 mt-3">
                Aucun log trouvé pour le filtre sélectionné.
              </p>
            )}
            
            {pagination.total_pages > 1 && (
              <div className="flex items-center justify-between gap-3 mt-8 pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-600">
                  Page {pagination.page} sur {pagination.total_pages} ({pagination.total} entrées)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadPlatformLogs(pagination.page - 1)}
                    disabled={pagination.page === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Précédent
                  </Button>
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
