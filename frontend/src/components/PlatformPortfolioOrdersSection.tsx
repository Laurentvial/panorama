import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { apiCall } from '../utils/api';
import { formatPositionDateTime, formatPositionDateOnly } from '../utils/positionDateTime';
import { formatAmount } from '../utils/currency';
import '../styles/PlatformPortfolio.css';

const DEFAULT_EMBEDDED_ORDERS_PAGE = 10;
/** Page « Mes positions » : plus de lignes par page que dans le portefeuille. */
const DEFAULT_STANDALONE_ORDERS_PAGE = 50;

const clampPage = (page: number, totalPages: number) => Math.min(Math.max(1, page), Math.max(1, totalPages));

export type PlatformPortfolioOrdersSectionProps = {
  embedded?: boolean;
  /** Nombre de lignes par page (défaut : 10 en portefeuille, 50 sur la page Mes positions). Plafonné à 200. */
  pageSize?: number;
  positions?: any[];
  assetsIndex?: any[];
  productsIndex?: any[];
  parentLoading?: boolean;
};

export function PlatformPortfolioOrdersSection({
  embedded,
  pageSize: pageSizeProp,
  positions: positionsProp,
  assetsIndex: assetsIndexProp,
  productsIndex: productsIndexProp,
  parentLoading,
}: PlatformPortfolioOrdersSectionProps) {
  const ordersPageSize = Math.min(
    200,
    Math.max(1, pageSizeProp ?? (embedded ? DEFAULT_EMBEDDED_ORDERS_PAGE : DEFAULT_STANDALONE_ORDERS_PAGE))
  );

  const { currentUser } = useUser();
  const accountCurrency = (
    currentUser?.accountCurrency ||
    currentUser?.account_currency ||
    'EUR'
  )
    .toString()
    .trim()
    .toUpperCase();
  const showPositionPrices = currentUser?.showPositionPrices === true;

  const [positions, setPositions] = useState<any[]>([]);
  const [assetsIndex, setAssetsIndex] = useState<any[]>([]);
  const [productsIndex, setProductsIndex] = useState<any[]>([]);
  const [internalLoading, setInternalLoading] = useState(!embedded);
  const [ordersPage, setOrdersPage] = useState(1);

  const effectivePositions = embedded ? positionsProp ?? [] : positions;
  const effectiveAssets = embedded ? assetsIndexProp ?? [] : assetsIndex;
  const effectiveProducts = embedded ? productsIndexProp ?? [] : productsIndex;
  const loading = embedded ? Boolean(parentLoading) : internalLoading;

  const visiblePositions = useMemo(() => {
    return (effectivePositions || []).filter((p: any) => {
      return p?.status === 'done';
    });
  }, [effectivePositions]);

  const ordersPagination = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil((visiblePositions || []).length / ordersPageSize));
    const safePage = clampPage(ordersPage, totalPages);
    const start = (safePage - 1) * ordersPageSize;
    return {
      page: safePage,
      totalPages,
      items: (visiblePositions || []).slice(start, start + ordersPageSize),
    };
  }, [visiblePositions, ordersPage, ordersPageSize]);

  useEffect(() => {
    setOrdersPage((p) =>
      clampPage(p, Math.max(1, Math.ceil((visiblePositions || []).length / ordersPageSize)))
    );
  }, [visiblePositions.length, ordersPageSize]);

  const assetsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of effectiveAssets || []) {
      const id = a?.id != null ? String(a.id) : '';
      if (id) map.set(id, a);
    }
    return map;
  }, [effectiveAssets]);

  const productsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of effectiveProducts || []) {
      const id = p?.id != null ? String(p.id) : '';
      if (id) map.set(id, p);
    }
    return map;
  }, [effectiveProducts]);

  useEffect(() => {
    if (embedded || !currentUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        setInternalLoading(true);
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
        const [allPositionsList, assetsResponse, productsResponse] = await Promise.all([
          loadAllPositions(),
          apiCall('/api/assets/').catch(() => ({ assets: [] })),
          apiCall('/api/products/').catch(() => ({ products: [] })),
        ]);
        if (cancelled) return;
        setPositions(allPositionsList);
        setAssetsIndex((assetsResponse as any)?.assets || []);
        setProductsIndex((productsResponse as any)?.products || []);
      } catch (e) {
        console.error('Error loading positions:', e);
      } finally {
        if (!cancelled) setInternalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embedded, currentUser?.id]);

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

  const getPositionPriceLabels = (
    entryPriceNum: number | null,
    qtyNum: number | null,
    pnlNum: number | null,
    investedNum: number | null,
    investedAssetNum: number | null,
    assetCurrency: string,
    fxRate: number | null
  ) => {
    const entryPrice = entryPriceNum != null && Number.isFinite(entryPriceNum) && entryPriceNum > 0 ? entryPriceNum : null;
    const qty = qtyNum != null && Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : null;
    const pnl = pnlNum != null && Number.isFinite(pnlNum) ? pnlNum : null;
    const priceOptions = { maximumFractionDigits: 8 };

    if (entryPrice != null && qty != null && pnl != null) {
      const pnlInAssetCurrency = assetCurrency === 'EUR'
        ? pnl
        : fxRate != null && fxRate > 0
          ? pnl * fxRate
          : null;

      if (pnlInAssetCurrency != null) {
        const sellPrice = entryPrice + pnlInAssetCurrency / qty;
        return {
          buyPriceLabel: formatMoney(entryPrice, assetCurrency, priceOptions),
          sellPriceLabel: Number.isFinite(sellPrice) ? formatMoney(sellPrice, assetCurrency, priceOptions) : '-',
        };
      }
    }

    const invested = investedNum != null && Number.isFinite(investedNum) ? investedNum : null;
    const investedAsset = investedAssetNum != null && Number.isFinite(investedAssetNum) ? investedAssetNum : null;

    if (assetCurrency !== 'EUR' && investedAsset != null) {
      const sellTotal = pnl != null && fxRate != null && fxRate > 0 ? investedAsset + pnl * fxRate : null;
      return {
        buyPriceLabel: formatMoney(investedAsset, assetCurrency, { maximumFractionDigits: 2 }),
        sellPriceLabel: sellTotal != null && Number.isFinite(sellTotal)
          ? formatMoney(sellTotal, assetCurrency, { maximumFractionDigits: 2 })
          : '-',
      };
    }

    const sellTotal = invested != null && pnl != null ? invested + pnl : null;
    return {
      buyPriceLabel: invested != null ? formatAccountAmount(invested) : '-',
      sellPriceLabel: sellTotal != null && Number.isFinite(sellTotal)
        ? formatAccountAmount(sellTotal)
        : '-',
    };
  };

  if (loading) {
    return (
      <Card className="platform-portfolioSectionCard">
        <CardHeader>
          <CardTitle>Ordres</CardTitle>
          <CardDescription>Vos achats/ventes et mouvements</CardDescription>
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
        <CardTitle>Ordres</CardTitle>
        <CardDescription>Vos achats/ventes et mouvements</CardDescription>
      </CardHeader>
      <CardContent>
        {visiblePositions.length === 0 ? (
          <p>Aucun ordre</p>
        ) : (
          <>
            <div className="platform-portfolioTableDesktop">
              <div className="platform-portfolioTableWrap">
                <table className="platform-portfolioTable">
                  <thead>
                    <tr className="platform-portfolioTheadRow">
                      <th className="platform-portfolioTh">Actif</th>
                      <th className="platform-portfolioTh">Type</th>
                      <th className="platform-portfolioTh">Réf</th>
                      <th className="platform-portfolioTh">Date d'ouverture</th>
                      <th className="platform-portfolioTh">Date de fermeture</th>
                      {showPositionPrices && (
                        <>
                          <th className="platform-portfolioTh platform-portfolioAlignRight">Prix d'achat</th>
                          <th className="platform-portfolioTh platform-portfolioAlignRight">Prix de vente</th>
                        </>
                      )}
                      <th className="platform-portfolioTh platform-portfolioAlignRight">Investi</th>
                      <th className="platform-portfolioTh platform-portfolioAlignRight">P&L</th>
                      <th className="platform-portfolioTh">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersPagination.items.map((p: any) => {
                      const investedNum =
                        typeof p.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
                      const pnlNum =
                        p.profit_loss == null
                          ? null
                          : typeof p.profit_loss === 'string'
                            ? parseFloat(p.profit_loss)
                            : Number(p.profit_loss);
                      const statusLabel =
                        p.status === 'open'
                          ? 'Ouverte'
                          : p.status === 'done'
                            ? 'Fermée'
                            : p.status === 'cancelled'
                              ? 'Annulée'
                              : p.status || '-';
                      const hasAsset = Boolean(p.assetName || p.assetReference || p.assetId || p.asset_id || p.asset?.id);
                      const assetId = p.assetId || p.asset_id || p.asset?.id || null;
                      const asset = assetId ? assetsById.get(String(assetId)) : null;
                      const positionAssetType = p.assetType || p.asset_type || p.asset?.type || '';
                      let productTypeLabel = '';
                      if (hasAsset) {
                        productTypeLabel =
                          positionAssetType || asset?.type || asset?.category || asset?.subcategory || 'Trading';
                      } else if (p.productId) {
                        const product = productsById.get(String(p.productId));
                        productTypeLabel =
                          p.productType ||
                          p.product_type ||
                          product?.type ||
                          product?.subcategory ||
                          product?.categoryName ||
                          product?.category ||
                          '-';
                      } else {
                        productTypeLabel = '-';
                      }
                      const assetLabel = p.assetName || p.assetReference || p.assetId || '-';
                      let refLabel = '-';
                      if (hasAsset && asset) {
                        refLabel = asset?.reference || asset?.symbol || p.assetReference || p.asset_reference || '-';
                      } else if (p.productId) {
                        const product = productsById.get(String(p.productId));
                        refLabel = p.productReference || p.product_reference || product?.reference || '-';
                      }
                      const entryPriceNum =
                        p.entry_price == null ? null : typeof p.entry_price === 'string' ? parseFloat(p.entry_price) : Number(p.entry_price);
                      const qtyNum =
                        p.quantity == null ? null : typeof p.quantity === 'string' ? parseFloat(p.quantity) : Number(p.quantity);
                      const assetCurrency = (p.assetCurrency || p.asset_currency || asset?.currency || 'EUR').trim().toUpperCase();
                      const fxNum =
                        p?.fx_rate_eur_to_asset == null
                          ? null
                          : typeof p.fx_rate_eur_to_asset === 'string'
                            ? parseFloat(p.fx_rate_eur_to_asset)
                            : Number(p.fx_rate_eur_to_asset);
                      const fxRate = fxNum != null && Number.isFinite(fxNum) && fxNum > 0 ? fxNum : null;
                      let pnlAsset: number | null = null;
                      let pnlEur: number | null = pnlNum;
                      if (pnlNum != null && Number.isFinite(pnlNum)) {
                        if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
                          pnlEur = pnlNum;
                          pnlAsset = pnlNum * fxRate;
                        } else {
                          pnlEur = pnlNum;
                          pnlAsset = null;
                        }
                      } else if (p?.status === 'open' && hasAsset && asset && entryPriceNum != null && qtyNum != null && qtyNum > 0) {
                        const currentPriceRaw = asset?.lastPrice ?? asset?.price ?? null;
                        const currentPriceNum =
                          currentPriceRaw == null ? null : typeof currentPriceRaw === 'string' ? parseFloat(currentPriceRaw) : Number(currentPriceRaw);
                        const currentPrice = currentPriceNum != null && Number.isFinite(currentPriceNum) ? currentPriceNum : null;
                        if (currentPrice != null && entryPriceNum > 0) {
                          const marketValue = qtyNum * currentPrice;
                          const costBasis = qtyNum * entryPriceNum;
                          pnlAsset = marketValue - costBasis;
                          if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
                            pnlEur = pnlAsset / fxRate;
                          } else {
                            pnlEur = pnlAsset;
                            pnlAsset = null;
                          }
                        }
                      }
                      const hasStoredProfitLoss = pnlNum != null && Number.isFinite(pnlNum);
                      let pnlLabelMain: string;
                      let pnlLabelSub: string | null = null;
                      let finalPnlColor: string;
                      if (assetCurrency === 'EUR') {
                        pnlLabelMain = pnlEur != null && Number.isFinite(pnlEur) ? formatAccountAmount(pnlEur) : '-';
                        finalPnlColor =
                          pnlEur != null && Number.isFinite(pnlEur) ? (pnlEur >= 0 ? '#10b981' : '#ef4444') : '#111827';
                      } else if (hasStoredProfitLoss && pnlEur != null && Number.isFinite(pnlEur)) {
                        pnlLabelMain = formatAccountAmount(pnlEur);
                        pnlLabelSub =
                          pnlAsset != null && Number.isFinite(pnlAsset)
                            ? `≈ ${formatMoney(pnlAsset, assetCurrency, { maximumFractionDigits: 2 })}`
                            : null;
                        finalPnlColor =
                          pnlEur != null && Number.isFinite(pnlEur) ? (pnlEur >= 0 ? '#10b981' : '#ef4444') : '#111827';
                      } else if (pnlAsset != null && Number.isFinite(pnlAsset)) {
                        pnlLabelMain = formatMoney(pnlAsset, assetCurrency, { maximumFractionDigits: 2 });
                        pnlLabelSub =
                          pnlEur != null && Number.isFinite(pnlEur) ? `≈ ${formatAccountAmount(pnlEur)}` : null;
                        finalPnlColor =
                          pnlAsset != null && Number.isFinite(pnlAsset) ? (pnlAsset >= 0 ? '#10b981' : '#ef4444') : '#111827';
                      } else {
                        pnlLabelMain = pnlEur != null && Number.isFinite(pnlEur) ? formatAccountAmount(pnlEur) : '-';
                        finalPnlColor =
                          pnlEur != null && Number.isFinite(pnlEur) ? (pnlEur >= 0 ? '#10b981' : '#ef4444') : '#111827';
                      }
                      const investedAssetNum =
                        p?.invested_amount_asset_currency == null
                          ? null
                          : typeof p.invested_amount_asset_currency === 'string'
                            ? parseFloat(p.invested_amount_asset_currency)
                            : Number(p.invested_amount_asset_currency);
                      let investedLabelMain: string;
                      let investedLabelSub: string | null = null;
                      if (assetCurrency !== 'EUR' && investedAssetNum != null && Number.isFinite(investedAssetNum)) {
                        investedLabelMain = formatMoney(investedAssetNum, assetCurrency, { maximumFractionDigits: 2 });
                        if (fxRate != null && fxRate > 0) {
                          const investedEurEstimate = investedAssetNum / fxRate;
                          investedLabelSub = `≈ ${formatAccountAmount(investedEurEstimate)}`;
                        }
                      } else {
                        investedLabelMain =
                          investedNum != null && Number.isFinite(investedNum) ? formatAccountAmount(investedNum) : '-';
                      }
                      const openedLabel = p.opened_at
                        ? formatPositionDateTime(p.opened_at)
                        : p.period_date
                          ? formatPositionDateOnly(p.period_date)
                          : '-';
                      const closedLabel = p.closed_at ? formatPositionDateTime(p.closed_at) : '-';
                      const { buyPriceLabel, sellPriceLabel } = getPositionPriceLabels(
                        entryPriceNum,
                        qtyNum,
                        pnlNum,
                        investedNum,
                        investedAssetNum,
                        assetCurrency,
                        fxRate
                      );
                      return (
                        <tr key={p.id} className="platform-portfolioTbodyRow">
                          <td className="platform-portfolioTd">{assetLabel}</td>
                          <td className="platform-portfolioTd">{productTypeLabel}</td>
                          <td className="platform-portfolioTd">{refLabel}</td>
                          <td className="platform-portfolioTd platform-portfolioNowrap">{openedLabel}</td>
                          <td className="platform-portfolioTd platform-portfolioNowrap">{closedLabel}</td>
                          {showPositionPrices && (
                            <>
                              <td className="platform-portfolioTd platform-portfolioAlignRight">{buyPriceLabel}</td>
                              <td className="platform-portfolioTd platform-portfolioAlignRight">{sellPriceLabel}</td>
                            </>
                          )}
                          <td className="platform-portfolioTd platform-portfolioAlignRight">
                            <div style={{ fontWeight: 700 }}>{investedLabelMain}</div>
                            {investedLabelSub && (
                              <div style={{ marginTop: 2, fontSize: 12 }} className="platform-portfolioMuted">
                                {investedLabelSub}
                              </div>
                            )}
                          </td>
                          <td className="platform-portfolioTd platform-portfolioAlignRight">
                            <div style={{ fontWeight: 700, color: finalPnlColor }}>{pnlLabelMain}</div>
                            {pnlLabelSub && (
                              <div style={{ marginTop: 2, fontSize: 12 }} className="platform-portfolioMuted">
                                {pnlLabelSub}
                              </div>
                            )}
                          </td>
                          <td className="platform-portfolioTd">{statusLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="platform-portfolioOrdersCards">
              {ordersPagination.items.map((p: any) => {
                const investedNum =
                  typeof p.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
                const pnlNum =
                  p.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
                const hasAsset = Boolean(p.assetName || p.assetReference || p.assetId || p.asset_id || p.asset?.id);
                const assetId = p.assetId || p.asset_id || p.asset?.id || null;
                const asset = assetId ? assetsById.get(String(assetId)) : null;
                const positionAssetType = p.assetType || p.asset_type || p.asset?.type || '';
                let productTypeLabel = '';
                if (hasAsset) {
                  productTypeLabel = positionAssetType || asset?.type || asset?.category || asset?.subcategory || 'Trading';
                } else if (p.productId) {
                  const product = productsById.get(String(p.productId));
                  productTypeLabel =
                    p.productType ||
                    p.product_type ||
                    product?.type ||
                    product?.subcategory ||
                    product?.categoryName ||
                    product?.category ||
                    '-';
                } else {
                  productTypeLabel = '-';
                }
                const assetLabel = p.assetName || p.assetReference || p.assetId || '-';
                let refLabel = '-';
                if (hasAsset && asset) {
                  refLabel = asset?.reference || asset?.symbol || p.assetReference || p.asset_reference || '-';
                } else if (p.productId) {
                  const product = productsById.get(String(p.productId));
                  refLabel = p.productReference || p.product_reference || product?.reference || '-';
                }
                const assetCurrency = (p.assetCurrency || p.asset_currency || asset?.currency || 'EUR').trim().toUpperCase();
                const fxNum =
                  p?.fx_rate_eur_to_asset == null
                    ? null
                    : typeof p.fx_rate_eur_to_asset === 'string'
                      ? parseFloat(p.fx_rate_eur_to_asset)
                      : Number(p.fx_rate_eur_to_asset);
                const fxRate = fxNum != null && Number.isFinite(fxNum) && fxNum > 0 ? fxNum : null;
                let pnlAsset: number | null = null;
                let pnlEur: number | null = pnlNum;
                const entryPriceNum =
                  p.entry_price == null ? null : typeof p.entry_price === 'string' ? parseFloat(p.entry_price) : Number(p.entry_price);
                const qtyNum =
                  p.quantity == null ? null : typeof p.quantity === 'string' ? parseFloat(p.quantity) : Number(p.quantity);
                if (pnlNum != null && Number.isFinite(pnlNum)) {
                  if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
                    pnlEur = pnlNum;
                    pnlAsset = pnlNum * fxRate;
                  } else {
                    pnlEur = pnlNum;
                    pnlAsset = null;
                  }
                } else if (p?.status === 'open' && hasAsset && asset && entryPriceNum != null && qtyNum != null && qtyNum > 0) {
                  const currentPriceRaw = asset?.lastPrice ?? asset?.price ?? null;
                  const currentPriceNum =
                    currentPriceRaw == null ? null : typeof currentPriceRaw === 'string' ? parseFloat(currentPriceRaw) : Number(currentPriceRaw);
                  const currentPrice = currentPriceNum != null && Number.isFinite(currentPriceNum) ? currentPriceNum : null;
                  if (currentPrice != null && entryPriceNum > 0) {
                    const marketValue = qtyNum * currentPrice;
                    const costBasis = qtyNum * entryPriceNum;
                    pnlAsset = marketValue - costBasis;
                    if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
                      pnlEur = pnlAsset / fxRate;
                    } else {
                      pnlEur = pnlAsset;
                      pnlAsset = null;
                    }
                  }
                }
                const hasStoredProfitLoss = pnlNum != null && Number.isFinite(pnlNum);
                let pnlLabelMain: string;
                let pnlLabelSub: string | null = null;
                let finalPnlColor: string;
                if (assetCurrency === 'EUR') {
                  pnlLabelMain = pnlEur != null && Number.isFinite(pnlEur) ? formatAccountAmount(pnlEur) : '-';
                  finalPnlColor =
                    pnlEur != null && Number.isFinite(pnlEur) ? (pnlEur >= 0 ? '#10b981' : '#ef4444') : '#111827';
                } else if (hasStoredProfitLoss && pnlEur != null && Number.isFinite(pnlEur)) {
                  pnlLabelMain = formatAccountAmount(pnlEur);
                  pnlLabelSub =
                    pnlAsset != null && Number.isFinite(pnlAsset)
                      ? `≈ ${formatMoney(pnlAsset, assetCurrency, { maximumFractionDigits: 2 })}`
                      : null;
                  finalPnlColor =
                    pnlEur != null && Number.isFinite(pnlEur) ? (pnlEur >= 0 ? '#10b981' : '#ef4444') : '#111827';
                } else if (pnlAsset != null && Number.isFinite(pnlAsset)) {
                  pnlLabelMain = formatMoney(pnlAsset, assetCurrency, { maximumFractionDigits: 2 });
                  pnlLabelSub = pnlEur != null && Number.isFinite(pnlEur) ? `≈ ${formatAccountAmount(pnlEur)}` : null;
                  finalPnlColor =
                    pnlAsset != null && Number.isFinite(pnlAsset) ? (pnlAsset >= 0 ? '#10b981' : '#ef4444') : '#111827';
                } else {
                  pnlLabelMain = pnlEur != null && Number.isFinite(pnlEur) ? formatAccountAmount(pnlEur) : '-';
                  finalPnlColor =
                    pnlEur != null && Number.isFinite(pnlEur) ? (pnlEur >= 0 ? '#10b981' : '#ef4444') : '#111827';
                }
                const investedAssetNum =
                  p?.invested_amount_asset_currency == null
                    ? null
                    : typeof p.invested_amount_asset_currency === 'string'
                      ? parseFloat(p.invested_amount_asset_currency)
                      : Number(p.invested_amount_asset_currency);
                let investedLabelMain: string;
                let investedLabelSub: string | null = null;
                if (assetCurrency !== 'EUR' && investedAssetNum != null && Number.isFinite(investedAssetNum)) {
                  investedLabelMain = formatMoney(investedAssetNum, assetCurrency, { maximumFractionDigits: 2 });
                  if (fxRate != null && fxRate > 0) {
                    const investedEurEstimate = investedAssetNum / fxRate;
                    investedLabelSub = `≈ ${formatAccountAmount(investedEurEstimate)}`;
                  }
                } else {
                  investedLabelMain =
                    investedNum != null && Number.isFinite(investedNum) ? formatAccountAmount(investedNum) : '-';
                }
                const openedLabel = p.opened_at
                  ? formatPositionDateTime(p.opened_at)
                  : p.period_date
                    ? formatPositionDateOnly(p.period_date)
                    : '-';
                const closedLabel = p.closed_at ? formatPositionDateTime(p.closed_at) : '-';
                const statusLabel =
                  p.status === 'open'
                    ? 'Ouverte'
                    : p.status === 'done'
                      ? 'Fermée'
                      : p.status === 'cancelled'
                        ? 'Annulée'
                        : p.status || '-';
                const { buyPriceLabel, sellPriceLabel } = getPositionPriceLabels(
                  entryPriceNum,
                  qtyNum,
                  pnlNum,
                  investedNum,
                  investedAssetNum,
                  assetCurrency,
                  fxRate
                );
                return (
                  <div key={p.id} className="platform-portfolioOrderCard">
                    <div className="platform-portfolioOrderCardHeader">
                      <span className="platform-portfolioOrderCardAsset">{assetLabel}</span>
                      <span className="platform-portfolioOrderCardType">{productTypeLabel}</span>
                    </div>
                    <div className="platform-portfolioOrderCardMain">
                      <div className="platform-portfolioOrderCardMainItem">
                        <span className="platform-portfolioOrderCardLabel">Investi</span>
                        <span className="platform-portfolioOrderCardValue">
                          {investedLabelMain}
                          {investedLabelSub && <span className="platform-portfolioMuted"> {investedLabelSub}</span>}
                        </span>
                      </div>
                      <div className="platform-portfolioOrderCardMainItem">
                        <span className="platform-portfolioOrderCardLabel">P&L</span>
                        <span className="platform-portfolioOrderCardValue" style={{ color: finalPnlColor }}>
                          {pnlLabelMain}
                          {pnlLabelSub && <span className="platform-portfolioMuted"> {pnlLabelSub}</span>}
                        </span>
                      </div>
                    </div>
                    <div className="platform-portfolioOrderCardSecondary">
                      <div className="platform-portfolioOrderCardSecondaryItem">
                        <span>Réf</span>
                        <span>{refLabel}</span>
                      </div>
                      <div className="platform-portfolioOrderCardSecondaryItem">
                        <span>Date d'ouverture</span>
                        <span>{openedLabel}</span>
                      </div>
                      <div className="platform-portfolioOrderCardSecondaryItem">
                        <span>Date de fermeture</span>
                        <span>{closedLabel}</span>
                      </div>
                      {showPositionPrices && (
                        <>
                          <div className="platform-portfolioOrderCardSecondaryItem">
                            <span>Prix d'achat</span>
                            <span>{buyPriceLabel}</span>
                          </div>
                          <div className="platform-portfolioOrderCardSecondaryItem">
                            <span>Prix de vente</span>
                            <span>{sellPriceLabel}</span>
                          </div>
                        </>
                      )}
                      <div className="platform-portfolioOrderCardSecondaryItem">
                        <span>Statut</span>
                        <span>{statusLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {visiblePositions.length > ordersPageSize && (
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
  );
}
