import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Wallet, TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import { ClientWallet } from './ClientWallet';
import { apiCall } from '../utils/api';
import { formatAmount } from '../utils/currency';
import { CurrencyIcon } from './CurrencyIcon';
import {
  classifyTransferDirection,
  computeProductAccruedGains,
  getTransferGlobalDelta,
  getTransferProductMovements,
  sumOpenPositionAccruedGains,
} from '../utils/portfolioTransfers';
import {
  AssetLogo,
  ASSET_LOGO_NAME_GAP_PX,
  getAssetLogoUrl,
  positionsTableBodyClass,
  positionsTableCellClass,
  positionsTableClass,
  positionsTableHeadCellClass,
  positionsTableHeadClass,
  positionsTableHeadRowClass,
  positionsTableRowClass,
  positionsTableShellClass,
} from './positionUtils';

interface ClientPortfolioTabProps {
  client: any;
  clientId?: string;
  onRefresh?: () => void;
  refreshToken?: number;
}

export function ClientPortfolioTab({ client, clientId, onRefresh, refreshToken = 0 }: ClientPortfolioTabProps) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [assetsIndex, setAssetsIndex] = useState<any[]>([]);
  const [productsIndex, setProductsIndex] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const isCompletedStatus = (status: any) =>
    ['valide', 'cloture'].includes(String(status ?? '').trim().toLowerCase());

  useEffect(() => {
    async function loadTransactions() {
      if (!clientId) {
        setTransactions([]);
        return;
      }
      try {
        setLoadingTransactions(true);
        // Load all transactions for portfolio calculations by paginating through all pages
        const allTransactions: any[] = [];
        let page = 1;
        const limit = 500; // Backend max limit
        let hasMore = true;

        while (hasMore) {
          const data = await apiCall(`/api/clients/${clientId}/transactions/?page=${page}&limit=${limit}`);
          const transactions = (data as any).transactions || [];
          allTransactions.push(...transactions);
          
          const pagination = (data as any).pagination;
          if (pagination && page >= pagination.total_pages) {
            hasMore = false;
          } else if (transactions.length < limit) {
            hasMore = false;
          } else {
            page++;
          }
        }
        
        setTransactions(allTransactions);
      } catch (error) {
        console.error('Error loading client transactions for portfolio:', error);
        setTransactions([]);
      } finally {
        setLoadingTransactions(false);
      }
    }
    loadTransactions();
  }, [clientId, refreshToken]);

  useEffect(() => {
    async function loadAssetsAndProducts() {
      if (!clientId) {
        setAssetsIndex([]);
        setProductsIndex([]);
        return;
      }
      try {
        const [assetsResponse, productsResponse] = await Promise.all([
          apiCall('/api/assets/').catch(() => ({ assets: [] })),
          apiCall('/api/products/').catch(() => ({ products: [] })),
        ]);
        setAssetsIndex((assetsResponse as any)?.assets || []);
        setProductsIndex((productsResponse as any)?.products || []);
      } catch (error) {
        console.error('Error loading assets/products for holdings:', error);
        setAssetsIndex([]);
        setProductsIndex([]);
      }
    }
    loadAssetsAndProducts();
  }, [clientId, refreshToken]);

  useEffect(() => {
    async function loadPositions() {
      if (!clientId) {
        setPositions([]);
        return;
      }
      try {
        // open + closed (done) only; paginate to include full history
        const allPositions: any[] = [];
        let page = 1;
        const limit = 500;
        let hasMore = true;

        while (hasMore) {
          const data = await apiCall(`/api/clients/${clientId}/positions/?status=open,done&page=${page}&limit=${limit}`);
          const pagePositions = (data as any)?.positions || [];
          allPositions.push(...pagePositions);

          const pagination = (data as any)?.pagination;
          if (pagination && page >= pagination.total_pages) {
            hasMore = false;
          } else if (pagePositions.length < limit) {
            hasMore = false;
          } else {
            page += 1;
          }
        }

        setPositions(allPositions);
      } catch (error) {
        console.error('Error loading client positions for portfolio:', error);
        setPositions([]);
      }
    }
    loadPositions();
  }, [clientId, refreshToken]);

  // Calculate values from transactions
  const calculateValuesFromTransactions = () => {
    let calculatedInvestedCapital = 0;
    let calculatedTradingPortfolio = 0;
    let calculatedBonus = 0;
    let calculatedProfitLoss = 0;
    let calculatedTotalInvesti = 0; // achat + transfert (solde → product) - transfert (product → solde) when status is 'valide'

    const completedTransactions = transactions
      .filter((t: any) => isCompletedStatus(t?.status))
      .sort((a: any, b: any) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    let effectiveCurrency: string | null = null;

    completedTransactions.forEach((transaction: any) => {
      const amount = parseFloat(transaction.amount) || 0;
      const txnCcy = (transaction.amountCurrency || transaction.amount_currency || 'EUR').toString().trim().toUpperCase();

      if (transaction.type === 'conversion') {
        calculatedInvestedCapital = amount;
        calculatedTradingPortfolio = 0;
        calculatedTotalInvesti = 0;
        effectiveCurrency = txnCcy;
        return;
      }
      if (effectiveCurrency === null) effectiveCurrency = txnCcy;
      if (txnCcy !== effectiveCurrency) return;

      switch (transaction.type) {
        case 'depot':
          calculatedInvestedCapital += amount;
          break;
        case 'retrait':
          calculatedInvestedCapital -= amount;
          break;
        case 'bonus':
          calculatedBonus += amount;
          calculatedInvestedCapital += amount;
          break;
        case 'achat':
          calculatedTradingPortfolio += amount;
          calculatedTotalInvesti += amount;
          break;
        case 'vente':
          calculatedTradingPortfolio -= amount;
          break;
        case 'interets':
          calculatedInvestedCapital += amount;
          // Surperformances = intérêts supplémentaires (hors renta initiale) → ne pas soustraire du P&L
          const subDetails = transaction.subscription_details || transaction.subscriptionDetails;
          if (!subDetails?.is_surperformance) {
            calculatedProfitLoss -= amount;
          }
          break;
        case 'frais':
        case 'perte':
          calculatedProfitLoss -= amount;
          break;
        case 'transfert': {
          const transferDelta = getTransferGlobalDelta(transaction, amount);
          calculatedTotalInvesti += transferDelta;
          calculatedTradingPortfolio += transferDelta;
          break;
        }
        default:
          break;
      }
    });

    return {
      investedCapital: calculatedInvestedCapital,
      tradingPortfolio: Math.max(0, calculatedTradingPortfolio), // Ensure non-negative
      bonus: calculatedBonus,
      profitLoss: calculatedProfitLoss,
      totalInvesti: calculatedTotalInvesti
    };
  };

  // Calculate values from transactions - use useMemo to recalculate when transactions change
  const calculatedValues = useMemo(() => calculateValuesFromTransactions(), [transactions]);
  
  // Check if there are completed transactions
  const hasCompletedTransactions = useMemo(() => 
    transactions.some((t: any) => isCompletedStatus(t?.status)),
    [transactions]
  );
  
  // Use calculated values from completed transactions, fallback to client object values if no completed transactions
  const investedCapital = useMemo(() => 
    hasCompletedTransactions 
      ? calculatedValues.investedCapital 
      : (client?.investedCapital || client?.invested_capital || 0),
    [hasCompletedTransactions, calculatedValues.investedCapital, client?.investedCapital, client?.invested_capital]
  );
  
  const tradingPortfolio = useMemo(() => 
    hasCompletedTransactions 
      ? calculatedValues.tradingPortfolio 
      : (client?.tradingPortfolio || client?.trading_portfolio || 0),
    [hasCompletedTransactions, calculatedValues.tradingPortfolio, client?.tradingPortfolio, client?.trading_portfolio]
  );
  
  const bonus = useMemo(() => 
    hasCompletedTransactions 
      ? calculatedValues.bonus 
      : (client?.bonus || 0),
    [hasCompletedTransactions, calculatedValues.bonus, client?.bonus]
  );
  
  const profitLoss = useMemo(() => {
    // Profit/Loss basé sur:
    // 1. Les transactions (interets, frais, perte)
    // 2. Les positions de trading fermées (done) uniquement

    const completedTransactions = transactions.filter((t: any) => isCompletedStatus(t?.status));
    const surperformanceInterests = completedTransactions
      .filter((t: any) => t?.type === 'interets')
      .reduce((sum: number, t: any) => {
        const subDetails = t?.subscription_details || t?.subscriptionDetails;
        if (!subDetails?.is_surperformance) return sum;
        const amount = parseFloat(t?.amount) || 0;
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);

    // Base transactions P&L (déjà net des intérêts non-surperformance, frais, pertes)
    const transactionsProfitLoss = hasCompletedTransactions ? calculatedValues.profitLoss : 0;

    // P&L brut des positions clôturées
    let closedPositionsProfitLoss = 0;
    for (const p of positions || []) {
      if (p?.status !== 'done') continue;

      const profitLossNum =
        p?.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
      const investedNum = typeof p?.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
      const expectedTotalNum =
        p?.expected_total == null ? null : typeof p.expected_total === 'string' ? parseFloat(p.expected_total) : Number(p.expected_total);

      let positionPnl = 0;
      if (profitLossNum != null && Number.isFinite(profitLossNum)) {
        // profit_loss est toujours en EUR (objectif de période)
        positionPnl = profitLossNum;
      } else if (expectedTotalNum != null && Number.isFinite(expectedTotalNum) && Number.isFinite(investedNum)) {
        // Calculer le P&L à partir de expected_total et invested_amount
        // Ces valeurs sont déjà en EUR (invested_amount est toujours en EUR)
        positionPnl = expectedTotalNum - investedNum;
      }

      closedPositionsProfitLoss += Number.isFinite(positionPnl) ? positionPnl : 0;
    }

    // Les intérêts de surperformance sont hors performance des positions:
    // on les neutralise à 100% via amortissement.
    const surchargeAmortization = surperformanceInterests;
    const adjustedClosedPositionsProfitLoss =
      closedPositionsProfitLoss - surperformanceInterests + surchargeAmortization;

    const openAccruedGains = sumOpenPositionAccruedGains(positions);

    return transactionsProfitLoss + adjustedClosedPositionsProfitLoss + openAccruedGains;
  }, [positions, calculatedValues, hasCompletedTransactions, transactions]);
  
  // Total Investi: only achat and transfert (solde → product)
  const totalInvesti = useMemo(() => 
    hasCompletedTransactions 
      ? calculatedValues.totalInvesti 
      : 0,
    [hasCompletedTransactions, calculatedValues.totalInvesti]
  );
  
  // Calculate available funds
  // Bonus is cash and should be included in liquidités (available funds), so we don't subtract it
  // investedCapital already includes deposits + bonuses, so we only subtract what's invested (tradingPortfolio)
  const availableFunds = useMemo(() => investedCapital - tradingPortfolio, [investedCapital, tradingPortfolio]);

  // Valeur du Portefeuille = Liquidité disponible + Valeur investie + Bénéfice/Perte
  const portfolioValue = useMemo(
    () => Math.max(0, availableFunds) + tradingPortfolio + profitLoss,
    [availableFunds, tradingPortfolio, profitLoss]
  );

  const accountCurrency = (client?.accountCurrency || client?.account_currency || 'EUR').toString().trim().toUpperCase();
  const formatCurrency = (amount: number) => formatAmount(amount, accountCurrency);
  const formatSignedCurrency = (amount: number) => `${amount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(amount))}`;
  const formatPnlWithPct = (pnl: number, pnlPct: number | null) => {
    const main = formatSignedCurrency(pnl);
    if (pnlPct == null || !Number.isFinite(pnlPct)) return main;
    return `${main} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`;
  };

  const productsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of productsIndex || []) {
      const id = p?.id != null ? String(p.id) : '';
      if (id) map.set(id, p);
    }
    return map;
  }, [productsIndex]);

  const assetsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of assetsIndex || []) {
      const id = a?.id != null ? String(a.id) : '';
      if (id) map.set(id, a);
    }
    return map;
  }, [assetsIndex]);

  const assetHoldings = useMemo(() => {
    const map = new Map<
      string,
      {
        assetId: string;
        name: string;
        type: string;
        reference: string;
        invested: number;
        pnl: number;
      }
    >();

    for (const p of positions || []) {
      if (!p || String(p?.status || '') !== 'open') continue;
      const assetId = p.assetId || p.asset_id || p.asset?.id || null;
      if (!assetId) continue;

      const investedNum = typeof p.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
      const pnlNum = p.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
      const invested = Number.isFinite(investedNum) ? investedNum : 0;
      const pnl = pnlNum != null && Number.isFinite(pnlNum) ? pnlNum : 0;

      const key = String(assetId);
      const prev = map.get(key) || {
        assetId: key,
        name: p.assetName || p.asset_name || p.asset?.name || key,
        type: p.assetType || p.asset_type || p.asset?.type || '',
        reference: p.assetReference || p.asset_reference || p.asset?.reference || '',
        invested: 0,
        pnl: 0,
      };

      map.set(key, {
        ...prev,
        invested: prev.invested + invested,
        pnl: prev.pnl + pnl,
      });
    }

    return Array.from(map.values());
  }, [positions]);

  const investedProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        productId: string;
        name: string;
        type: string;
        reference: string;
        invested: number;
        pnl: number;
      }
    >();

    const normalizeId = (value: any): string | null => {
      if (value == null) return null;
      const v = String(value).trim();
      if (!v || v === 'solde' || v === 'trading') return null;
      return v;
    };

    const completedTransactions = (transactions || []).filter((t: any) => isCompletedStatus(t?.status));
    for (const t of completedTransactions) {
      if (!t || String(t?.type || '') !== 'transfert') continue;
      const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
      const amount = Number.isFinite(amountNum) ? Math.abs(amountNum) : 0;
      if (!amount) continue;

      const applyDelta = (productId: string, delta: number) => {
        const product = productsById.get(String(productId));
        const prev = map.get(String(productId)) || {
          productId: String(productId),
          name: t?.productName || t?.product_name || product?.name || String(productId),
          type: t?.productType || t?.product_type || product?.type || product?.subcategory || product?.category || '',
          reference: t?.productReference || t?.product_reference || product?.reference || '',
          invested: 0,
          pnl: 0,
        };
        map.set(String(productId), {
          ...prev,
          invested: prev.invested + delta,
        });
      };

      const productMovements = getTransferProductMovements(t, amount);
      for (const movement of productMovements) {
        const productId = normalizeId(movement.productId);
        if (!productId) continue;
        applyDelta(productId, movement.delta);
      }
    }

    for (const [key] of map.entries()) {
      const accruedGains = computeProductAccruedGains(key, positions);
      if (accruedGains !== 0) {
        const prev = map.get(key)!;
        map.set(key, { ...prev, pnl: accruedGains });
      }
    }

    return Array.from(map.values()).filter((p) => p.invested > 0.009);
  }, [transactions, positions, productsById]);

  const holdingsRows = useMemo(() => {
    const computePnlPct = (pnl: number, invested: number): number | null => {
      if (!Number.isFinite(invested) || invested <= 0 || !Number.isFinite(pnl)) return null;
      const pct = (pnl / invested) * 100;
      return Number.isFinite(pct) ? pct : null;
    };

    const assetRows = assetHoldings.map((a) => ({
      kind: 'asset' as const,
      key: `asset-${a.assetId}`,
      name: a.name,
      logoUrl: getAssetLogoUrl(assetsById.get(a.assetId)),
      type: a.type || 'Trading',
      reference: a.reference || '-',
      invested: a.invested,
      pnl: a.pnl,
      pnlPct: computePnlPct(a.pnl, a.invested),
    }));
    const productRows = investedProducts.map((p) => {
      const product = productsById.get(String(p.productId));
      return {
        kind: 'product' as const,
        key: `product-${p.productId}`,
        name: p.name,
        logoUrl: String(product?.imageUrl || product?.image_url || '').trim(),
        type: p.type || 'Produit',
        reference: p.reference || '-',
        invested: p.invested,
        pnl: p.pnl,
        pnlPct: computePnlPct(p.pnl, p.invested),
      };
    });
    return [...assetRows, ...productRows].sort((a, b) => b.invested - a.invested);
  }, [assetHoldings, investedProducts, assetsById, productsById]);

  const recap = useMemo(() => {
    let achats = 0;
    let transfertsEntrants = 0;
    let transfertsSortants = 0;
    let fraisEtPertes = 0;
    let interetsReintegres = 0;
    let interetsSurperformance = 0;
    let pnlPositionsCloturees = 0;

    const completedTransactions = transactions.filter((t: any) => isCompletedStatus(t?.status));

    for (const transaction of completedTransactions) {
      const amount = parseFloat(transaction.amount) || 0;
      if (!Number.isFinite(amount) || amount === 0) continue;

      if (transaction.type === 'achat') {
        achats += amount;
      }

      if (transaction.type === 'transfert') {
        const direction = classifyTransferDirection(transaction);
        if (direction === 'solde_to_product' || direction === 'legacy_to_product') {
          transfertsEntrants += amount;
        } else if (direction === 'product_to_solde' || direction === 'legacy_from_product') {
          transfertsSortants += amount;
        }
      }

      if (transaction.type === 'frais' || transaction.type === 'perte') {
        fraisEtPertes += amount;
      }

      if (transaction.type === 'interets') {
        const subDetails = transaction.subscription_details || transaction.subscriptionDetails;
        if (subDetails?.is_surperformance) {
          interetsSurperformance += amount;
        } else {
          interetsReintegres += amount;
        }
      }
    }

    for (const p of positions || []) {
      if (p?.status !== 'done') continue;
      const profitLossNum =
        p?.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
      const investedNum = typeof p?.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
      const expectedTotalNum =
        p?.expected_total == null ? null : typeof p.expected_total === 'string' ? parseFloat(p.expected_total) : Number(p.expected_total);
      if (profitLossNum != null && Number.isFinite(profitLossNum)) {
        pnlPositionsCloturees += profitLossNum;
      } else if (expectedTotalNum != null && Number.isFinite(expectedTotalNum) && Number.isFinite(investedNum)) {
        pnlPositionsCloturees += expectedTotalNum - investedNum;
      }
    }

    // Amortissement total de la surperformance (hors positions).
    const amortissementSurperformance = interetsSurperformance;

    return {
      totalInvesti: {
        achats,
        transfertsEntrants,
        transfertsSortants,
      },
      profitLoss: {
        pnlPositionsCloturees,
        interetsSurperformance,
        amortissementSurperformance,
        fraisEtPertes,
        interetsReintegres,
      },
      valeurPortefeuille: {
        solde: Math.max(0, availableFunds),
        investi: tradingPortfolio,
        profitLoss,
      },
      solde: {
        capital: investedCapital,
        investi: tradingPortfolio,
      },
    };
  }, [transactions, positions, availableFunds, tradingPortfolio, profitLoss, investedCapital]);

  return (
    <div className="space-y-6">
      {/* Header with Add Product Button */}
      <div className="flex justify-between items-center">
        <h2 className="tab-section-title">Portefeuille</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solde</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(Math.max(0, availableFunds))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Fonds disponibles pour investir</p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Capital cumulé</span>
                <span>{formatSignedCurrency(recap.solde.capital)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Montant investi en cours</span>
                <span>{formatSignedCurrency(-recap.solde.investi)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investi</CardTitle>
            <CurrencyIcon currency={accountCurrency} size={16} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalInvesti)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Capital total investi</p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Achats</span>
                <span>{formatSignedCurrency(recap.totalInvesti.achats)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Transferts vers produits</span>
                <span>{formatSignedCurrency(recap.totalInvesti.transfertsEntrants)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Transferts vers solde</span>
                <span>{formatSignedCurrency(-recap.totalInvesti.transfertsSortants)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bénéfices</CardTitle>
            {profitLoss >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Performance du portefeuille</p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Positions clôturées</span>
                <span>{formatSignedCurrency(recap.profitLoss.pnlPositionsCloturees)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Intérêts surperformance</span>
                <span>{formatSignedCurrency(-recap.profitLoss.interetsSurperformance)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Amortissement surcharge surperformance</span>
                <span>{formatSignedCurrency(recap.profitLoss.amortissementSurperformance)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Frais / pertes</span>
                <span>{formatSignedCurrency(-recap.profitLoss.fraisEtPertes)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Intérêts réintégrés au capital</span>
                <span>{formatSignedCurrency(-recap.profitLoss.interetsReintegres)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valeur du Portefeuille</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(portfolioValue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Valeur totale actuelle</p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Solde disponible</span>
                <span>{formatSignedCurrency(recap.valeurPortefeuille.solde)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Capital investi en cours</span>
                <span>{formatSignedCurrency(recap.valeurPortefeuille.investi)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Bénéfices / perte</span>
                <span>{formatSignedCurrency(recap.valeurPortefeuille.profitLoss)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actifs détenus */}
      <Card>
        <CardHeader>
          <CardTitle>Actifs détenus</CardTitle>
        </CardHeader>
        <CardContent>
          {holdingsRows.length === 0 ? (
            <div className={`${positionsTableShellClass} px-4 py-10 text-center text-sm text-slate-500`}>
              Aucun actif détenu.
            </div>
          ) : (
            <div className={positionsTableShellClass}>
              <div className="overflow-x-auto">
                <table className={positionsTableClass}>
                  <thead className={positionsTableHeadClass}>
                    <tr className={positionsTableHeadRowClass}>
                      <th className={`${positionsTableHeadCellClass} text-left`}>Actif / Produit</th>
                      <th className={`${positionsTableHeadCellClass} text-left`}>Type</th>
                      <th className={`${positionsTableHeadCellClass} text-left`}>Réf</th>
                      <th className={`${positionsTableHeadCellClass} text-right`}>Valeur investie</th>
                      <th className={`${positionsTableHeadCellClass} text-right`}>P&L</th>
                    </tr>
                  </thead>
                  <tbody className={positionsTableBodyClass}>
                    {holdingsRows.map((row) => (
                      <tr key={row.key} className={positionsTableRowClass}>
                        <td className={positionsTableCellClass}>
                          <div className="flex min-w-0 items-center">
                            <div className="shrink-0" style={{ marginRight: ASSET_LOGO_NAME_GAP_PX }}>
                              <AssetLogo
                                logoUrl={row.logoUrl}
                                name={row.name}
                                objectFit={row.kind === 'product' ? 'cover' : 'contain'}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900">{row.name}</div>
                              <div className="text-xs text-slate-500">
                                {row.kind === 'asset' ? 'Actif' : 'Produit'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={`${positionsTableCellClass} text-slate-600`}>{row.type}</td>
                        <td className={`${positionsTableCellClass} font-mono text-xs text-slate-600`}>{row.reference}</td>
                        <td className={`${positionsTableCellClass} text-right font-medium whitespace-nowrap`}>
                          {formatCurrency(row.invested)}
                        </td>
                        <td
                          className={`${positionsTableCellClass} text-right font-medium whitespace-nowrap ${
                            row.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatPnlWithPct(row.pnl, row.pnlPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wallet Details */}
      <ClientWallet client={client} transactions={transactions} positions={positions} />
    </div>
  );
}
