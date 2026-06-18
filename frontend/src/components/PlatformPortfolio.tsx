import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Wallet, TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import { Button } from './ui/button';
import { apiCall } from '../utils/api';
import { logPlatformAction } from '../utils/platformLogger';
import { formatPositionDateTime, formatPositionDateOnly } from '../utils/positionDateTime';
import { formatAmount } from '../utils/currency';
import { CurrencyIcon } from './CurrencyIcon';
import {
  computePortfolioDisplayPerformance,
  computeProductAccruedGains,
  computeNetContributions,
  getTransferGlobalDelta,
  getTransferProductMovements,
  sumOpenPositionAccruedGains,
} from '../utils/portfolioTransfers';
import { PlatformPortfolioTransactionsSection } from './PlatformPortfolioTransactionsSection';
import { PlatformPortfolioOrdersSection } from './PlatformPortfolioOrdersSection';
import '../styles/PlatformPortfolio.css';

export function PlatformPortfolio() {
  const { currentUser } = useUser();
  const accountCurrency = (currentUser?.accountCurrency || currentUser?.account_currency || 'EUR').toString().trim().toUpperCase();
  const navigate = useNavigate();
  const [assetsIndex, setAssetsIndex] = useState<any[]>([]);
  const [productsIndex, setProductsIndex] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionDocuments, setTransactionDocuments] = useState<Record<string, any[]>>({});
  const [unlinkedContractDocuments, setUnlinkedContractDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadPortfolioData();
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    logPlatformAction('page_view', { route: '/platform/portfolio', page: 'portfolio' });
  }, [currentUser?.id]);

  const loadPortfolioData = async () => {
    try {
      setLoading(true);
      const clientId = currentUser.id;
      const limit = 500;

      const loadAllPositions = async (): Promise<any[]> => {
        const list: any[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const res = await apiCall(`/api/clients/${clientId}/positions/?page=${page}&limit=${limit}`);
          const items = (res as any)?.positions || [];
          list.push(...items);
          const pagination = (res as any).pagination;
          if (pagination && page >= pagination.total_pages) hasMore = false;
          else if (items.length < limit) hasMore = false;
          else page++;
        }
        return list;
      };

      // Run positions, transactions, assets, products, documents in parallel
      const [allPositionsList, transactionsResponse, assetsResponse, productsResponse, documentsResponse] = await Promise.all([
        loadAllPositions(),
        apiCall(`/api/clients/${clientId}/transactions/`),
        apiCall('/api/assets/').catch(() => ({ assets: [] })),
        apiCall('/api/products/').catch(() => ({ products: [] })),
        apiCall(`/api/clients/${clientId}/documents/`).catch(() => ({ documents: [] })),
      ]);

      // Cancelled positions must never appear on the client platform.
      setPositions((allPositionsList || []).filter((p: any) => String(p?.status || '') !== 'cancelled'));
      const sortedTransactions = (transactionsResponse.transactions || []).sort(
        (a: any, b: any) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
      );
      const now = Date.now();
      const filteredTransactions = sortedTransactions.filter((t: any) => {
        const status = String(t?.status || '').toLowerCase();
        const isUpcomingStatus = status === 'en_attente_paiement';
        const type = String(t?.type || '').toLowerCase();
        const isDeposit = type === 'depot';
        const isWithdrawal = type === 'retrait';
        const dt = new Date(t?.datetime).getTime();
        const isFuture = Number.isFinite(dt) && dt > now;
        // Show withdrawals waiting for payment in the client platform transactions table.
        // Keep legacy behavior of hiding other "en_attente_paiement" types.
        return !isFuture && (!isUpcomingStatus || isDeposit || isWithdrawal);
      });
      setTransactions(filteredTransactions);

      // Index contract documents by transaction ID; also collect unlinked contracts
      const documentsMap: Record<string, any[]> = {};
      const unlinked: any[] = [];
      const allDocuments = (documentsResponse as any)?.documents || [];
        allDocuments.forEach((doc: any) => {
          if (doc?.documentType !== 'contract') return;
          if (doc?.transactionId) {
            const txId = String(doc.transactionId);
            if (!documentsMap[txId]) {
              documentsMap[txId] = [];
            }
            documentsMap[txId].push(doc);
          } else {
            unlinked.push(doc);
          }
        });
      setTransactionDocuments(documentsMap);
      setUnlinkedContractDocuments(unlinked);
      
      // Use full assets/products lists for metadata lookup (not restricted to actifs visibles)
      // so positions remain fully visible even when asset/product was removed from client's discover list
      const assetsList = (assetsResponse as any)?.assets || [];
      setAssetsIndex(assetsList);
      const productsList = (productsResponse as any)?.products || [];
      setProductsIndex(productsList);
    } catch (error) {
      console.error('Error loading portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAccountAmount = (value: any) => {
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (!Number.isFinite(n)) return '-';
    return formatAmount(n, accountCurrency);
  };

  const formatMoney = (value: any, currency: string | undefined, opts?: Intl.NumberFormatOptions) => {
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (!Number.isFinite(n)) return '-';
    return formatAmount(n, currency || 'EUR', opts);
  };

  const isCompletedStatus = (status: any) =>
    ['valide', 'cloture'].includes(String(status ?? '').trim().toLowerCase());

  const formatPositionRange = (p: any) => {
    if (p.opened_at) {
      const start = formatPositionDateTime(p.opened_at);
      const end = p.closed_at ? formatPositionDateTime(p.closed_at) : '-';
      return `${start} → ${end}`;
    }
    if (p.period_date) {
      const d = new Date(p.period_date);
      if (!Number.isNaN(d.getTime())) {
        return formatPositionDateOnly(p.period_date);
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

      // Exclure les positions ouvertes sans prix d'achat (générations automatiques)
      const entryPriceNum = p.entry_price == null ? null : typeof p.entry_price === 'string' ? parseFloat(p.entry_price) : Number(p.entry_price);
      const entryPrice = entryPriceNum != null && Number.isFinite(entryPriceNum) && entryPriceNum > 0 ? entryPriceNum : null;
      if (!entryPrice) continue; // Pas de prix d'achat = génération automatique -> exclure

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

      // entryPriceNum et entryPrice sont déjà déclarés plus haut dans le filtre (lignes 259-260)

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
    // Products shown in "Actifs détenus" should reflect net transaction movement:
    // include products where inflows > outflows (net > 0), even without open asset positions.
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

    const normalizeId = (value: any): string | null => {
      if (value == null) return null;
      const v = String(value).trim();
      if (!v || v === 'solde' || v === 'trading') return null;
      return v;
    };

    const completedTransactions = (transactions || []).filter((t: any) => isCompletedStatus(t?.status));

    const addMovement = (productId: string, delta: number, t: any) => {
      if (!Number.isFinite(delta) || delta === 0) return;

      const productReference = String(t?.productReference || t?.product_reference || '').trim();
      if (productReference === 'TRADING_WALLET') return;

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
        productType: t?.productType || t?.product_type || prev.productType,
        productReference: productReference || prev.productReference,
        netInvested: prev.netInvested + delta,
        latestDateIso: pickLatestIso(prev.latestDateIso, t?.datetime || null),
      });
    };

    for (const t of completedTransactions) {
      if (!t) continue;
      if (String(t.type || '') !== 'transfert') continue;

      const toRaw = t?.to ?? t?.to_field ?? t?.transfer_to ?? t?.transferTo ?? null;
      const fromRaw = t?.from ?? t?.from_field ?? t?.transfer_from ?? t?.transferFrom ?? null;
      const to = toRaw != null ? String(toRaw).trim() : '';
      const from = fromRaw != null ? String(fromRaw).trim() : '';

      const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
      const amt = Number.isFinite(amountNum) ? Math.abs(amountNum) : 0;
      if (!amt) continue;

      const productIdFromField =
        normalizeId(t?.productId) ||
        normalizeId(t?.product_id) ||
        normalizeId(t?.subscription_details?.productId);

      const inflowProductId = normalizeId(to);
      const outflowProductId = normalizeId(from);

      // Direction based on transfer endpoints:
      // - solde -> product : +amount on destination product
      // - product -> solde : -amount on source product
      // - product -> product : -source and +destination
      if (from === 'solde' && inflowProductId) {
        addMovement(inflowProductId, amt, t);
        continue;
      }

      if (to === 'solde' && outflowProductId) {
        addMovement(outflowProductId, -amt, t);
        continue;
      }

      if (inflowProductId && outflowProductId) {
        addMovement(outflowProductId, -amt, t);
        addMovement(inflowProductId, amt, t);
        continue;
      }

      // Backward-compatible fallback for historical rows missing one side.
      if (inflowProductId) {
        addMovement(inflowProductId, amt, t);
        continue;
      }
      if (outflowProductId) {
        addMovement(outflowProductId, -amt, t);
        continue;
      }
      if (productIdFromField) {
        addMovement(productIdFromField, amt, t);
      }
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

    const completed = (transactions || []).filter((t: any) => isCompletedStatus(t?.status));
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
    // Create assets map locally for this useMemo (matching PlatformDashboard pattern)
    const assetsMap = new Map<string, any>();
    for (const a of assetsIndex || []) {
      const id = a?.id != null ? String(a.id) : '';
      if (id) assetsMap.set(id, a);
    }

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
          investedEur: number | null; // valeur investie en EUR (from positions)
          investedAsset: null;
          pnl: number | null; // P&L en EUR (from positions)
          pnlPct: number | null;
        };

    const rows: Row[] = [];

    for (const h of assetHoldings || []) {
      const asset = assetsMap.get(String(h.assetId)) || null;
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
      
      // Use netInvested from transactions (calculated correctly in investedProducts)
      // This is the net amount invested in the product (deposits - withdrawals)
      const investedEur = p.netInvested > 0 ? p.netInvested : null;
      
      // P&L affiché = intérêts/gains cumulés (périodes clôturées + en cours), base = capital investi
      const totalPnl = computeProductAccruedGains(String(p.productId), positions);
      const pnl = totalPnl !== 0 ? totalPnl : null;
      const pnlPct = investedEur != null && investedEur > 0 && pnl != null ? (pnl / investedEur) * 100 : null;
      
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
        investedEur: investedEur != null && Number.isFinite(investedEur) ? investedEur : null,
        investedAsset: null,
        pnl: pnl != null && Number.isFinite(pnl) ? pnl : null,
        pnlPct: pnlPct != null && Number.isFinite(pnlPct) ? pnlPct : null,
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
  }, [assetHoldings, investedProducts, assetsIndex, productsById, investedByAssetFromTransactions, positions, transactions]);

  // Stats du haut: même logique que le CRM (ClientPortfolioTab)
  const calculatedValues = useMemo(() => {
    let calculatedInvestedCapital = 0;
    let calculatedTradingPortfolio = 0;
    let calculatedBonus = 0;
    let calculatedProfitLoss = 0;
    let calculatedTotalInvesti = 0;
    let effectiveCurrency: string | null = null;

    const completedTransactions = (transactions || [])
      .filter((t: any) => isCompletedStatus(t?.status))
      .sort((a: any, b: any) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    completedTransactions.forEach((transaction: any) => {
      const amount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : Number(transaction.amount);
      const amt = Number.isFinite(amount) ? amount : 0;
      const txnCcy = (transaction.amountCurrency || transaction.amount_currency || 'EUR').toString().trim().toUpperCase();

      if (transaction.type === 'conversion') {
        calculatedInvestedCapital = amt;
        calculatedTradingPortfolio = 0;
        calculatedTotalInvesti = 0;
        effectiveCurrency = txnCcy;
        return;
      }
      if (effectiveCurrency === null) effectiveCurrency = txnCcy;
      if (txnCcy !== effectiveCurrency) return;

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
          calculatedTradingPortfolio += amt;
          calculatedTotalInvesti += amt;
          break;
        case 'vente':
          calculatedTradingPortfolio -= amt;
          break;
        case 'interets':
          calculatedInvestedCapital += amt;
          // Surperformances = intérêts supplémentaires (hors renta initiale) → ne pas soustraire du P&L
          const subDetails = transaction.subscription_details || transaction.subscriptionDetails;
          if (!subDetails?.is_surperformance) {
            calculatedProfitLoss -= amt;
          }
          break;
        case 'frais':
        case 'perte':
          calculatedProfitLoss -= amt;
          break;
        case 'transfert': {
          const transferDelta = getTransferGlobalDelta(transaction, amt);
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
    // Profit/Loss basé sur:
    // 1. Les transactions (interets, frais, perte)
    // 2. Les positions de trading fermées (done) uniquement
    const completedTransactions = (transactions || []).filter((t: any) => isCompletedStatus(t?.status));
    const surperformanceInterests = completedTransactions
      .filter((t: any) => t?.type === 'interets')
      .reduce((sum: number, t: any) => {
        const subDetails = t?.subscription_details || t?.subscriptionDetails;
        if (!subDetails?.is_surperformance) return sum;
        const amount = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);

    // Base transactions P&L (déjà net des intérêts non-surperformance, frais, pertes)
    const transactionsProfitLoss = calculatedValues.hasCompletedTransactions ? calculatedValues.profitLoss : 0;

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
  }, [positions, calculatedValues, transactions]);

  // Bonus est du cash, donc inclus dans investedCapital -> on ne le soustrait pas
  const availableFunds = useMemo(() => investedCapital - tradingPortfolio, [investedCapital, tradingPortfolio]);

  const portfolioValue = useMemo(
    () => Math.max(0, availableFunds) + tradingPortfolio + profitLoss,
    [availableFunds, tradingPortfolio, profitLoss]
  );

  const portfolioDisplayPerformance = useMemo(() => {
    const netContributions = computeNetContributions(transactions, isCompletedStatus);
    return computePortfolioDisplayPerformance(portfolioValue, netContributions);
  }, [transactions, portfolioValue]);

  const isProfit = profitLoss >= 0;
  const isPortfolioDisplayProfit = portfolioDisplayPerformance.gain >= 0;

  // Répartition du portefeuille: se baser sur les TRANSACTIONS + inclure la BALANCE (liquidités disponibles)
  const allocationByType = useMemo(() => {
    const completedTransactions = (transactions || []).filter((t: any) => isCompletedStatus(t?.status));

    const productTypeById = (productId: any): string | null => {
      if (!productId) return null;
      const id = String(productId);
      const p = (productsIndex || []).find((x: any) => String(x?.id) === id);
      return (p?.type || p?.subcategory || p?.categoryName || p?.category || null) as any;
    };

    const assetTypeById = (assetId: any): string | null => {
      if (!assetId) return null;
      const id = String(assetId);
      const a = (assetsIndex || []).find((x: any) => String(x?.id) === id);
      return (a?.type || a?.subcategory || null) as any;
    };

    const resolveTypeLabel = (t: any, fallbackProductId?: any): string => {
      // 1) If transaction references an asset, prefer its type
      const assetType = assetTypeById(t?.assetId || t?.asset_id || t?.asset) || assetTypeById(t?.asset?.id);
      if (assetType) return String(assetType);

      // 2) If transaction references a product, use product.type
      const pid = t?.productId || t?.product_id || t?.product?.id || fallbackProductId || null;
      const productType = productTypeById(pid);
      if (productType) return String(productType);

      // 3) Fallback to subscription_details.category when available
      const cat = t?.subscription_details?.category || t?.category || null;
      if (cat) return String(cat);

      return 'Autre';
    };

    const totals = new Map<string, number>();

    for (const t of completedTransactions) {
      const amountNum = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
      const amount = Number.isFinite(amountNum) ? amountNum : 0;
      if (!amount) continue;

      if (t?.type === 'transfert') {
        const movements = getTransferProductMovements(t, amount);
        for (const movement of movements) {
          const typeLabel = resolveTypeLabel(t, movement.productId);
          const key = String(typeLabel || 'Autre');
          totals.set(key, (totals.get(key) || 0) + movement.delta);
        }
      } else if (t?.type === 'achat') {
        const delta = amount;
        const typeLabel = resolveTypeLabel(t);
        const key = String(typeLabel || 'Autre');
        totals.set(key, (totals.get(key) || 0) + delta);
      } else if (t?.type === 'vente') {
        const delta = -amount;
        const typeLabel = resolveTypeLabel(t);
        const key = String(typeLabel || 'Autre');
        totals.set(key, (totals.get(key) || 0) + delta);
      } else {
        continue;
      }
    }

    // Ajouter le solde (fonds disponibles)
    const cash = Math.max(0, availableFunds);
    if (cash > 0) {
      totals.set('Balance', (totals.get('Balance') || 0) + cash);
    }

    // Clamp negatives to 0 (cannot display negative allocation)
    const items = Array.from(totals.entries())
      .map(([type, value]) => ({ type, value: Math.max(0, value) }))
      .filter((it) => it.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = items.reduce((sum, it) => sum + it.value, 0);

    const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b'];
    const colorForIndex = (i: number) => palette[i % palette.length];

    return {
      total,
      segments: items.map((it, idx) => ({
        ...it,
        pct: total > 0 ? (it.value / total) * 100 : 0,
        color: colorForIndex(idx),
      })),
    };
  }, [transactions, productsIndex, assetsIndex, availableFunds]);

  return (
    <div className="platform-portfolioPage">
      <h1 className="platform-portfolioPageTitle">Mon portefeuille</h1>
      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="platform-portfolioSummaryGrid">
            <Card className="platform-portfolioCard">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="platform-portfolioStatTitle">Total Investi</CardTitle>
                <CurrencyIcon currency={accountCurrency} size={16} />
              </CardHeader>
              <CardContent>
                <div className="platform-portfolioStatValue">
                  {formatAmount(totalInvesti, accountCurrency)}
                </div>
                <p className="platform-portfolioStatSub">Capital total investi</p>
              </CardContent>
            </Card>

            <Card className="platform-portfolioCard">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="platform-portfolioStatTitle">Bénéfices</CardTitle>
                {isProfit ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <div 
                  className="platform-portfolioStatValue"
                  style={{ color: isProfit ? '#10b981' : '#ef4444' }}
                >
                  {isProfit ? '+' : ''}{formatAmount(profitLoss, accountCurrency)}
                </div>
                <p className="platform-portfolioStatSub">
                  {isProfit ? 'Gain réalisé' : 'Perte réalisée'}
                </p>
              </CardContent>
            </Card>

            <Card className="platform-portfolioCard">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="platform-portfolioStatTitle">Valeur du Portefeuille</CardTitle>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="platform-portfolioStatValue">
                  {formatAmount(portfolioValue, accountCurrency)}
                </div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 600, color: isPortfolioDisplayProfit ? '#10b981' : '#ef4444' }}>
                  {isPortfolioDisplayProfit ? '+' : ''}{formatAmount(portfolioDisplayPerformance.gain, accountCurrency)}
                  {portfolioDisplayPerformance.pct != null && (
                    <span style={{ marginLeft: 6 }}>
                      ({isPortfolioDisplayProfit ? '+' : ''}
                      {portfolioDisplayPerformance.pct.toLocaleString('fr-FR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      %)
                    </span>
                  )}
                </div>

                {allocationByType.total > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        width: '100%',
                        height: 12,
                        borderRadius: 999,
                        overflow: 'hidden',
                        backgroundColor: '#eef2f7',
                        display: 'flex',
                      }}
                      aria-label="Répartition du portefeuille par type d'actif"
                    >
                      {allocationByType.segments.map((seg) => (
                        <div
                          key={seg.type}
                          title={`${seg.type} • ${seg.pct.toFixed(0)}%`}
                          style={{
                            width: `${seg.pct}%`,
                            backgroundColor: seg.color,
                          }}
                        />
                      ))}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 10,
                        fontSize: 12,
                        color: '#6b7280',
                      }}
                    >
                      {allocationByType.segments.slice(0, 6).map((seg) => (
                        <div key={seg.type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: seg.color }} />
                          <span>
                            {seg.type} {seg.pct.toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="platform-portfolioStatSub">Valeur totale actuelle</p>
              </CardContent>
            </Card>
          </div>

          {/* Actifs détenus */}
          <Card className="platform-portfolioSectionCard">
            <CardHeader>
              <CardTitle>Actifs détenus</CardTitle>
              <CardDescription>Vos actifs (ordres ouverts) et vos produits en cours d’investissement</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'grid', gap: 18 }}>
                <div>
                  {mergedHoldingsTableRows.length === 0 ? (
                    <div className="platform-portfolioEmpty">
                      <div className="platform-portfolioEmptyIcon" aria-hidden="true">
                        <Wallet size={18} />
                      </div>
                      <div className="platform-portfolioEmptyTitle">Aucun actif détenu</div>
                      <div className="platform-portfolioEmptyText">
                        Commencez à investir pour voir vos actifs (ordres ouverts) et vos produits en cours d'investissement ici.
                      </div>
                      <div className="platform-portfolioEmptyCta">
                        <Button type="button" variant="outline" onClick={() => navigate('/platform/discover')}>
                          Découvrir les opportunités
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Desktop: tableau (visible >= 768px) */}
                      <div className="platform-portfolioTableDesktop">
                        <div className="platform-portfolioTableWrap">
                          <table className="platform-portfolioTable">
                            <thead>
                              <tr className="platform-portfolioTheadRow">
                                <th className="platform-portfolioTh">Actif</th>
                                <th className="platform-portfolioTh">Type</th>
                                <th className="platform-portfolioTh">Réf</th>
                                <th className="platform-portfolioTh platform-portfolioNowrap">Dernière ouverture</th>
                                <th className="platform-portfolioTh platform-portfolioAlignRight">Quantité</th>
                                <th className="platform-portfolioTh platform-portfolioAlignRight">Prix moyen d'achat</th>
                                <th className="platform-portfolioTh platform-portfolioAlignRight">Valeur investie</th>
                                <th className="platform-portfolioTh platform-portfolioAlignRight">Prix</th>
                                <th className="platform-portfolioTh platform-portfolioAlignRight">P&L</th>
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
                                let investedLabelMain: string;
                                let investedLabelSub: string | null = null;
                                if (r.kind === 'asset' && r.currency !== 'EUR' && r.investedAsset != null && Number.isFinite(r.investedAsset)) {
                                  investedLabelMain = formatMoney(r.investedAsset, r.currency, { maximumFractionDigits: 2 });
                                  if (r.investedEur != null && Number.isFinite(r.investedEur) && r.investedEur > 0) {
                                    const fxRate = r.investedAsset / r.investedEur;
                                    if (fxRate > 0) investedLabelSub = `≈ ${formatAccountAmount(r.investedEur)}`;
                                  }
                                } else {
                                  if (r.kind === 'product' && r.investedEur != null && Number.isFinite(r.investedEur)) {
                                    investedLabelMain = formatAccountAmount(r.investedEur);
                                  } else if (r.kind === 'asset' && r.investedEur != null) {
                                    investedLabelMain = formatAccountAmount(r.investedEur);
                                  } else {
                                    investedLabelMain = '—';
                                  }
                                }
                                const pnlColor = r.pnl == null ? '#111827' : r.pnl >= 0 ? '#10b981' : '#ef4444';
                                let pnlLabelMain: string;
                                let pnlLabelSub: string | null = null;
                                if (r.kind === 'product' && r.pnl != null && Number.isFinite(r.pnl)) {
                                  pnlLabelMain = `${r.pnl >= 0 ? '+' : ''}${formatAccountAmount(r.pnl)}${r.pnlPct != null ? ` (${(r.pnlPct >= 0 ? '+' : '') + r.pnlPct.toFixed(2)}%)` : ''}`;
                                } else if (r.kind === 'asset' && r.pnl != null && Number.isFinite(r.pnl)) {
                                  if (r.currency !== 'EUR' && r.investedAsset != null && r.investedEur != null &&
                                      Number.isFinite(r.investedAsset) && Number.isFinite(r.investedEur) && r.investedEur > 0) {
                                    pnlLabelMain = `${r.pnl >= 0 ? '+' : ''}${formatMoney(r.pnl, r.currency, { maximumFractionDigits: 2 })}${r.pnlPct != null ? ` (${(r.pnlPct >= 0 ? '+' : '') + r.pnlPct.toFixed(2)}%)` : ''}`;
                                    const fxRate = r.investedAsset / r.investedEur;
                                    if (fxRate > 0) {
                                      const pnlEur = r.pnl / fxRate;
                                      pnlLabelSub = `≈ ${pnlEur >= 0 ? '+' : ''}${formatAccountAmount(pnlEur)}`;
                                    }
                                  } else {
                                    pnlLabelMain = `${r.pnl >= 0 ? '+' : ''}${formatMoney(r.pnl, r.currency, { maximumFractionDigits: 2 })}${r.pnlPct != null ? ` (${(r.pnlPct >= 0 ? '+' : '') + r.pnlPct.toFixed(2)}%)` : ''}`;
                                  }
                                } else {
                                  pnlLabelMain = '—';
                                }
                                return (
                                  <tr key={r.key} className="platform-portfolioTbodyRow">
                                    <td className="platform-portfolioTd">
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
                                          <div
                                            onClick={() => {
                                              const id = r.key.split('-').slice(1).join('-');
                                              navigate(`/platform/product/${id}`);
                                            }}
                                            className="platform-portfolioLink"
                                            style={{
                                              display: 'inline-block',
                                              maxWidth: '100%',
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              cursor: 'pointer',
                                            }}
                                          >
                                            {r.name}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="platform-portfolioTd">{r.type || '—'}</td>
                                    <td className="platform-portfolioTd">{r.reference || '—'}</td>
                                    <td className="platform-portfolioTd platform-portfolioNowrap">
                                      {r.lastIso ? formatPositionDateTime(r.lastIso) : '—'}
                                    </td>
                                    <td className="platform-portfolioTd platform-portfolioAlignRight">{qtyLabel}</td>
                                    <td className="platform-portfolioTd platform-portfolioAlignRight">{avgLabel}</td>
                                    <td className="platform-portfolioTd platform-portfolioAlignRight">
                                      <div style={{ fontWeight: 800 }}>{investedLabelMain}</div>
                                      {investedLabelSub && (
                                        <div style={{ marginTop: 2, fontSize: 12 }} className="platform-portfolioMuted">
                                          {investedLabelSub}
                                        </div>
                                      )}
                                    </td>
                                    <td className="platform-portfolioTd platform-portfolioAlignRight">{priceLabel}</td>
                                    <td className="platform-portfolioTd platform-portfolioAlignRight" style={{ fontWeight: 800, color: pnlColor }}>
                                      <div>{pnlLabelMain}</div>
                                      {pnlLabelSub && (
                                        <div style={{ marginTop: 2, fontSize: 12 }} className="platform-portfolioMuted">
                                          {pnlLabelSub}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {/* Mobile: cartes (visible < 768px) */}
                      <div className="platform-portfolioHoldingsCards">
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
                          let investedLabelMain: string;
                          let investedLabelSub: string | null = null;
                          if (r.kind === 'asset' && r.currency !== 'EUR' && r.investedAsset != null && Number.isFinite(r.investedAsset)) {
                            investedLabelMain = formatMoney(r.investedAsset, r.currency, { maximumFractionDigits: 2 });
                            if (r.investedEur != null && Number.isFinite(r.investedEur) && r.investedEur > 0) {
                              const fxRate = r.investedAsset / r.investedEur;
                              if (fxRate > 0) investedLabelSub = `≈ ${formatAccountAmount(r.investedEur)}`;
                            }
                          } else {
                            if (r.kind === 'product' && r.investedEur != null && Number.isFinite(r.investedEur)) {
                              investedLabelMain = formatAccountAmount(r.investedEur);
                            } else if (r.kind === 'asset' && r.investedEur != null) {
                              investedLabelMain = formatAccountAmount(r.investedEur);
                            } else {
                              investedLabelMain = '—';
                            }
                          }
                          const pnlColor = r.pnl == null ? '#111827' : r.pnl >= 0 ? '#10b981' : '#ef4444';
                          let pnlLabelMain: string;
                          let pnlLabelSub: string | null = null;
                          if (r.kind === 'product' && r.pnl != null && Number.isFinite(r.pnl)) {
                            pnlLabelMain = `${r.pnl >= 0 ? '+' : ''}${formatAccountAmount(r.pnl)}${r.pnlPct != null ? ` (${(r.pnlPct >= 0 ? '+' : '') + r.pnlPct.toFixed(2)}%)` : ''}`;
                          } else if (r.kind === 'asset' && r.pnl != null && Number.isFinite(r.pnl)) {
                            if (r.currency !== 'EUR' && r.investedAsset != null && r.investedEur != null &&
                                Number.isFinite(r.investedAsset) && Number.isFinite(r.investedEur) && r.investedEur > 0) {
                              pnlLabelMain = `${r.pnl >= 0 ? '+' : ''}${formatMoney(r.pnl, r.currency, { maximumFractionDigits: 2 })}${r.pnlPct != null ? ` (${(r.pnlPct >= 0 ? '+' : '') + r.pnlPct.toFixed(2)}%)` : ''}`;
                              const fxRate = r.investedAsset / r.investedEur;
                              if (fxRate > 0) {
                                const pnlEur = r.pnl / fxRate;
                                pnlLabelSub = `≈ ${pnlEur >= 0 ? '+' : ''}${formatAccountAmount(pnlEur)}`;
                              }
                            } else {
                              pnlLabelMain = `${r.pnl >= 0 ? '+' : ''}${formatMoney(r.pnl, r.currency, { maximumFractionDigits: 2 })}${r.pnlPct != null ? ` (${(r.pnlPct >= 0 ? '+' : '') + r.pnlPct.toFixed(2)}%)` : ''}`;
                            }
                          } else {
                            pnlLabelMain = '—';
                          }
                          return (
                            <div key={r.key} className="platform-portfolioHoldingCard">
                              <div className="platform-portfolioHoldingCardHeader">
                                {r.logoUrl ? (
                                  <img
                                    src={r.logoUrl}
                                    alt=""
                                    className="platform-portfolioHoldingCardLogo"
                                    style={{
                                      objectFit: r.kind === 'product' ? 'cover' : 'contain',
                                      background: r.kind === 'product' ? 'transparent' : 'rgba(255,255,255,0.9)',
                                    }}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="platform-portfolioHoldingCardLogoPlaceholder" />
                                )}
                                <div className="platform-portfolioHoldingCardHeaderText">
                                  <div
                                    onClick={() => {
                                      const id = r.key.split('-').slice(1).join('-');
                                      navigate(`/platform/product/${id}`);
                                    }}
                                    className="platform-portfolioLink platform-portfolioHoldingCardName"
                                  >
                                    {r.name}
                                  </div>
                                  <div className="platform-portfolioHoldingCardType">{r.type || '—'}</div>
                                </div>
                              </div>
                              <div className="platform-portfolioHoldingCardMain">
                                <div className="platform-portfolioHoldingCardMainItem">
                                  <span className="platform-portfolioHoldingCardLabel">Valeur investie</span>
                                  <span className="platform-portfolioHoldingCardValue">
                                    {investedLabelMain}
                                    {investedLabelSub && (
                                      <span className="platform-portfolioMuted"> {investedLabelSub}</span>
                                    )}
                                  </span>
                                </div>
                                <div className="platform-portfolioHoldingCardMainItem">
                                  <span className="platform-portfolioHoldingCardLabel">P&L</span>
                                  <span className="platform-portfolioHoldingCardValue" style={{ color: pnlColor }}>
                                    {pnlLabelMain}
                                    {pnlLabelSub && (
                                      <span className="platform-portfolioMuted"> {pnlLabelSub}</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="platform-portfolioHoldingCardSecondary">
                                <div className="platform-portfolioHoldingCardSecondaryItem">
                                  <span>Réf</span>
                                  <span>{r.reference || '—'}</span>
                                </div>
                                <div className="platform-portfolioHoldingCardSecondaryItem">
                                  <span>Dernière ouverture</span>
                                  <span>{r.lastIso ? formatPositionDateTime(r.lastIso) : '—'}</span>
                                </div>
                                <div className="platform-portfolioHoldingCardSecondaryItem">
                                  <span>Quantité</span>
                                  <span>{qtyLabel}</span>
                                </div>
                                <div className="platform-portfolioHoldingCardSecondaryItem">
                                  <span>Prix moyen</span>
                                  <span>{avgLabel}</span>
                                </div>
                                <div className="platform-portfolioHoldingCardSecondaryItem">
                                  <span>Prix</span>
                                  <span>{priceLabel}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <PlatformPortfolioTransactionsSection
            embedded
            transactions={transactions}
            transactionDocuments={transactionDocuments}
            unlinkedContractDocuments={unlinkedContractDocuments}
            parentLoading={loading}
          />

          <PlatformPortfolioOrdersSection
            embedded
            positions={positions}
            assetsIndex={assetsIndex}
            productsIndex={productsIndex}
            parentLoading={loading}
          />

        </>
      )}
    </div>
  );
}
