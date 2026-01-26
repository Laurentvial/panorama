import React, { useMemo, useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';
import { Button } from './ui/button';
import { apiCall } from '../utils/api';
import { useIsMobile } from './ui/use-mobile';

export function PlatformPortfolio() {
  const { currentUser } = useUser();
  const isMobile = useIsMobile();
  const [positions, setPositions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const roundedCardStyle: React.CSSProperties = { borderRadius: '10px', overflow: 'hidden' };
  const ORDERS_PAGE_SIZE = 10;
  const TRANSACTIONS_PAGE_SIZE = 10;
  const [ordersPage, setOrdersPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);

  const visiblePositions = useMemo(() => {
    return (positions || []).filter((p: any) => p?.status !== 'pending');
  }, [positions]);

  // Pagination helpers
  const clampPage = (page: number, totalPages: number) => Math.min(Math.max(1, page), Math.max(1, totalPages));

  const ordersPagination = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil((visiblePositions || []).length / ORDERS_PAGE_SIZE));
    const safePage = clampPage(ordersPage, totalPages);
    const start = (safePage - 1) * ORDERS_PAGE_SIZE;
    return {
      page: safePage,
      totalPages,
      items: (visiblePositions || []).slice(start, start + ORDERS_PAGE_SIZE),
    };
  }, [visiblePositions, ordersPage]);

  const transactionsPagination = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil((transactions || []).length / TRANSACTIONS_PAGE_SIZE));
    const safePage = clampPage(transactionsPage, totalPages);
    const start = (safePage - 1) * TRANSACTIONS_PAGE_SIZE;
    return {
      page: safePage,
      totalPages,
      items: (transactions || []).slice(start, start + TRANSACTIONS_PAGE_SIZE),
    };
  }, [transactions, transactionsPage]);

  // If the dataset shrinks, keep page in range
  useEffect(() => {
    setOrdersPage((p) => clampPage(p, Math.max(1, Math.ceil((visiblePositions || []).length / ORDERS_PAGE_SIZE))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePositions.length]);

  useEffect(() => {
    setTransactionsPage((p) => clampPage(p, Math.max(1, Math.ceil((transactions || []).length / TRANSACTIONS_PAGE_SIZE))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions.length]);

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadPortfolioData();
    }
  }, [currentUser]);

  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      const [positionsResponse, transactionsResponse] = await Promise.all([
        apiCall(`/api/clients/${currentUser.id}/positions/`),
        apiCall(`/api/clients/${currentUser.id}/transactions/`),
      ]);
      setPositions((positionsResponse as any)?.positions || []);
      const sortedTransactions = (transactionsResponse.transactions || []).sort(
        (a: any, b: any) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
      );
      const now = Date.now();
      const filteredTransactions = sortedTransactions.filter((t: any) => {
        const status = String(t?.status || '').toLowerCase();
        const isUpcomingStatus = status === 'en_attente_paiement';
        const dt = new Date(t?.datetime).getTime();
        const isFuture = Number.isFinite(dt) && dt > now;
        return !isFuture && !isUpcomingStatus;
      });
      setTransactions(filteredTransactions);
    } catch (error) {
      console.error('Error loading portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: any) => {
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (!Number.isFinite(n)) return '-';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  };

  const formatDateTime = (iso: string) => {
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
  };

  const formatPositionRange = (p: any) => {
    if (p.opened_at) {
      const start = formatDateTime(p.opened_at);
      const end = p.closed_at ? formatDateTime(p.closed_at) : '-';
      return `${start} → ${end}`;
    }
    if (p.period_date) {
      const d = new Date(p.period_date);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(d);
      }
      return p.period_date;
    }
    return '-';
  };

  const holdingsByProduct = useMemo(() => {
    // Aggregate by product to give a quick "produits détenus" overview
    const map = new Map<
      string,
      {
        productId: string;
        productName: string;
        productType: string;
        productReference: string;
        totalInvested: number;
        realizedPnl: number;
        latestDateIso: string | null;
      }
    >();

    const pickLatestIso = (a: string | null, b: string | null) => {
      if (!a) return b;
      if (!b) return a;
      const ta = new Date(a).getTime();
      const tb = new Date(b).getTime();
      if (!Number.isFinite(ta)) return b;
      if (!Number.isFinite(tb)) return a;
      return tb > ta ? b : a;
    };

    // Invested amount must be based on transactions (not positions)
    // Strategy: use completed transactions only, and sum amounts that represent
    // "balance -> product" investments per product.
    const investedByProduct = new Map<string, number>();
    const completedTransactions = (transactions || []).filter((t: any) => t?.status === 'termine');
    for (const t of completedTransactions) {
      const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
      const amt = Number.isFinite(amountNum) ? amountNum : 0;
      if (!amt) continue;

      const type = String(t?.type || '');

      // Transfer direction fields can come from several aliases (serializer exposes from/to and from_field/to_field)
      const to = t?.to ?? t?.to_field ?? t?.transfer_to ?? t?.transferTo ?? null;
      const from = t?.from ?? t?.from_field ?? t?.transfer_from ?? t?.transferFrom ?? null;

      // product id can be on productId, to_field/to, from_field/from, or subscription_details.productId
      const productId =
        (t?.productId != null ? String(t.productId) : null) ||
        (to != null ? String(to) : null) ||
        (from != null ? String(from) : null) ||
        (t?.subscription_details?.productId != null ? String(t.subscription_details.productId) : null);

      if (!productId || productId === 'balance') continue;

      // Invested amount per product should reflect net investment based on completed transactions:
      // - achat / investissement: +amount
      // - transfert: balance -> product: +amount ; product -> balance: -amount
      // Note: we intentionally don't adjust for 'vente' here because the current UI expects
      // "Investi" based on cash movements into/out of the product.
      if (type === 'achat' || type === 'investissement') {
        investedByProduct.set(productId, (investedByProduct.get(productId) || 0) + amt);
      } else if (type === 'transfert') {
        const toIsBalance = to != null && String(to) === 'balance';
        const fromIsBalance = from != null && String(from) === 'balance';

        if (!toIsBalance && fromIsBalance) {
          // balance -> product
          investedByProduct.set(productId, (investedByProduct.get(productId) || 0) + amt);
        } else if (toIsBalance && !fromIsBalance) {
          // product -> balance (disinvestment)
          investedByProduct.set(productId, (investedByProduct.get(productId) || 0) - amt);
        } else if (!toIsBalance && !fromIsBalance) {
          // product -> product: keep direction as "invested into destination"
          investedByProduct.set(productId, (investedByProduct.get(productId) || 0) + amt);
        }
      }
    }

    for (const p of visiblePositions || []) {
      const productId = String(p.productId || p.product_id || '—');
      const productName = p.productName || p.product_name || productId;
      const productType = p.productType || p.product_type || p.product?.type || '';
      const productReference = p.productReference || p.product_reference || p.product?.reference || '';

      const profitLossNum =
        p.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
      const investedNum = typeof p.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
      const expectedTotalNum =
        p.expected_total == null ? null : typeof p.expected_total === 'string' ? parseFloat(p.expected_total) : Number(p.expected_total);

      // P&L par position:
      // - si profit_loss existe: utiliser
      // - sinon, si position terminée et expected_total existe: expected_total - invested_amount
      // - sinon: 0
      let positionPnl = 0;
      if (profitLossNum != null && Number.isFinite(profitLossNum)) {
        positionPnl = profitLossNum;
      } else if (p.status === 'done' && expectedTotalNum != null && Number.isFinite(expectedTotalNum) && Number.isFinite(investedNum)) {
        positionPnl = expectedTotalNum - investedNum;
      }

      const latestIso = pickLatestIso(p.closed_at || null, pickLatestIso(p.opened_at || null, p.period_date || null));

      const prev =
        map.get(productId) || ({
          productId,
          productName,
          productType,
          productReference,
          totalInvested: 0,
          realizedPnl: 0,
          latestDateIso: null,
        } as const);

      const next = {
        ...prev,
        productName,
        productType,
        productReference,
        totalInvested: investedByProduct.get(productId) || prev.totalInvested || 0,
        realizedPnl: prev.realizedPnl + (p.status === 'open' || p.status === 'done' ? positionPnl : 0),
        latestDateIso: pickLatestIso(prev.latestDateIso, latestIso),
      };

      map.set(productId, next);
    }

    return Array.from(map.values()).sort((a, b) => b.totalInvested - a.totalInvested);
  }, [visiblePositions, transactions]);

  // Stats du haut: même logique que le CRM (ClientPortfolioTab)
  const calculatedValues = useMemo(() => {
    let calculatedInvestedCapital = 0;
    let calculatedTradingPortfolio = 0;
    let calculatedBonus = 0;
    let calculatedProfitLoss = 0;
    let calculatedTotalInvesti = 0; // Only achat + investissement + transfert (balance -> product)

    const completedTransactions = (transactions || []).filter((t: any) => t?.status === 'termine');

    completedTransactions.forEach((transaction: any) => {
      const amount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : Number(transaction.amount);
      const amt = Number.isFinite(amount) ? amount : 0;

      switch (transaction.type) {
        case 'depot':
          calculatedInvestedCapital += amt;
          break;
        case 'retrait':
          calculatedInvestedCapital -= amt;
          break;
        case 'bonus':
          calculatedBonus += amt;
          calculatedInvestedCapital += amt;
          break;
        case 'achat':
        case 'investissement':
          calculatedTradingPortfolio += amt;
          calculatedTotalInvesti += amt;
          break;
        case 'vente':
          calculatedTradingPortfolio -= amt;
          break;
        case 'interets':
          calculatedProfitLoss += amt;
          break;
        case 'frais':
        case 'perte':
          calculatedProfitLoss -= amt;
          break;
        case 'transfert': {
          const transferTo = transaction.to || transaction.to_field || transaction.transfer_to || null;
          const hasProductId = transaction.productId || null;

          if (transferTo && transferTo !== 'balance') {
            // balance -> product
            calculatedTotalInvesti += amt;
            calculatedTradingPortfolio += amt;
          } else if (transferTo === 'balance') {
            // product -> balance
            calculatedTradingPortfolio -= amt;
          } else if (hasProductId) {
            // Fallback: assume subscription (balance -> product)
            calculatedTotalInvesti += amt;
            calculatedTradingPortfolio += amt;
          }
          break;
        }
        default:
          break;
      }
    });

    return {
      investedCapital: calculatedInvestedCapital,
      tradingPortfolio: Math.max(0, calculatedTradingPortfolio),
      bonus: calculatedBonus,
      profitLoss: calculatedProfitLoss,
      totalInvesti: calculatedTotalInvesti,
      hasCompletedTransactions: completedTransactions.length > 0,
    };
  }, [transactions]);

  const investedCapital = useMemo(
    () =>
      calculatedValues.hasCompletedTransactions
        ? calculatedValues.investedCapital
        : (currentUser?.investedCapital || currentUser?.invested_capital || 0),
    [calculatedValues.hasCompletedTransactions, calculatedValues.investedCapital, currentUser?.investedCapital, currentUser?.invested_capital]
  );

  const tradingPortfolio = useMemo(
    () =>
      calculatedValues.hasCompletedTransactions
        ? calculatedValues.tradingPortfolio
        : (currentUser?.tradingPortfolio || currentUser?.trading_portfolio || 0),
    [calculatedValues.hasCompletedTransactions, calculatedValues.tradingPortfolio, currentUser?.tradingPortfolio, currentUser?.trading_portfolio]
  );

  const totalInvesti = useMemo(
    () => (calculatedValues.hasCompletedTransactions ? calculatedValues.totalInvesti : 0),
    [calculatedValues.hasCompletedTransactions, calculatedValues.totalInvesti]
  );

  const profitLoss = useMemo(() => {
    let total = 0;
    for (const p of visiblePositions || []) {
      if (p?.status !== 'open' && p?.status !== 'done') continue;

      const profitLossNum =
        p?.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
      const investedNum = typeof p?.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
      const expectedTotalNum =
        p?.expected_total == null ? null : typeof p.expected_total === 'string' ? parseFloat(p.expected_total) : Number(p.expected_total);

      let positionPnl = 0;
      if (profitLossNum != null && Number.isFinite(profitLossNum)) {
        positionPnl = profitLossNum;
      } else if (p?.status === 'done' && expectedTotalNum != null && Number.isFinite(expectedTotalNum) && Number.isFinite(investedNum)) {
        positionPnl = expectedTotalNum - investedNum;
      }

      total += Number.isFinite(positionPnl) ? positionPnl : 0;
    }
    return total;
  }, [visiblePositions]);

  // Bonus est du cash, donc inclus dans investedCapital -> on ne le soustrait pas
  const availableFunds = useMemo(() => investedCapital - tradingPortfolio, [investedCapital, tradingPortfolio]);

  const portfolioValue = useMemo(
    () => Math.max(0, availableFunds) + tradingPortfolio + profitLoss,
    [availableFunds, tradingPortfolio, profitLoss]
  );
  const isProfit = profitLoss >= 0;

  return (
    <div style={{ padding: isMobile ? '16px' : '20px 20px' }}>
      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <Card style={roundedCardStyle}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Liquidités Disponibles</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.max(0, availableFunds).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
                <p className="text-xs text-muted-foreground mt-1">Fonds disponibles pour investir</p>
              </CardContent>
            </Card>

            <Card style={roundedCardStyle}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Investi</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalInvesti.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
                <p className="text-xs text-muted-foreground mt-1">Capital total investi (achat + transfert balance→produit)</p>
              </CardContent>
            </Card>

            <Card style={roundedCardStyle}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bénéfices / Perte</CardTitle>
                {isProfit ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <div 
                  className="text-2xl font-bold"
                  style={{ color: isProfit ? '#10b981' : '#ef4444' }}
                >
                  {isProfit ? '+' : ''}{profitLoss.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isProfit ? 'Gain réalisé' : 'Perte réalisée'}
                </p>
              </CardContent>
            </Card>

            <Card style={roundedCardStyle}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valeur du Portefeuille</CardTitle>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{portfolioValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                <p className="text-xs text-muted-foreground mt-1">Valeur totale actuelle</p>
              </CardContent>
            </Card>
          </div>

          {/* Actifs détenus */}
          <Card style={{ ...roundedCardStyle, marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Actifs détenus</CardTitle>
              <CardDescription>Produits détenus</CardDescription>
            </CardHeader>
            <CardContent>
              {visiblePositions.length === 0 ? (
                <p>Aucune position</p>
              ) : (
                <>
                  {holdingsByProduct.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {holdingsByProduct.map((h) => {
                          const pnlColor = h.realizedPnl >= 0 ? '#10b981' : '#ef4444';
                          return (
                            <div
                              key={h.productId}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 14px',
                                border: '1px solid #e5e7eb',
                                borderRadius: 10,
                                backgroundColor: 'white',
                                flexWrap: 'wrap',
                              }}
                            >
                              <div style={{ minWidth: 260 }}>
                                <div style={{ fontWeight: 700 }}>{h.productName}</div>
                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                  {h.productType ? `Type: ${h.productType}` : 'Type: -'}
                                  {h.productReference ? ` • Réf: ${h.productReference}` : ''}
                                </div>
                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                  Date: {h.latestDateIso ? formatDateTime(h.latestDateIso) : '-'}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 12, color: '#6b7280' }}>Investi</div>
                                  <div style={{ fontWeight: 700 }}>{formatCurrency(h.totalInvested)}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 12, color: '#6b7280' }}>P&amp;L</div>
                                  <div style={{ fontWeight: 700, color: pnlColor }}>{formatCurrency(h.realizedPnl)}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card style={{ ...roundedCardStyle, marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>Historique des transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p>Aucune transaction</p>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Type</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Produit</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px' }}>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactionsPagination.items.map((t: any) => {
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
                                    ? 'Investissement'
                                    : t.type === 'investissement'
                                      ? 'Investissement'
                                  : t.type === 'bonus'
                                    ? 'Bonus'
                                    : t.type === 'interets'
                                      ? 'Intérêts'
                                      : t.type;
                        const amountNum = typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount);
                        const amountColor = Number.isFinite(amountNum) ? (amountNum >= 0 ? '#10b981' : '#ef4444') : '#111827';
                        const productLabel = t.productName || '-';
                        return (
                          <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatDateTime(t.datetime)}</td>
                            <td style={{ padding: '10px 8px' }}>{typeLabel}</td>
                            <td style={{ padding: '10px 8px' }}>{productLabel}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: amountColor }}>
                              {formatCurrency(t.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>

                  {transactions.length > TRANSACTIONS_PAGE_SIZE && (
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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
            </CardContent>
          </Card>

          {/* Ordres (positions) */}
          <Card style={{ ...roundedCardStyle, marginBottom: '30px' }}>
            <CardHeader>
              <CardTitle>Ordres</CardTitle>
              <CardDescription>Vos achats/ventes et mouvements</CardDescription>
            </CardHeader>
            <CardContent>
              {visiblePositions.length === 0 ? (
                <p>Aucun ordre</p>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Produit</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Type</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Date d'ouverture</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Date de fermeture</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px' }}>Investi</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px' }}>P&amp;L</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersPagination.items.map((p: any) => {
                        const investedNum =
                          typeof p.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
                        const pnlNum =
                          p.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
                        const pnlColor = pnlNum == null ? '#111827' : pnlNum >= 0 ? '#10b981' : '#ef4444';
                        const statusLabel =
                          p.status === 'open'
                            ? 'Ouverte'
                            : p.status === 'done'
                              ? 'Fermée'
                              : p.status === 'cancelled'
                                ? 'Annulée'
                                : p.status || '-';
                        const productLabel = p.productName || p.productId || '-';
                        const productType = p.productType || p.product_type || '';
                        const openedLabel = p.opened_at
                          ? formatDateTime(p.opened_at)
                          : p.period_date
                            ? formatDateTime(p.period_date)
                            : '-';
                        const closedLabel = p.closed_at ? formatDateTime(p.closed_at) : '-';
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '10px 8px' }}>{productLabel}</td>
                            <td style={{ padding: '10px 8px' }}>{productType || '-'}</td>
                            <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{openedLabel}</td>
                            <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{closedLabel}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                              {Number.isFinite(investedNum) ? formatCurrency(investedNum) : '-'}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: pnlColor }}>
                              {p.profit_loss == null ? '-' : formatCurrency(p.profit_loss)}
                            </td>
                            <td style={{ padding: '10px 8px' }}>{statusLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>

                  {visiblePositions.length > ORDERS_PAGE_SIZE && (
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        Page {ordersPagination.page} / {ordersPagination.totalPages}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={ordersPagination.page <= 1}
                          onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                        >
                          Précédent
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={ordersPagination.page >= ordersPagination.totalPages}
                          onClick={() => setOrdersPage((p) => p + 1)}
                        >
                          Suivant
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

        </>
      )}
    </div>
  );
}
