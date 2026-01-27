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
  const [assetsIndex, setAssetsIndex] = useState<any[]>([]);
  const [productsIndex, setProductsIndex] = useState<any[]>([]);
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
      const [positionsResponse, transactionsResponse, assetsResponse, productsResponse] = await Promise.all([
        apiCall(`/api/clients/${currentUser.id}/positions/`),
        apiCall(`/api/clients/${currentUser.id}/transactions/`),
        apiCall('/api/assets/').catch(() => ({ assets: [] })),
        apiCall('/api/products/').catch(() => ({ products: [] })),
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
      setAssetsIndex((assetsResponse as any)?.assets || []);
      setProductsIndex((productsResponse as any)?.products || productsResponse || []);
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

  const formatMoney = (value: any, currency: string | undefined, opts?: Intl.NumberFormatOptions) => {
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (!Number.isFinite(n)) return '-';
    const cur = String(currency || '').trim().toUpperCase();
    if (!cur || cur === 'EUR') return formatCurrency(n);
    return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 8, ...opts })} ${cur}`;
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

  const assetHoldings = useMemo(() => {
    // All assets the client owns = open positions that are linked to an Asset.
    // We aggregate by asset id for a clean "Actifs détenus" list.
    const map = new Map<
      string,
      {
        assetId: string;
        assetName: string;
        assetType: string;
        assetReference: string;
        assetCurrency: string;
        logoUrl: string;
        totalInvested: number;
        totalInvestedAssetCurrency: number;
        totalQuantity: number;
        totalEntryValue: number; // sum(entry_price * qty) in asset currency
        totalEntryQty: number; // sum(qty) used for avg entry price
        totalFxWeightedAsset: number; // sum(invested_amount_asset_currency) for avg FX
        totalFxWeightedEur: number; // sum(invested_amount_asset_currency / fx) for avg FX
        latestOpenedAtIso: string | null;
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

    for (const p of positions || []) {
      if (!p) continue;
      if (String(p.status || '') !== 'open') continue; // open positions only

      const assetId = p.assetId || p.asset_id || p.asset?.id || null;
      if (!assetId) continue;

      const assetName = p.assetName || p.asset_name || p.asset?.name || String(assetId);
      const assetType = p.assetType || p.asset_type || p.asset?.type || '';
      const assetReference = p.assetReference || p.asset_reference || p.asset?.reference || '';
      const assetCurrency = p.assetCurrency || p.asset_currency || p.asset?.currency || '';
      const logoUrl = String(p?.asset?.logoUrl || p?.asset?.logo_url || p?.assetLogoUrl || p?.asset_logo_url || '').trim();

      const investedNum = typeof p.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
      const invested = Number.isFinite(investedNum) ? investedNum : 0;

      const investedAssetNum =
        p.invested_amount_asset_currency == null
          ? null
          : typeof p.invested_amount_asset_currency === 'string'
            ? parseFloat(p.invested_amount_asset_currency)
            : Number(p.invested_amount_asset_currency);
      const investedAsset = investedAssetNum != null && Number.isFinite(investedAssetNum) ? investedAssetNum : 0;

      const fxNum =
        p.fx_rate_eur_to_asset == null
          ? null
          : typeof p.fx_rate_eur_to_asset === 'string'
            ? parseFloat(p.fx_rate_eur_to_asset)
            : Number(p.fx_rate_eur_to_asset);
      const fxRate = fxNum != null && Number.isFinite(fxNum) && fxNum > 0 ? fxNum : null;
      // Correct direction: EUR = asset_ccy / fx_rate_eur_to_asset
      const investedEurFromFx = investedAsset > 0 && fxRate != null ? investedAsset / fxRate : null;

      const entryPriceNum =
        p.entry_price == null ? null : typeof p.entry_price === 'string' ? parseFloat(p.entry_price) : Number(p.entry_price);
      const entryPrice = entryPriceNum != null && Number.isFinite(entryPriceNum) && entryPriceNum > 0 ? entryPriceNum : null;

      const qtyNum = p.quantity == null ? null : typeof p.quantity === 'string' ? parseFloat(p.quantity) : Number(p.quantity);
      let qty = qtyNum != null && Number.isFinite(qtyNum) ? qtyNum : 0;
      if (!qty) {
        // Best-effort fallback: qty ≈ invested_amount_asset_currency / entry_price (or invested_amount / entry_price)
        const investedAssetFallback = investedAssetNum != null && Number.isFinite(investedAssetNum) ? investedAssetNum : null;
        if (entryPrice != null) {
          const base = investedAssetFallback != null ? investedAssetFallback : invested;
          if (Number.isFinite(base) && base > 0) qty = base / entryPrice;
        }
      }

      const prev =
        map.get(String(assetId)) || ({
          assetId: String(assetId),
          assetName,
          assetType,
          assetReference,
          assetCurrency,
          logoUrl,
          totalInvested: 0,
          totalInvestedAssetCurrency: 0,
          totalQuantity: 0,
          totalEntryValue: 0,
          totalEntryQty: 0,
          totalFxWeightedAsset: 0,
          totalFxWeightedEur: 0,
          latestOpenedAtIso: null,
        } as const);

      map.set(String(assetId), {
        ...prev,
        assetName,
        assetType,
        assetReference,
        assetCurrency: assetCurrency || prev.assetCurrency,
        logoUrl: logoUrl || prev.logoUrl,
        totalInvested: prev.totalInvested + invested,
        totalInvestedAssetCurrency: prev.totalInvestedAssetCurrency + (investedAsset || 0),
        totalQuantity: prev.totalQuantity + (Number.isFinite(qty) ? qty : 0),
        totalEntryValue:
          prev.totalEntryValue + (entryPrice != null && Number.isFinite(qty) && qty > 0 ? entryPrice * qty : 0),
        totalEntryQty: prev.totalEntryQty + (entryPrice != null && Number.isFinite(qty) && qty > 0 ? qty : 0),
        totalFxWeightedAsset: prev.totalFxWeightedAsset + (investedAsset || 0),
        totalFxWeightedEur: prev.totalFxWeightedEur + (investedEurFromFx != null ? investedEurFromFx : 0),
        latestOpenedAtIso: pickLatestIso(prev.latestOpenedAtIso, p.opened_at || null),
      });
    }

    return Array.from(map.values()).sort((a, b) => b.totalInvested - a.totalInvested);
  }, [positions]);

  const investedProducts = useMemo(() => {
    // Products the client is invested in = completed "transfert" transactions
    // that moved funds into a product (balance -> product), net of withdrawals (product -> balance).
    const map = new Map<
      string,
      {
        productId: string;
        productName: string;
        productType: string;
        productReference: string;
        netInvested: number;
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

    const completedTransactions = (transactions || []).filter((t: any) => t?.status === 'termine');
    for (const t of completedTransactions) {
      if (!t) continue;
      if (String(t.type || '') !== 'transfert') continue;

      const to = t?.to ?? t?.to_field ?? t?.transfer_to ?? t?.transferTo ?? null;
      const from = t?.from ?? t?.from_field ?? t?.transfer_from ?? t?.transferFrom ?? null;

      // Exclude trading orders (balance -> trading wallet)
      if (to != null && String(to) === 'trading') continue;

      const productId =
        (t?.productId != null ? String(t.productId) : null) ||
        (to != null ? String(to) : null) ||
        (t?.subscription_details?.productId != null ? String(t.subscription_details.productId) : null);

      if (!productId || productId === 'balance' || productId === 'trading') continue;

      // Skip technical product if it ever leaks here
      const productReference = String(t?.productReference || t?.product_reference || '').trim();
      if (productReference === 'TRADING_WALLET') continue;

      const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
      const amt = Number.isFinite(amountNum) ? amountNum : 0;
      if (!amt) continue;

      const toIsBalance = to != null && String(to) === 'balance';
      const fromIsBalance = from != null && String(from) === 'balance';

      // Net invested: + when funds go into the product, - when funds exit to balance.
      const delta = toIsBalance ? -amt : fromIsBalance ? amt : amt;

      const prev =
        map.get(productId) || ({
          productId,
          productName: t?.productName || t?.product_name || productId,
          productType: t?.productType || t?.product_type || '',
          productReference,
          netInvested: 0,
          latestDateIso: null,
        } as const);

      map.set(productId, {
        ...prev,
        productName: t?.productName || prev.productName,
        productReference: productReference || prev.productReference,
        netInvested: prev.netInvested + delta,
        latestDateIso: pickLatestIso(prev.latestDateIso, t?.datetime || null),
      });
    }

    return Array.from(map.values())
      .filter((p) => p.netInvested > 0.009)
      .sort((a, b) => b.netInvested - a.netInvested);
  }, [transactions]);

  const assetsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of assetsIndex || []) {
      const id = a?.id != null ? String(a.id) : '';
      if (id) map.set(id, a);
    }
    return map;
  }, [assetsIndex]);

  const productsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of productsIndex || []) {
      const id = p?.id != null ? String(p.id) : '';
      if (id) map.set(id, p);
    }
    return map;
  }, [productsIndex]);

  const investedByAssetFromTransactions = useMemo(() => {
    // Prefer calculating "valeur investie" from completed trade transactions.
    // ProductDetail creates "transfert" transactions with subscription_details.tradeType='asset'
    // and subscription_details.assetId + fxRateEurToAsset.
    const map = new Map<
      string,
      {
        investedEur: number;
        investedAsset: number; // invested in asset currency (sum(amount_eur * fxRateEurToAsset))
      }
    >();

    const completed = (transactions || []).filter((t: any) => String(t?.status || '').toLowerCase() === 'termine');
    for (const t of completed) {
      if (!t) continue;
      if (String(t?.type || '') !== 'transfert') continue;

      const details = t?.subscription_details || t?.subscriptionDetails || {};
      if (String(details?.tradeType || '') !== 'asset') continue;

      const assetId =
        (t?.assetId != null ? String(t.assetId) : null) ||
        (details?.assetId != null ? String(details.assetId) : null);
      if (!assetId) continue;

      const fxNum =
        t?.fx_rate_eur_to_asset == null
          ? (details?.fxRateEurToAsset == null
              ? null
              : typeof details.fxRateEurToAsset === 'string'
                ? parseFloat(details.fxRateEurToAsset)
                : Number(details.fxRateEurToAsset))
          : typeof t.fx_rate_eur_to_asset === 'string'
            ? parseFloat(t.fx_rate_eur_to_asset)
            : Number(t.fx_rate_eur_to_asset);
      const fxRate = fxNum != null && Number.isFinite(fxNum) && fxNum > 0 ? fxNum : null;

      const amountAssetNum =
        t?.amount_in_asset_currency == null
          ? null
          : typeof t.amount_in_asset_currency === 'string'
            ? parseFloat(t.amount_in_asset_currency)
            : Number(t.amount_in_asset_currency);
      const amountAsset = amountAssetNum != null && Number.isFinite(amountAssetNum) ? amountAssetNum : null;

      const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
      const amountField = Number.isFinite(amountNum) ? amountNum : 0;

      // Correct direction:
      // - If we have amount_in_asset_currency + fx, then EUR = asset_ccy / fx.
      // - Else assume `amount` is already in EUR (frontend sends EUR), and derive asset_ccy = EUR * fx.
      const amountEur =
        amountAsset != null && fxRate != null ? amountAsset / fxRate : amountField;
      const derivedAsset = fxRate != null ? amountEur * fxRate : 0;
      const amountAssetFinal = amountAsset != null ? amountAsset : derivedAsset;

      if (!amountEur) continue;

      const prev = map.get(assetId) || { investedEur: 0, investedAsset: 0 };
      map.set(assetId, {
        investedEur: prev.investedEur + amountEur,
        investedAsset: prev.investedAsset + (amountAssetFinal || 0),
      });
    }

    return map;
  }, [transactions]);

  const mergedHoldingsTableRows = useMemo(() => {
    type Row =
      | {
          kind: 'asset';
          key: string;
          name: string;
          logoUrl: string;
          type: string;
          reference: string;
          lastIso: string | null;
          quantity: number;
          currency: string;
          avgPaid: number | null;
          currentPrice: number | null;
          investedEur: number | null; // valeur investie en EUR
          investedAsset: number | null; // valeur investie en devise de l'actif (si dispo)
          pnl: number | null; // P&L (asset currency if possible, else EUR)
          pnlPct: number | null;
        }
      | {
          kind: 'product';
          key: string;
          name: string;
          logoUrl: string;
          type: string;
          reference: string;
          lastIso: string | null;
          quantity: null;
          currency: string;
          avgPaid: null;
          currentPrice: null;
          investedEur: null;
          investedAsset: null;
          pnl: null;
          pnlPct: null;
        };

    const rows: Row[] = [];

    for (const h of assetHoldings || []) {
      const asset = assetsById.get(String(h.assetId)) || null;
      const logoUrl = String(asset?.logoUrl || asset?.logo_url || h.logoUrl || '').trim();
      const currency = String(asset?.currency || h.assetCurrency || '').trim().toUpperCase();
      const currentPriceRaw = asset?.lastPrice ?? asset?.price ?? null;
      const currentPriceNum =
        currentPriceRaw == null ? null : typeof currentPriceRaw === 'string' ? parseFloat(currentPriceRaw) : Number(currentPriceRaw);
      const currentPrice = currentPriceNum != null && Number.isFinite(currentPriceNum) ? currentPriceNum : null;

      const qty = Number.isFinite(h.totalQuantity) ? h.totalQuantity : 0;

      const investedFromTx = investedByAssetFromTransactions.get(String(h.assetId)) || null;
      const investedAssetFromPos =
        Number.isFinite(h.totalInvestedAssetCurrency) && h.totalInvestedAssetCurrency > 0 ? h.totalInvestedAssetCurrency : null;
      const investedEurFromPosFx =
        h.totalFxWeightedEur > 0 ? h.totalFxWeightedEur : (Number.isFinite(h.totalInvested) ? h.totalInvested : 0);

      const investedEur = investedFromTx?.investedEur ?? investedEurFromPosFx;
      const investedAsset =
        investedFromTx && investedFromTx.investedAsset > 0 ? investedFromTx.investedAsset : investedAssetFromPos;

      const avgPaid =
        h.totalEntryQty > 0 && h.totalEntryValue > 0
          ? h.totalEntryValue / h.totalEntryQty
          : investedAsset != null && investedAsset > 0 && qty > 0
            ? investedAsset / qty
            : null;

      // P&L: when we have investedAsset and currentPrice we compute in asset currency.
      // Otherwise, fallback to EUR only (but without FX conversion we can't compute market value reliably).
      const marketValueAsset = currentPrice != null && qty > 0 ? qty * currentPrice : null;
      const pnlAsset = marketValueAsset != null && investedAsset != null && investedAsset > 0 ? marketValueAsset - investedAsset : null;
      const pnlPct = pnlAsset != null && investedAsset != null && investedAsset > 0 ? (pnlAsset / investedAsset) * 100 : null;

      // If we can infer average FX from transactions, also provide EUR P&L implicitly via displayed investedEur and inferred FX.
      // (We keep pnl in asset currency for correctness when asset currency != EUR.)
      const pnl = pnlAsset;

      rows.push({
        kind: 'asset',
        key: `asset-${h.assetId}`,
        name: h.assetName,
        logoUrl,
        type: String(h.assetType || asset?.type || asset?.category || asset?.subcategory || '').trim(),
        reference: h.assetReference || String(asset?.reference || asset?.symbol || ''),
        lastIso: h.latestOpenedAtIso,
        quantity: qty,
        currency,
        avgPaid,
        currentPrice,
        investedEur: Number.isFinite(investedEur) ? investedEur : null,
        investedAsset: investedAsset != null && Number.isFinite(investedAsset) ? investedAsset : null,
        pnl,
        pnlPct,
      });
    }

    for (const p of investedProducts || []) {
      const product = productsById.get(String(p.productId)) || null;
      const imageUrl = String(product?.imageUrl || product?.image_url || '').trim();
      const productTypeFromProduct = String(
        product?.type || product?.subcategory || product?.categoryName || product?.category || ''
      ).trim();
      const productReferenceFromProduct = String(product?.reference || '').trim();
      rows.push({
        kind: 'product',
        key: `product-${p.productId}`,
        name: p.productName,
        logoUrl: imageUrl,
        type: productTypeFromProduct || p.productType || '',
        reference: productReferenceFromProduct || p.productReference,
        lastIso: p.latestDateIso,
        quantity: null,
        currency: 'EUR',
        avgPaid: null,
        currentPrice: null,
        investedEur: null,
        investedAsset: null,
        pnl: null,
        pnlPct: null,
      });
    }

    const timeOf = (iso: string | null) => {
      if (!iso) return -1;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) ? t : -1;
    };

    return rows.sort((a, b) => {
      const ta = timeOf(a.lastIso);
      const tb = timeOf(b.lastIso);
      if (ta !== tb) return tb - ta;
      return a.kind === b.kind ? 0 : a.kind === 'asset' ? -1 : 1;
    });
  }, [assetHoldings, investedProducts, assetsById, productsById, investedByAssetFromTransactions]);

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
              <CardDescription>Vos actifs (ordres ouverts) et vos produits en cours d’investissement</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'grid', gap: 18 }}>
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Mes actifs</div>
                  {mergedHoldingsTableRows.length === 0 ? (
                    <p>Aucun actif détenu</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Actifs</th>
                            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Réf</th>
                            <th style={{ textAlign: 'left', padding: '10px 8px', whiteSpace: 'nowrap' }}>Dernière ouverture</th>
                            <th style={{ textAlign: 'right', padding: '10px 8px' }}>Quantité</th>
                            <th style={{ textAlign: 'right', padding: '10px 8px' }}>Prix moyen d&apos;achat</th>
                            <th style={{ textAlign: 'right', padding: '10px 8px' }}>Valeur investie</th>
                            <th style={{ textAlign: 'right', padding: '10px 8px' }}>Prix</th>
                            <th style={{ textAlign: 'right', padding: '10px 8px' }}>P&amp;L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mergedHoldingsTableRows.map((r) => {
                            const qtyLabel =
                              r.kind === 'asset'
                                ? r.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 8 })
                                : '—';
                            const avgLabel =
                              r.kind === 'asset' && r.avgPaid != null
                                ? formatMoney(r.avgPaid, r.currency, { maximumFractionDigits: 8 })
                                : '—';
                            const priceLabel =
                              r.kind === 'asset' && r.currentPrice != null
                                ? formatMoney(r.currentPrice, r.currency, { maximumFractionDigits: 8 })
                                : '—';
                            const investedLabelMain =
                              r.kind === 'asset' && r.investedEur != null ? formatCurrency(r.investedEur) : '—';
                            const investedLabelSub =
                              r.kind === 'asset' && r.currency !== 'EUR' && r.investedAsset != null
                                ? `≈ ${formatMoney(r.investedAsset, r.currency, { maximumFractionDigits: 2 })}`
                                : null;
                            const pnlColor = r.pnl == null ? '#111827' : r.pnl >= 0 ? '#10b981' : '#ef4444';
                            const pnlLabel =
                              r.kind === 'asset' && r.pnl != null
                                ? `${r.pnl >= 0 ? '+' : ''}${formatMoney(r.pnl, r.currency, { maximumFractionDigits: 2 })}${r.pnlPct != null ? ` (${(r.pnlPct >= 0 ? '+' : '') + r.pnlPct.toFixed(2)}%)` : ''}`
                                : '—';

                            return (
                              <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '10px 8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
                                    {r.logoUrl ? (
                                      <img
                                        src={r.logoUrl}
                                        alt=""
                                        style={{
                                          width: 28,
                                          height: 28,
                                          borderRadius: 8,
                                          objectFit: r.kind === 'product' ? 'cover' : 'contain',
                                          background: r.kind === 'product' ? 'transparent' : 'rgba(255,255,255,0.9)',
                                        }}
                                        onError={(e) => {
                                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f3f4f6' }} />
                                    )}
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {r.name}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '10px 8px' }}>{r.type || '—'}</td>
                                <td style={{ padding: '10px 8px' }}>{r.reference || '—'}</td>
                                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                                  {r.lastIso ? formatDateTime(r.lastIso) : '—'}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{qtyLabel}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{avgLabel}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                  <div style={{ fontWeight: 800 }}>{investedLabelMain}</div>
                                  {investedLabelSub && (
                                    <div style={{ marginTop: 2, fontSize: 12, color: '#6b7280' }}>{investedLabelSub}</div>
                                  )}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{priceLabel}</td>
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: pnlColor }}>
                                  {pnlLabel}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
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
                        const isTradingTransfer =
                          t.type === 'transfert' &&
                          (t.to === 'trading' || t.to_field === 'trading' || t.transfer_to === 'trading');

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
                                    ? (isTradingTransfer ? (t.assetType || 'Trading') : 'Investissement')
                                    : t.type === 'investissement'
                                      ? 'Investissement'
                                  : t.type === 'bonus'
                                    ? 'Bonus'
                                    : t.type === 'interets'
                                      ? 'Intérêts'
                                      : t.type;
                        const amountNum = typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount);
                        const amountColor = Number.isFinite(amountNum) ? (amountNum >= 0 ? '#10b981' : '#ef4444') : '#111827';
                        const productLabel =
                          t.assetName ||
                          t.productName ||
                          (isTradingTransfer ? (t.assetType || 'Trading') : '-');
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
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Actif</th>
                        <th style={{ textAlign: 'left', padding: '10px 8px' }}>Type</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px' }}>Prix d'achat</th>
                        <th style={{ textAlign: 'right', padding: '10px 8px' }}>Quantité</th>
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
                        const hasAsset = Boolean(p.assetName || p.assetReference || p.assetId || p.asset_id || p.asset?.id);
                        const productLabel = p.productName || p.productId || (hasAsset ? 'Trading' : '-');
                        const assetLabel = p.assetName || p.assetReference || p.assetId || '-';
                        const productType = p.productType || p.product_type || '';
                        const typeLabel = productType || (hasAsset ? 'Trading' : '-');
                        const entryPriceNum =
                          p.entry_price == null ? null : typeof p.entry_price === 'string' ? parseFloat(p.entry_price) : Number(p.entry_price);
                        const qtyNum =
                          p.quantity == null ? null : typeof p.quantity === 'string' ? parseFloat(p.quantity) : Number(p.quantity);
                        const assetCurrency = p.assetCurrency || p.asset_currency || '';
                        const entryPriceLabel =
                          entryPriceNum != null && Number.isFinite(entryPriceNum)
                            ? `${entryPriceNum.toLocaleString('fr-FR', { maximumFractionDigits: 8 })}${assetCurrency ? ` ${assetCurrency}` : ''}`
                            : '-';
                        const qtyLabel =
                          qtyNum != null && Number.isFinite(qtyNum)
                            ? qtyNum.toLocaleString('fr-FR', { maximumFractionDigits: 8 })
                            : '-';
                        const openedLabel = p.opened_at
                          ? formatDateTime(p.opened_at)
                          : p.period_date
                            ? formatDateTime(p.period_date)
                            : '-';
                        const closedLabel = p.closed_at ? formatDateTime(p.closed_at) : '-';
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '10px 8px' }}>{productLabel}</td>
                            <td style={{ padding: '10px 8px' }}>{assetLabel}</td>
                            <td style={{ padding: '10px 8px' }}>{typeLabel}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>{entryPriceLabel}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>{qtyLabel}</td>
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
