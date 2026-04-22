import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { apiCall } from '../utils/api';
import { formatAmount } from '../utils/currency';
import '../styles/PlatformPortfolio.css';

const TRANSACTIONS_PAGE_SIZE = 10;

const clampPage = (page: number, totalPages: number) => Math.min(Math.max(1, page), Math.max(1, totalPages));

export type PlatformPortfolioTransactionsSectionProps = {
  /** Utilisé sur la page Mon portefeuille : pas de requête dédiée, données déjà chargées. */
  embedded?: boolean;
  transactions?: any[];
  transactionDocuments?: Record<string, any[]>;
  unlinkedContractDocuments?: any[];
  parentLoading?: boolean;
};

function formatTransactionStatus(status: string | undefined | null, transactionType?: string) {
  if (!status) return '-';
  const statusLower = String(status).trim().toLowerCase();
  const type = String(transactionType || '').toLowerCase();
  if (statusLower === 'en_cours' && ['bonus', 'transfert', 'interets'].includes(type)) {
    return 'En attente';
  }
  switch (statusLower) {
    case 'valide':
    case 'validé':
      return 'Validé';
    case 'en_cours':
      return 'En cours';
    case 'en_attente_paiement':
      return 'En attente de paiement';
    case 'conteste':
      return 'Contesté';
    case 'annule':
      return 'Annulé';
    default:
      return status;
  }
}

function getStatusColor(status: string | undefined | null) {
  if (!status) return '#6b7280';
  const statusLower = String(status).trim().toLowerCase();
  switch (statusLower) {
    case 'valide':
    case 'validé':
      return '#15803d';
    case 'en_cours':
    case 'en_attente_paiement':
      return '#c2410c';
    case 'conteste':
      return '#991b1b';
    case 'annule':
      return '#6b7280';
    default:
      return '#6b7280';
  }
}

function formatDateTime(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function PlatformPortfolioTransactionsSection({
  embedded,
  transactions: transactionsProp,
  transactionDocuments: transactionDocumentsProp,
  unlinkedContractDocuments: unlinkedProp,
  parentLoading,
}: PlatformPortfolioTransactionsSectionProps) {
  const { currentUser } = useUser();
  const accountCurrency = (
    currentUser?.accountCurrency ||
    currentUser?.account_currency ||
    'EUR'
  )
    .toString()
    .trim()
    .toUpperCase();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionDocuments, setTransactionDocuments] = useState<Record<string, any[]>>({});
  const [unlinkedContractDocuments, setUnlinkedContractDocuments] = useState<any[]>([]);
  const [internalLoading, setInternalLoading] = useState(!embedded);
  const [transactionsPage, setTransactionsPage] = useState(1);

  const effectiveTransactions = embedded ? transactionsProp ?? [] : transactions;
  const effectiveDocs = embedded ? transactionDocumentsProp ?? {} : transactionDocuments;
  const effectiveUnlinked = embedded ? unlinkedProp ?? [] : unlinkedContractDocuments;
  const loading = embedded ? Boolean(parentLoading) : internalLoading;

  const transactionsPagination = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil((effectiveTransactions || []).length / TRANSACTIONS_PAGE_SIZE));
    const safePage = clampPage(transactionsPage, totalPages);
    const start = (safePage - 1) * TRANSACTIONS_PAGE_SIZE;
    return {
      page: safePage,
      totalPages,
      items: (effectiveTransactions || []).slice(start, start + TRANSACTIONS_PAGE_SIZE),
    };
  }, [effectiveTransactions, transactionsPage]);

  useEffect(() => {
    setTransactionsPage((p) =>
      clampPage(p, Math.max(1, Math.ceil((effectiveTransactions || []).length / TRANSACTIONS_PAGE_SIZE)))
    );
  }, [effectiveTransactions.length]);

  useEffect(() => {
    if (embedded || !currentUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        setInternalLoading(true);
        const clientId = currentUser.id;
        const [transactionsResponse, documentsResponse] = await Promise.all([
          apiCall(`/api/clients/${clientId}/transactions/`),
          apiCall(`/api/clients/${clientId}/documents/`).catch(() => ({ documents: [] })),
        ]);
        if (cancelled) return;
        const sortedTransactions = (transactionsResponse.transactions || []).sort(
          (a: any, b: any) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
        );
        const now = Date.now();
        const filteredTransactions = sortedTransactions.filter((t: any) => {
          const status = String(t?.status || '').toLowerCase();
          const isUpcomingStatus = status === 'en_attente_paiement';
          const type = String(t?.type || '').toLowerCase();
          const isDeposit = type === 'depot';
          const dt = new Date(t?.datetime).getTime();
          const isFuture = Number.isFinite(dt) && dt > now;
          // On the platform Transactions page, deposits must be visible even when not validated yet.
          // Keep the legacy behavior of hiding "en_attente_paiement" for other transaction types.
          return !isFuture && (!isUpcomingStatus || isDeposit);
        });
        setTransactions(filteredTransactions);

        const documentsMap: Record<string, any[]> = {};
        const unlinked: any[] = [];
        const allDocuments = (documentsResponse as any)?.documents || [];
        allDocuments.forEach((doc: any) => {
          if (doc?.documentType !== 'contract') return;
          if (doc?.transactionId) {
            const txId = String(doc.transactionId);
            if (!documentsMap[txId]) documentsMap[txId] = [];
            documentsMap[txId].push(doc);
          } else {
            unlinked.push(doc);
          }
        });
        setTransactionDocuments(documentsMap);
        setUnlinkedContractDocuments(unlinked);
      } catch (e) {
        console.error('Error loading transactions:', e);
      } finally {
        if (!cancelled) setInternalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embedded, currentUser?.id]);

  if (loading) {
    return (
      <Card className="platform-portfolioSectionCard">
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Historique des transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Chargement…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="platform-portfolioSectionCard">
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>Historique des transactions</CardDescription>
      </CardHeader>
      <CardContent>
        {effectiveTransactions.length === 0 ? (
          <p>Aucune transaction</p>
        ) : (
          <>
            <div className="platform-portfolioTableDesktop">
              <div className="platform-portfolioTableWrap">
                <table className="platform-portfolioTable">
                  <thead>
                    <tr className="platform-portfolioTheadRow">
                      <th className="platform-portfolioTh">Date</th>
                      <th className="platform-portfolioTh">Type</th>
                      <th className="platform-portfolioTh">Produit</th>
                      <th className="platform-portfolioTh">Description</th>
                      <th className="platform-portfolioTh platform-portfolioAlignRight">Montant</th>
                      <th className="platform-portfolioTh">Statut</th>
                      <th className="platform-portfolioTh platform-portfolioAlignRight">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionsPagination.items.map((t: any) => {
                      const isTradingTransfer =
                        t.type === 'transfert' &&
                        (t.to === 'trading' || t.to_field === 'trading' || t.transfer_to === 'trading');
                      const isTransferToBalance =
                        t.type === 'transfert' &&
                        (t.to === 'solde' || t.to_field === 'solde' || t.transfer_to === 'solde');
                      const typeLabel =
                        t.type === 'depot'
                          ? 'Dépôt'
                          : t.type === 'retrait'
                            ? 'Retrait'
                            : t.type === 'achat'
                              ? 'Achat'
                              : t.type === 'vente'
                                ? 'Vente'
                                : t.type === 'transfert'
                                  ? isTradingTransfer
                                    ? t.assetType || 'Trading'
                                    : isTransferToBalance
                                      ? 'Transfert'
                                      : 'Investissement'
                                  : t.type === 'bonus'
                                    ? 'Bonus'
                                    : t.type === 'interets'
                                      ? 'Intérêts'
                                      : t.type;
                      const amountNum = typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount);
                      const amountAbs = Number.isFinite(amountNum) ? Math.abs(amountNum) : amountNum;
                      const amountPrefix =
                        String(t?.type || '').toLowerCase() === 'depot'
                          ? '+'
                          : String(t?.type || '').toLowerCase() === 'retrait'
                            ? '-'
                            : '';
                      const amountColor = String(t?.type || '').toLowerCase() === 'transfert'
                        ? '#111827'
                        : Number.isFinite(amountNum)
                        ? amountNum >= 0
                          ? '#10b981'
                          : '#ef4444'
                        : '#111827';
                      const productLabel =
                        t.assetName || t.productName || (isTradingTransfer ? t.assetType || 'Trading' : '-');
                      const statusLabel = formatTransactionStatus(t.status, t.type);
                      const statusColor = getStatusColor(t.status);
                      const contractDocs = effectiveDocs[String(t.id)] || [];
                      const hasContract = contractDocs.length > 0;
                      return (
                        <tr key={t.id} className="platform-portfolioTbodyRow">
                          <td className="platform-portfolioTd platform-portfolioNowrap">{formatDateTime(t.datetime)}</td>
                          <td className="platform-portfolioTd">{typeLabel}</td>
                          <td className="platform-portfolioTd">{productLabel}</td>
                          <td className="platform-portfolioTd">{t.description || '—'}</td>
                          <td
                            className="platform-portfolioTd platform-portfolioAlignRight"
                            style={{ fontWeight: 800, color: amountColor }}
                          >
                            {amountPrefix}
                            {formatAmount(
                              amountPrefix ? amountAbs : amountNum,
                              t.amountCurrency || t.amount_currency || accountCurrency
                            )}
                          </td>
                          <td className="platform-portfolioTd">
                            <span
                              className="platform-portfolioStatus"
                              style={{ color: statusColor }}
                              data-status={String(t?.status || '').trim().toLowerCase()}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td className="platform-portfolioTd platform-portfolioAlignRight">
                            {hasContract ? (
                              <a
                                href={contractDocs[0]?.fileUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  if (!contractDocs[0]?.fileUrl) {
                                    e.preventDefault();
                                  }
                                }}
                                className="platform-portfolioLink"
                                style={{ fontSize: 12, fontWeight: 800 }}
                              >
                                Voir le contrat
                              </a>
                            ) : (
                              <span className="platform-portfolioMuted" style={{ fontSize: 12 }}>
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="platform-portfolioTransactionsCards">
              {transactionsPagination.items.map((t: any) => {
                const isTradingTransfer =
                  t.type === 'transfert' &&
                  (t.to === 'trading' || t.to_field === 'trading' || t.transfer_to === 'trading');
                const isTransferToBalance =
                  t.type === 'transfert' &&
                  (t.to === 'solde' || t.to_field === 'solde' || t.transfer_to === 'solde');
                const typeLabel =
                  t.type === 'depot'
                    ? 'Dépôt'
                    : t.type === 'retrait'
                      ? 'Retrait'
                      : t.type === 'achat'
                        ? 'Achat'
                        : t.type === 'vente'
                          ? 'Vente'
                          : t.type === 'transfert'
                            ? isTradingTransfer
                              ? t.assetType || 'Trading'
                              : isTransferToBalance
                                ? 'Transfert'
                                : 'Investissement'
                            : t.type === 'bonus'
                              ? 'Bonus'
                              : t.type === 'interets'
                                ? 'Intérêts'
                                : t.type;
                const amountNum = typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount);
                const amountAbs = Number.isFinite(amountNum) ? Math.abs(amountNum) : amountNum;
                const amountPrefix =
                  String(t?.type || '').toLowerCase() === 'depot'
                    ? '+'
                    : String(t?.type || '').toLowerCase() === 'retrait'
                      ? '-'
                      : '';
                const amountColor = String(t?.type || '').toLowerCase() === 'transfert'
                  ? '#111827'
                  : Number.isFinite(amountNum)
                  ? amountNum >= 0
                    ? '#10b981'
                    : '#ef4444'
                  : '#111827';
                const productLabel =
                  t.assetName || t.productName || (isTradingTransfer ? t.assetType || 'Trading' : '-');
                const statusLabel = formatTransactionStatus(t.status, t.type);
                const statusColor = getStatusColor(t.status);
                const contractDocs = effectiveDocs[String(t.id)] || [];
                const hasContract = contractDocs.length > 0;
                return (
                  <div key={t.id} className="platform-portfolioTransactionCard">
                    <div className="platform-portfolioTransactionCardHeader">
                      <span className="platform-portfolioTransactionCardType">{typeLabel}</span>
                      <span className="platform-portfolioTransactionCardDate">{formatDateTime(t.datetime)}</span>
                    </div>
                    <div className="platform-portfolioTransactionCardMain">
                      <div className="platform-portfolioTransactionCardMainItem">
                        <span className="platform-portfolioTransactionCardLabel">Montant</span>
                        <span className="platform-portfolioTransactionCardValue" style={{ color: amountColor }}>
                          {amountPrefix}
                          {formatAmount(
                            amountPrefix ? amountAbs : amountNum,
                            t.amountCurrency || t.amount_currency || accountCurrency
                          )}
                        </span>
                      </div>
                      <div className="platform-portfolioTransactionCardMainItem">
                        <span className="platform-portfolioTransactionCardLabel">Statut</span>
                        <span
                          className="platform-portfolioStatus platform-portfolioTransactionCardValue"
                          style={{ color: statusColor }}
                          data-status={String(t?.status || '').trim().toLowerCase()}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="platform-portfolioTransactionCardSecondary">
                      <div className="platform-portfolioTransactionCardSecondaryItem">
                        <span>Produit</span>
                        <span>{productLabel}</span>
                      </div>
                      {t.description && (
                        <div className="platform-portfolioTransactionCardSecondaryItem platform-portfolioTransactionCardDescription">
                          <span>Description</span>
                          <span>{t.description}</span>
                        </div>
                      )}
                      <div className="platform-portfolioTransactionCardSecondaryItem platform-portfolioTransactionCardActions">
                        <span>Actions</span>
                        {hasContract ? (
                          <a
                            href={contractDocs[0]?.fileUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              if (!contractDocs[0]?.fileUrl) {
                                e.preventDefault();
                              }
                            }}
                            className="platform-portfolioLink"
                            style={{ fontWeight: 800 }}
                          >
                            Voir le contrat
                          </a>
                        ) : (
                          <span className="platform-portfolioMuted">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {effectiveTransactions.length > TRANSACTIONS_PAGE_SIZE && (
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Page {transactionsPagination.page} / {transactionsPagination.totalPages}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={transactionsPagination.page <= 1}
                    onClick={() => setTransactionsPage((p) => Math.max(1, p - 1))}
                  >
                    Précédent
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={transactionsPagination.page >= transactionsPagination.totalPages}
                    onClick={() => setTransactionsPage((p) => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {effectiveUnlinked.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#334155' }}>
              Contrats sans transaction
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {effectiveUnlinked.map((doc: any) => (
                <li key={doc.id} style={{ marginBottom: 8 }}>
                  <a
                    href={doc?.fileUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!doc?.fileUrl) e.preventDefault();
                    }}
                    className="platform-portfolioLink"
                    style={{ fontSize: 13, fontWeight: 600 }}
                  >
                    {doc?.name || 'Contrat'}
                  </a>
                  {doc?.productName ? (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>
                      — Produit : {doc.productName}
                    </span>
                  ) : null}
                  {doc?.description && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>— {doc.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
