import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, Check, PieChart, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useIsMobile, useIsPhone, useIsNarrowForCards } from './ui/use-mobile';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { useTheme } from '../contexts/ThemeContext';
import { formatSubcategoryForDisplay } from './transactionUtils';
import { formatAmount } from '../utils/currency';
import {
  computeNetContributions,
  computePortfolioDisplayPerformance,
  getTransferGlobalDelta,
  getTransferProductMovements,
  sumOpenPositionAccruedGains,
} from '../utils/portfolioTransfers';
import '../styles/PlatformDashboardMovers.css';
import '../styles/PlatformPortfolio.css';

/** Stops runaway pagination if the API omits or misreports pagination metadata. */
const DASHBOARD_PAGINATION_MAX_PAGES = 250;
const NEWS_PAGE_LIMIT = 3;

export function PlatformDashboard() {
  const { currentUser, loading: userCtxLoading } = useUser();
  const { settings, loading: themeLoading } = useTheme();
  const isMobile = useIsMobile();
  const isPhone = useIsPhone();
  const isNarrowForCards = useIsNarrowForCards();
  const navigate = useNavigate();
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [newsPosts, setNewsPosts] = useState<any[]>([]);
  const [newsPage, setNewsPage] = useState(0);
  const [newsHasMore, setNewsHasMore] = useState(false);
  const [newsLoadingMore, setNewsLoadingMore] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [verificationConfigLoading, setVerificationConfigLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [verificationConfig, setVerificationConfig] = useState<Record<string, { enabled: boolean }>>({});
  const [documents, setDocuments] = useState<any[]>([]);
  const [clientAssets, setClientAssets] = useState<any[]>([]);
  const [clientProducts, setClientProducts] = useState<any[]>([]);
  const featuredSliderRef = useRef<HTMLDivElement | null>(null);
  const [dashboardLoadError, setDashboardLoadError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const loadNewsPostsWithSignal = async (signal: AbortSignal) => {
    try {
      const newsResponse = await apiCall(`/api/news/?page=1&limit=${NEWS_PAGE_LIMIT}`, { signal });
      setNewsPosts(newsResponse?.news || []);
      setNewsPage(1);
      const pagination = newsResponse?.pagination;
      setNewsHasMore(Boolean(pagination?.hasMore));
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('Error loading news posts:', error);
      if (error?.status === 401) {
        try {
          const apiUrl = getApiBaseUrl();
          const response = await fetch(`${apiUrl}/api/news/?page=1&limit=${NEWS_PAGE_LIMIT}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal,
          });
          if (response.ok) {
            const data = await response.json();
            setNewsPosts(data.news || []);
            setNewsPage(1);
            setNewsHasMore(Boolean(data?.pagination?.hasMore));
            return;
          }
        } catch (fallbackError: any) {
          if (fallbackError?.name === 'AbortError') {
            return;
          }
          console.error('Fallback news fetch also failed:', fallbackError);
        }
      }
      setNewsPosts([]);
      setNewsPage(0);
      setNewsHasMore(false);
    } finally {
      setNewsLoading(false);
    }
  };

  const loadMoreNewsPosts = async () => {
    if (newsLoadingMore || !newsHasMore) {
      return;
    }
    setNewsLoadingMore(true);
    try {
      const nextPage = newsPage + 1;
      const newsResponse = await apiCall(`/api/news/?page=${nextPage}&limit=${NEWS_PAGE_LIMIT}`);
      const incoming = newsResponse?.news || [];
      setNewsPosts((prev) => {
        const existingIds = new Set(prev.map((item: any) => String(item?.id)));
        const dedupedIncoming = incoming.filter((item: any) => !existingIds.has(String(item?.id)));
        return [...prev, ...dedupedIncoming];
      });
      setNewsPage(nextPage);
      setNewsHasMore(Boolean(newsResponse?.pagination?.hasMore));
    } catch (error: any) {
      console.error('Error loading more news posts:', error);
    } finally {
      setNewsLoadingMore(false);
    }
  };

  const getWebsiteNameFromUrl = (url?: string) => {
    if (!url) return '';
    try {
      const host = new URL(url).hostname;
      return host.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const getAssetLogoUrl = (asset: any): string => {
    return (asset?.logoUrl || asset?.logo_url || '').toString();
  };

  const getAssetSubtitle = (asset: any): string => {
    // Best-effort: different APIs may expose different fields.
    return (
      asset?.subtitle ||
      asset?.companyName ||
      asset?.company_name ||
      asset?.group ||
      asset?.groupName ||
      asset?.issuer ||
      asset?.type ||
      asset?.symbol ||
      ''
    ).toString();
  };

  const accountCurrency = (currentUser?.accountCurrency || currentUser?.account_currency || 'EUR').toString().trim().toUpperCase();

  const formatAssetCurrency = (currencyRaw: any): string => {
    const c = (currencyRaw ?? '').toString().trim().toUpperCase();
    if (!c || c === 'EUR' || c === '€') return '€';
    if (c === 'USD') return '$';
    if (c === 'CHF') return 'CHF';
    return c;
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  /** Date de création du document (métier), pas la date d'ajout en base — évite les décalages fuseau. */
  const formatDocumentCreatedOnForDisplay = (doc: { documentCreatedOn?: string | null; createdAt?: string | null }): string => {
    const ymd = doc.documentCreatedOn;
    if (ymd) {
      const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
    if (doc.createdAt) {
      const iso = String(doc.createdAt);
      const m2 = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m2) {
        const d = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return new Date(doc.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return '';
  };

  const featuredItems = React.useMemo(() => {
    const items: Array<{
      kind: 'asset' | 'product';
      key: string;
      data: any;
      availabilityStart: string | null;
      availabilityEnd: string | null;
    }> = [];
    for (const ca of clientAssets || []) {
      if (ca.featured && ca.asset) {
        items.push({
          kind: 'asset',
          key: `asset-${ca.asset.id}`,
          data: ca.asset,
          availabilityStart: ca.availabilityStart ?? null,
          availabilityEnd: ca.availabilityEnd ?? null,
        });
      }
    }
    for (const cp of clientProducts || []) {
      if (cp.featured && cp.product) {
        const p = cp.product;
        items.push({
          kind: 'product',
          key: `product-${p.id}`,
          data: p,
          availabilityStart: cp.availabilityStart ?? p.availabilityStart ?? p.availability_start ?? null,
          availabilityEnd: cp.availabilityEnd ?? p.availabilityEnd ?? p.availability_end ?? null,
        });
      }
    }
    return items;
  }, [clientAssets, clientProducts]);

  const isAssetInPortfolio = (assetId: string) =>
    positions.some((p: any) => {
      const pid = p.assetId || p.asset_id || p.asset?.id;
      return String(pid) === String(assetId) && p.status === 'open';
    });

  const parseNumber = (v: any): number => {
    if (v == null || v === '') return 0;
    const parsed = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getProfitabilityDisplay = (product: any): { text: string; isPositive: boolean } => {
    const hasProfitability = product?.profitability != null && product?.profitability !== '';
    const hasVariable =
      product?.isVariableProfitability === 'Oui' &&
      product?.variableProfitability != null &&
      product?.variableProfitability !== '';
    if (!hasProfitability && !hasVariable) return { text: '', isPositive: true };
    const min = parseNumber(product?.profitability);
    const isPositive = min >= 0;
    const period = product?.profitabilityPeriod ? ` ${product.profitabilityPeriod}` : '';
    if (hasVariable) {
      const max = parseNumber(product?.variableProfitability);
      return { text: `${min.toFixed(2)}% | ${max.toFixed(2)}%${period}`, isPositive };
    }
    return { text: `${min.toFixed(2)}%${period}`, isPositive };
  };

  const scrollFeaturedSlider = (direction: 'left' | 'right') => {
    const slider = featuredSliderRef.current;
    if (!slider) return;
    const step = isMobile ? 280 : 320;
    const delta = direction === 'left' ? -step : step;
    slider.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const formatAvailabilityLabel = (start: string | null, end: string | null): string => {
    const startStr = start ? formatDate(start) : null;
    const endStr = end ? formatDate(end) : null;
    if (startStr && endStr) return `Du ${startStr} au ${endStr}`;
    if (startStr) return `Disponible à partir du ${startStr}`;
    if (endStr) return `Disponible jusqu'au ${endStr}`;
    return 'Disponible dès maintenant et indéfiniment';
  };

  useEffect(() => {
    if (userCtxLoading) {
      return;
    }
    if (!currentUser?.id) {
      setLoading(false);
      setNewsLoading(false);
      setPortfolioLoading(false);
      setVerificationConfigLoading(false);
      setDocumentsLoading(false);
      setAssetsLoading(false);
      setProductsLoading(false);
      setDashboardLoadError(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const { signal } = ac;

    const clientId = currentUser.id;
    const limit = 500;
    setDashboardLoadError(null);
    setNewsLoading(true);
    setPortfolioLoading(true);
    setVerificationConfigLoading(true);
    setDocumentsLoading(true);
    setAssetsLoading(true);
    setProductsLoading(true);
    setLoading(false);

    const loadPaginatedCollection = async (
      pathPrefix: string,
      responseKey: string,
    ): Promise<{ firstPageItems: any[]; loadRemainingPages: () => Promise<any[]> }> => {
      const firstPageResponse = await apiCall(`${pathPrefix}?page=1&limit=${limit}`, { signal });
      const firstPageItems = (firstPageResponse as any)?.[responseKey] || [];
      const firstPagePagination = (firstPageResponse as any)?.pagination;
      const hasMorePages = firstPagePagination
        ? 1 < Number(firstPagePagination.total_pages || 1)
        : firstPageItems.length >= limit;

      const loadRemainingPages = async (): Promise<any[]> => {
        if (!hasMorePages) {
          return firstPageItems;
        }

        const list = [...firstPageItems];
        let page = 2;
        let hasMore = true;

        while (hasMore && page <= DASHBOARD_PAGINATION_MAX_PAGES) {
          const res = await apiCall(`${pathPrefix}?page=${page}&limit=${limit}`, { signal });
          const items = (res as any)?.[responseKey] || [];
          list.push(...items);
          const pagination = (res as any)?.pagination;
          if (pagination && page >= Number(pagination.total_pages || 1)) hasMore = false;
          else if (items.length < limit) hasMore = false;
          else page++;
        }

        return list;
      };

      return { firstPageItems, loadRemainingPages };
    };

    void loadNewsPostsWithSignal(signal);

    void (async () => {
      try {
        const verificationConfigResult = await apiCall(`/api/clients/${clientId}/verification-config/?_t=${Date.now()}`, {
          signal,
        });
        if (cancelled) return;
        setVerificationConfig((verificationConfigResult as any)?.stepsConfig || {});
      } catch (err: any) {
        if (err?.name === 'AbortError' || cancelled) return;
        console.warn('Dashboard: unable to load verification config', err);
        setVerificationConfig({});
      } finally {
        if (!cancelled) {
          setVerificationConfigLoading(false);
        }
      }
    })();

    void (async () => {
      try {
        const documentsResult = await apiCall(`/api/clients/${clientId}/documents/?excludeProductOnly=1`, { signal });
        if (cancelled) return;
        setDocuments((documentsResult as any)?.documents || []);
      } catch (err: any) {
        if (err?.name === 'AbortError' || cancelled) return;
        console.warn('Dashboard: unable to load documents', err);
        setDocuments([]);
      } finally {
        if (!cancelled) setDocumentsLoading(false);
      }
    })();

    void (async () => {
      try {
        const clientAssetsResponse = await apiCall(`/api/clients/${clientId}/assets/`, { signal });
        if (cancelled) return;
        const clientAssetsData = (clientAssetsResponse as any)?.assets || [];
        const assetsList = clientAssetsData.map((ca: any) => ca.asset || ca).filter(Boolean);
        setAssets(assetsList);
        setClientAssets(clientAssetsData);
      } catch (err: any) {
        if (err?.name === 'AbortError' || cancelled) return;
        console.warn('Dashboard: unable to load client assets', err);
        setAssets([]);
        setClientAssets([]);
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    })();

    void (async () => {
      try {
        const clientProductsResponse = await apiCall(`/api/clients/${clientId}/products/`, { signal });
        if (cancelled) return;
        const clientProductsData = (clientProductsResponse as any)?.products || [];
        const productsList = clientProductsData.map((cp: any) => cp.product || cp).filter(Boolean);
        setProducts(productsList);
        setClientProducts(clientProductsData);
      } catch (err: any) {
        if (err?.name === 'AbortError' || cancelled) return;
        console.warn('Dashboard: unable to load client products', err);
        setProducts([]);
        setClientProducts([]);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();

    void (async () => {
      try {
        const [positionsPages, transactionsPages] = await Promise.all([
          loadPaginatedCollection(`/api/clients/${clientId}/positions/`, 'positions'),
          loadPaginatedCollection(`/api/clients/${clientId}/transactions/`, 'transactions'),
        ]);
        if (cancelled) return;
        setPositions((positionsPages.firstPageItems || []).filter((p: any) => String(p?.status || '') !== 'cancelled'));
        setAllTransactions(transactionsPages.firstPageItems || []);
        setPortfolioLoading(false);
        setDashboardLoadError(null);

        void (async () => {
          try {
            const [allPositionsList, allTransactionsList] = await Promise.all([
              positionsPages.loadRemainingPages(),
              transactionsPages.loadRemainingPages(),
            ]);
            if (cancelled) return;
            setPositions((allPositionsList || []).filter((p: any) => String(p?.status || '') !== 'cancelled'));
            setAllTransactions(allTransactionsList || []);
          } catch (err: any) {
            if (err?.name === 'AbortError' || cancelled) return;
            console.warn('Dashboard: unable to load full paginated data in background', err);
          }
        })();
      } catch (error: any) {
        if (cancelled) return;
        if (error?.isRedirecting) return;
        if (error?.status === 401 || error?.message?.includes('token') || error?.message?.includes('Authentication')) return;
        if (error?.name === 'AbortError') return;
        console.error('Error loading dashboard portfolio data:', error);
        const msg =
          error?.isNetworkError || error?.status === 0
            ? 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.'
            : (error?.message as string) || 'Une erreur est survenue lors du chargement.';
        setDashboardLoadError(msg);
        setPortfolioLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [userCtxLoading, currentUser?.id, retryTick]);

  // Parse financial values, handling strings, null, undefined, and ensuring they're numbers
  const parseFinancialValue = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Même critère que PlatformPortfolio pour les transactions "complétées"
  const isCompletedStatus = (status: any) =>
    ['valide', 'cloture'].includes(String(status ?? '').trim().toLowerCase());

  // Stats: même logique que page Portefeuille (PlatformPortfolio) pour Valeur du Portefeuille
  const calculatedValues = React.useMemo(() => {
    let calculatedInvestedCapital = 0;
    let calculatedTradingPortfolio = 0;
    let calculatedProfitLoss = 0;
    let effectiveCurrency: string | null = null;

    const completedTransactions = (allTransactions || [])
      .filter((t: any) => isCompletedStatus(t?.status))
      .sort((a: any, b: any) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    completedTransactions.forEach((transaction: any) => {
      const amount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : Number(transaction.amount);
      const amt = Number.isFinite(amount) ? amount : 0;
      const txnCcy = (transaction.amountCurrency || transaction.amount_currency || 'EUR').toString().trim().toUpperCase();

      if (transaction.type === 'conversion') {
        calculatedInvestedCapital = amt;
        calculatedTradingPortfolio = 0;
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
          calculatedInvestedCapital += amt;
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
        case 'achat':
          calculatedTradingPortfolio += amt;
          break;
        case 'vente':
          calculatedTradingPortfolio -= amt;
          break;
        case 'transfert': {
          calculatedTradingPortfolio += getTransferGlobalDelta(transaction, amt);
          break;
        }
        default:
          break;
      }
    });

    return {
      investedCapital: calculatedInvestedCapital,
      tradingPortfolio: Math.max(0, calculatedTradingPortfolio),
      profitLoss: calculatedProfitLoss,
      hasCompletedTransactions: completedTransactions.length > 0,
    };
  }, [allTransactions]);

  const investedCapital = React.useMemo(
    () =>
      calculatedValues.hasCompletedTransactions
        ? calculatedValues.investedCapital
        : parseFinancialValue(currentUser?.investedCapital || currentUser?.invested_capital || 0),
    [
      calculatedValues.hasCompletedTransactions,
      calculatedValues.investedCapital,
      currentUser?.investedCapital,
      currentUser?.invested_capital,
    ]
  );

  const tradingPortfolio = React.useMemo(
    () =>
      calculatedValues.hasCompletedTransactions
        ? calculatedValues.tradingPortfolio
        : parseFinancialValue(currentUser?.tradingPortfolio || currentUser?.trading_portfolio || 0),
    [
      calculatedValues.hasCompletedTransactions,
      calculatedValues.tradingPortfolio,
      currentUser?.tradingPortfolio,
      currentUser?.trading_portfolio,
    ]
  );

  const profitLoss = React.useMemo(() => {
    // Profit/Loss basé sur:
    // 1. Les transactions (interets, frais, perte) - même logique que PlatformPortfolio
    // 2. Les positions de trading fermées (done) uniquement

    const completedTransactions = (allTransactions || []).filter((t: any) => isCompletedStatus(t?.status));
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
  }, [positions, calculatedValues, allTransactions]);

  const availableFunds = React.useMemo(() => investedCapital - tradingPortfolio, [investedCapital, tradingPortfolio]);

  // Répartition du portefeuille: se baser sur les TRANSACTIONS + inclure la BALANCE (liquidités disponibles)
  const allocationByType = React.useMemo(() => {
    const completedTransactions = (allTransactions || []).filter((t: any) => isCompletedStatus(t?.status));

    const productTypeById = (productId: any): string | null => {
      if (!productId) return null;
      const id = String(productId);
      const p = (products || []).find((x: any) => String(x?.id) === id);
      return (p?.type || p?.subcategory || p?.categoryName || p?.category || null) as any;
    };

    const assetTypeById = (assetId: any): string | null => {
      if (!assetId) return null;
      const id = String(assetId);
      const a = (assets || []).find((x: any) => String(x?.id) === id);
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
      const amount = parseFinancialValue(t?.amount);
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
    const cash = Math.max(0, parseFinancialValue(availableFunds));
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
  }, [allTransactions, products, assets, availableFunds]);

  const portfolioValue = React.useMemo(
    () => Math.max(0, availableFunds) + tradingPortfolio + profitLoss,
    [availableFunds, tradingPortfolio, profitLoss]
  );

  const portfolioDisplayPerformance = React.useMemo(() => {
    const netContributions = computeNetContributions(allTransactions, isCompletedStatus);
    return computePortfolioDisplayPerformance(portfolioValue, netContributions);
  }, [allTransactions, portfolioValue]);

  const isProfit = profitLoss >= 0;
  const isPortfolioDisplayProfit = portfolioDisplayPerformance.gain >= 0;

  // Calculate gainers and losers
  const getGainersAndLosers = () => {
    const assetsWithPriceChange = assets.filter((asset: any) => 
      asset.priceChangePercent !== null && 
      asset.priceChangePercent !== undefined &&
      asset.lastPrice !== null &&
      asset.lastPrice !== undefined
    );

    // Sort by price change percentage
    const sorted = [...assetsWithPriceChange].sort((a: any, b: any) => {
      const aChange = parseFinancialValue(a.priceChangePercent);
      const bChange = parseFinancialValue(b.priceChangePercent);
      return bChange - aChange;
    });

    // Limit to 3 lines per card.
    const gainers = sorted.filter((asset: any) => parseFinancialValue(asset.priceChangePercent) > 0).slice(0, 3);
    const losers = sorted.filter((asset: any) => parseFinancialValue(asset.priceChangePercent) < 0).slice(-3).reverse();

    return { gainers, losers };
  };

  const { gainers, losers } = getGainersAndLosers();
  const isPageLoading = loading || themeLoading;

  // Helper function to map UI step numbers to config step numbers
  // UI Step 1 = Config Steps 1-2 (Identity + Address)
  // UI Step 2 = Config Steps 3-7 (Profile, Preferences, Objectives, Compliance, Funds Sources)
  // UI Step 3 = Config Step 8 (KYC)
  const getConfigStepNumber = (uiStepNumber: number): number => {
    if (uiStepNumber === 3) return 8; // KYC step
    return uiStepNumber; // Steps 1 and 2 map directly
  };

  // Helper function to check if a config step is enabled
  const isConfigStepEnabled = (configStepNumber: number): boolean => {
    const stepKey = `step_${configStepNumber}`;
    const disabledByDefaultIfMissing = [6, 7];
    if (!verificationConfig || verificationConfig[stepKey] === undefined) {
      if (disabledByDefaultIfMissing.includes(configStepNumber)) {
        return false;
      }
      return true;
    }
    const stepConfig = verificationConfig[stepKey];
    if (stepConfig && typeof stepConfig === 'object' && stepConfig.enabled === false) {
      return false;
    }
    return true;
  };

  // Helper functions to check if specific config steps are completed
  const isConfigStepCompleted = (configStepNumber: number): boolean => {
    if (!currentUser) return false;
    
    switch (configStepNumber) {
      case 1: // Identity
        return !!(currentUser.firstName || currentUser.fname) && 
               !!(currentUser.lastName || currentUser.lname) && 
               currentUser.sex && 
               (currentUser.birthDate || currentUser.birth_date);
      
      case 2: // Address
        return !!(currentUser.address && currentUser.postalCode && currentUser.city);
      
      case 3: // Profile
        return !!(currentUser.primaryProfession || currentUser.primary_profession) && 
               !!(currentUser.employerName || currentUser.employer_name) && 
               currentUser.annualNetIncome && 
               currentUser.totalLiquidities;
      
      case 4: // Preferences
        return Array.isArray(currentUser.preferences) && currentUser.preferences.length > 0;
      
      case 5: // Objectives
        return !!(currentUser.tradingObjective || currentUser.trading_objective) && 
               !!(currentUser.plannedInvestment12m || currentUser.planned_investment_12m);
      
      case 6: // Compliance
        return Array.isArray(currentUser.complianceFamilyFlags) && currentUser.complianceFamilyFlags.length > 0;
      
      case 7: // Funds Sources
        return Array.isArray(currentUser.fundsSources) && currentUser.fundsSources.length > 0;
      
      case 8: // KYC
        return currentUser.kycStatus === 'approved' || currentUser.kycStatus === 'submitted';
      
      default:
        return false;
    }
  };

  // Check completion status for each step
  const isStep1Completed = (() => {
    if (!currentUser) return false;
    // Step 1 requires Config Step 1 (Identity) - always required
    const hasIdentity = isConfigStepCompleted(1);
    // Only check address if Config Step 2 (Address) is enabled
    if (isConfigStepEnabled(2)) {
      const hasAddress = isConfigStepCompleted(2);
      return hasIdentity && hasAddress;
    }
    // If Config Step 2 (Address) is disabled, Step 1 is complete with just identity
    return hasIdentity;
  })();

  const isStep2Completed = (() => {
    if (!currentUser) return false;
    // UI Step 2 consists of Config Steps 3-7
    // Check each enabled config step - Step 2 is complete if ALL enabled steps are completed
    const configSteps = [3, 4, 5, 6, 7];
    const enabledSteps = configSteps.filter(step => isConfigStepEnabled(step));
    
    // If no steps are enabled, consider Step 2 as complete (nothing to fill)
    if (enabledSteps.length === 0) return true;
    
    // Check if all enabled steps are completed
    return enabledSteps.every(step => isConfigStepCompleted(step));
  })();

  const isStep3Completed = (() => {
    if (!currentUser) return false;
    // Step 3 in the UI corresponds to Config Step 8 (KYC) in the config
    // Only check completion if Config Step 8 is enabled
    if (!isConfigStepEnabled(8)) return false;
    return isConfigStepCompleted(8);
  })();

  // Helper function to check if a UI step is enabled
  const isStepEnabled = (stepNumber: number): boolean => {
    // Special handling for UI Step 2: check if ANY of config steps 3-7 are enabled
    if (stepNumber === 2) {
      const hasAnyEnabled = [3, 4, 5, 6, 7].some(step => isConfigStepEnabled(step));
      return hasAnyEnabled;
    }
    
    // For other steps, map UI step number to config step number
    const configStepNumber = getConfigStepNumber(stepNumber);
    const stepKey = `step_${configStepNumber}`;
    // Si la config existe pour cette étape, vérifier la valeur enabled
    if (verificationConfig && verificationConfig[stepKey] !== undefined) {
      const stepConfig = verificationConfig[stepKey];
      // Si enabled est explicitement false, l'étape est désactivée
      if (stepConfig && typeof stepConfig === 'object' && stepConfig.enabled === false) {
        console.log(`[Dashboard] UI Step ${stepNumber} (Config Step ${configStepNumber}) is DISABLED in config:`, stepConfig);
        console.log(`[Dashboard] Full verificationConfig:`, verificationConfig);
        return false;
      }
      // Si enabled est true ou non défini dans l'objet step, l'étape est activée
      console.log(`[Dashboard] UI Step ${stepNumber} (Config Step ${configStepNumber}) is ENABLED in config:`, stepConfig);
      return true;
    }
    // Si la config n'existe pas du tout pour cette étape, par défaut l'étape est activée (pour rétrocompatibilité)
    console.log(`[Dashboard] UI Step ${stepNumber} (Config Step ${configStepNumber}) config not found, defaulting to ENABLED`);
    console.log(`[Dashboard] Full verificationConfig:`, verificationConfig);
    return true;
  };
  
  // Check if account is verified (server-side flag computed from all required onboarding fields)
  // Also check if all enabled steps are completed
  // Only consider enabled steps for verification status
  const isVerified = Boolean(currentUser?.accountVerified || currentUser?.account_verified) && 
                     (!isStepEnabled(1) || isStep1Completed) &&
                     (!isStepEnabled(2) || isStep2Completed) &&
                     (!isStepEnabled(3) || isStep3Completed);
  
  // Check if any enabled step is incomplete
  const hasIncompleteEnabledSteps = (isStepEnabled(1) && !isStep1Completed) || 
                                     (isStepEnabled(2) && !isStep2Completed) || 
                                     (isStepEnabled(3) && !isStep3Completed);
  const showVerificationBlock = !verificationConfigLoading && hasIncompleteEnabledSteps;
  
  const verificationStepperSteps = [
    { id: 1 as const, label: 'Inscription', enabled: isStepEnabled(1), completed: isStep1Completed },
    { id: 2 as const, label: 'Verification', enabled: isStepEnabled(2), completed: isStep2Completed },
    { id: 3 as const, label: 'Investir', enabled: isStepEnabled(3), completed: isStep3Completed },
  ]
    .filter((s) => s.enabled)
    .map((s, index) => ({
      ...s,
      displayNumber: index + 1,
    }));

  const currentVerificationStepId =
    verificationStepperSteps.find((s) => !s.completed)?.id ?? null;

  /** No overflow:hidden on the whole card — it clipped CTAs; clip images in their own wrappers. */
  const roundedCardStyle: React.CSSProperties = { borderRadius: '10px' };

  const MarketMoverRow = ({ asset, direction }: { asset: any; direction: 'up' | 'down' }) => {
    const changePercent = parseFinancialValue(asset?.priceChangePercent);
    const logoUrl = getAssetLogoUrl(asset);
    const subtitle = getAssetSubtitle(asset);
    const currencyLabel = formatAssetCurrency(asset?.currency);
    const price = parseFinancialValue(asset?.lastPrice);

    const pctText = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
    const priceText = `${price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyLabel}`;
    const ariaLabel = `Ouvrir ${String(asset?.name || 'actif')}, ${pctText}`;

    return (
      <button
        type="button"
        className="platform-moversRow"
        onClick={() => navigate(`/platform/product/${asset.id}`)}
        aria-label={ariaLabel}
      >
        <div className="platform-moversLeft">
          {logoUrl ? (
            <img
              className="platform-moversLogo"
              src={logoUrl}
              alt={asset?.name ? `Logo ${asset.name}` : 'Logo'}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div className="platform-moversText">
            <div className="platform-moversName">{asset?.name}</div>
            {subtitle ? <div className="platform-moversSub">{subtitle}</div> : null}
          </div>
        </div>

        <div className="platform-moversRight">
          <div className="platform-moversPrice">{priceText}</div>
          <div className={`platform-moversPct ${direction === 'up' ? 'platform-moversPct--up' : 'platform-moversPct--down'}`}>
            {pctText}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div style={{ padding: isPhone ? 0 : isMobile ? '16px' : '20px 20px' }}>
      <h1 className="platform-portfolioPageTitle">Tableau de bord</h1>

      {dashboardLoadError && !isPageLoading ? (
        <div
          role="alert"
          style={{
            marginBottom: isPhone ? 16 : 20,
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid #fecaca',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'space-between',
          }}
        >
          <span style={{ flex: '1 1 220px', lineHeight: 1.5 }}>{dashboardLoadError}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRetryTick((t) => t + 1)}
            style={{ borderRadius: 10 }}
          >
            Réessayer
          </Button>
        </div>
      ) : null}

      {isPageLoading ? (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: isPhone ? 16 : 24 }}
          aria-busy="true"
          aria-live="polite"
          aria-label="Chargement du tableau de bord, cela peut prendre quelques secondes"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              justifyContent: 'center',
              padding: isPhone ? '8px 0 4px' : '4px 0 8px',
              color: '#4b5563',
            }}
          >
            <Loader2 className="h-6 w-6 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 600 }}>
              Chargement du tableau de bord — cela peut prendre quelques secondes.
            </span>
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 16 : 24, flexDirection: isMobile ? 'column' : 'row' }}>
            <Card style={{ flex: 1, borderRadius: 16 }}>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-32 mb-2" />
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
            <Card style={{ flex: 1, borderRadius: 16 }}>
              <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-28 mb-2" />
                <Skeleton className="h-6 w-20" />
              </CardContent>
            </Card>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 24 }}>
            <Card><CardHeader><Skeleton className="h-5 w-24" /></CardHeader><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
          </div>
        </div>
      ) : (
        <>
          {/* Photo banner above verification block (from app settings) */}
          {settings?.platform_banner_image_url && (
            <div
              style={{
                marginTop: 0,
                marginBottom: isPhone ? '24px' : isMobile ? '20px' : '24px',
                borderRadius: 12,
                overflow: 'hidden',
                width: '100%',
              }}
            >
              <img
                src={settings.platform_banner_image_url}
                alt=""
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: 320,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          )}
          {/* Verification block + Valeur du portefeuille: side by side on desktop, stacked on mobile */}
          <div
            style={{
              display: showVerificationBlock ? 'flex' : 'block',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isPhone ? '12px' : isMobile ? '20px' : '24px',
              marginBottom: isPhone ? '16px' : isMobile ? '20px' : '30px',
              alignItems: 'stretch',
            }}
          >
          {showVerificationBlock && (
            <Card
              style={{
                flex: isMobile ? undefined : 1,
                minWidth: isMobile ? undefined : 0,
                borderRadius: 16,
                border: '1px solid rgba(229, 231, 235, 1)',
                backgroundColor: '#ffffff',
                boxShadow: '0 10px 30px rgba(2, 6, 23, 0.06)',
              }}
            >
              <CardContent style={{ padding: isPhone ? '14px' : isMobile ? '18px' : '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 20 }}>
                  {/* Step timeline - above heading */}
                  {verificationStepperSteps.length > 1 && (
                    <div
                      style={{ flexShrink: 0, width: '100%' }}
                      aria-label="Progression de vérification du compte"
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          overflowX: 'auto',
                          paddingBottom: 4,
                        }}
                      >
                        {verificationStepperSteps.map((s, idx) => {
                          const isCurrent = currentVerificationStepId === s.id;
                          const state: 'complete' | 'current' | 'upcoming' = s.completed
                            ? 'complete'
                            : isCurrent
                              ? 'current'
                              : 'upcoming';

                          const circleBg = state === 'complete' ? '#10b981' : '#ffffff';
                          const circleBorder =
                            state === 'complete'
                              ? 'none'
                              : state === 'current'
                                ? '2px solid #10b981'
                                : '2px solid #d1d5db';
                          const circleColor =
                            state === 'complete'
                              ? '#ffffff'
                              : state === 'current'
                                ? '#10b981'
                                : '#6b7280';

                          return (
                            <React.Fragment key={s.id}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                <div
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 9999,
                                    backgroundColor: circleBg,
                                    border: circleBorder,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: circleColor,
                                    fontWeight: 800,
                                    boxShadow:
                                      state === 'current'
                                        ? '0 8px 18px rgba(16, 185, 129, 0.20)'
                                        : 'none',
                                  }}
                                  aria-label={`${s.label} (${s.completed ? 'complété' : isCurrent ? 'en cours' : 'à faire'})`}
                                >
                                  {s.completed ? <Check className="h-4 w-4" /> : <span style={{ fontSize: 14 }}>{s.displayNumber}</span>}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: state === 'upcoming' ? '#9ca3af' : '#374151',
                                    fontWeight: state === 'current' ? 700 : 600,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {s.label}
                                </div>
                              </div>

                              {idx < verificationStepperSteps.length - 1 && (
                                <div
                                  aria-hidden="true"
                                  style={{
                                    height: 2,
                                    width: 44,
                                    backgroundColor: s.completed ? '#10b981' : '#d1d5db',
                                    borderRadius: 9999,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <h2
                      style={{
                        fontSize: isMobile ? '18px' : '20px',
                        fontWeight: 800,
                        marginBottom: 8,
                        color: '#111827',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      Vous êtes bientôt prêt
                    </h2>

                    <p
                      style={{
                        fontSize: 14,
                        color: '#4b5563',
                        marginBottom: 0,
                        lineHeight: '1.55',
                      }}
                    >
                      Justifions votre identité en quelques clics, vos documents sont immédiatement chiffrés et protégés.
                    </p>

                    <div style={{ flex: 1, minHeight: 24 }} />
                    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        onClick={() => {
                          navigate('/platform/verification');
                        }}
                        variant="platform"
                        style={{
                          borderRadius: 12,
                          ['--platform-button-bg' as any]: '#10b981',
                        }}
                      >
                        Vérifier votre compte
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

            {/* Valeur du Portefeuille */}
            <Card style={{ ...roundedCardStyle, flex: isMobile ? undefined : 1, minWidth: isMobile ? undefined : 0 }}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <CardTitle style={{ fontSize: isMobile ? '18px' : '20px', minWidth: 0 }}>
                    Valeur du Portefeuille
                  </CardTitle>
                  <PieChart className={isMobile ? "h-3 w-3 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
                </div>
              </CardHeader>
              <CardContent style={{ minWidth: 0 }}>
                {portfolioLoading ? (
                  <div style={{ fontSize: isMobile ? 14 : 15, color: '#6b7280' }}>
                    Chargement des données portefeuille...
                  </div>
                ) : (
                  <>
                    <div
                      className="text-2xl font-bold"
                      style={{
                        fontSize: isMobile ? '22px' : '28px',
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      {formatAmount(portfolioValue, accountCurrency)}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: isMobile ? '16px' : '18px',
                        fontWeight: 600,
                        color: isPortfolioDisplayProfit ? '#10b981' : '#ef4444',
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
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
                            height: isMobile ? 10 : 12,
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
                            fontSize: isMobile ? 11 : 12,
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
                  </>
                )}
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="platform"
                    onClick={() => navigate('/platform/portfolio')}
                    style={{ borderRadius: 12 }}
                  >
                    Voir mon portefeuille
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Produits et actifs du moment - cartes style Découvrir */}
          {!assetsLoading && !productsLoading && featuredItems.length > 0 && (
            <div style={{ marginBottom: isPhone ? '16px' : isMobile ? '20px' : '30px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'flex-start' : 'center',
                flexWrap: isMobile ? 'wrap' : 'nowrap',
                gap: isMobile ? '12px' : '0',
                marginBottom: isMobile ? '14px' : '18px',
              }}>
                <div>
                  <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Recommandés pour vous
                  </h2>
                  <h3 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', margin: 0 }}>
                    Produits et actifs du moment
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => scrollFeaturedSlider('left')}
                    disabled={featuredItems.length === 0}
                    style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      border: '1px solid #e5e7eb', backgroundColor: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: featuredItems.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: featuredItems.length === 0 ? 0.5 : 1,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (featuredItems.length === 0) return;
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollFeaturedSlider('right')}
                    disabled={featuredItems.length === 0}
                    style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      border: '1px solid #e5e7eb', backgroundColor: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: featuredItems.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: featuredItems.length === 0 ? 0.5 : 1,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (featuredItems.length === 0) return;
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div
                ref={featuredSliderRef}
                className="hide-scrollbar"
                style={{
                  display: 'flex',
                  gap: isMobile ? '14px' : '20px',
                  overflowX: 'auto',
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: '6px',
                }}
              >
                {featuredItems.map((item) => {
                  if (item.kind === 'asset') {
                    const asset = item.data;
                    const inPortfolio = isAssetInPortfolio(asset.id);
                    return (
                      <Card
                        key={item.key}
                        onClick={() => navigate(`/platform/product/${asset.id}`)}
                        style={{
                          minWidth: isMobile ? '260px' : '300px',
                          maxWidth: isMobile ? '260px' : '300px',
                          flexShrink: 0,
                          position: 'relative',
                          overflow: 'hidden',
                          background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                          border: 'none',
                          borderRadius: '16px',
                          cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          minHeight: '200px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                          {inPortfolio && (
                            <div style={{
                              position: 'absolute', top: '16px', right: '16px',
                              padding: '4px 10px', borderRadius: '12px',
                              backgroundColor: 'rgba(255, 255, 255, 0.9)', color: '#065f46',
                              fontSize: '11px', fontWeight: '600', zIndex: 2,
                            }}>
                              Dans le portefeuille
                            </div>
                          )}
                          <div style={{
                            marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '64px', height: '64px', borderRadius: '16px',
                            backgroundColor: asset.logoUrl ? 'rgba(255, 255, 255, 0.8)' : 'transparent',
                            overflow: 'hidden',
                          }}>
                            {asset.logoUrl ? (
                              <img src={asset.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" referrerPolicy="no-referrer" />
                            ) : null}
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                              {asset.name || 'Aucun'}
                            </div>
                            {asset.reference && (
                              <div style={{ fontSize: '14px', color: '#6b7280' }}>{asset.reference}</div>
                            )}
                          </div>
                          {(asset.category || asset.subcategory) && (
                            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {asset.category && <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>{asset.category}</div>}
                              {asset.subcategory && (
                                <>
                                  {asset.category && <span style={{ fontSize: '14px', color: '#9ca3af' }}>•</span>}
                                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>{formatSubcategoryForDisplay(asset.subcategory)}</div>
                                </>
                              )}
                            </div>
                          )}
                          {((asset.lastPrice != null) || (asset.price != null)) && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
                                {(() => {
                                  const p = asset.lastPrice ?? asset.price;
                                  const num = typeof p === 'number' ? p : parseFloat(p);
                                  return Number.isFinite(num) ? num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p;
                                })()}
                                {asset.currency && ` ${asset.currency}`}
                              </div>
                              {(asset.priceChangePercent != null || asset.priceChange != null || asset.changePercent != null) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <div style={{
                                    fontSize: '14px', fontWeight: '600',
                                    color: parseFinancialValue(asset.priceChangePercent ?? asset.changePercent) >= 0 ? '#10b981' : '#ef4444',
                                  }}>
                                    ({parseFinancialValue(asset.priceChangePercent ?? asset.changePercent) >= 0 ? '+' : ''}
                                    {parseFinancialValue(asset.priceChangePercent ?? asset.changePercent).toFixed(2)}%)
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <div style={{
                            marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(229, 231, 235, 0.8)',
                            fontSize: '13px', color: '#6b7280',
                          }}>
                            {formatAvailabilityLabel(item.availabilityStart, item.availabilityEnd)}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }

                  const product = item.data;
                  const profitabilityInfo = getProfitabilityDisplay(product);
                  const isPositive = profitabilityInfo.isPositive;
                  const hasImage = Boolean(product.imageUrl);

                  if (!hasImage) {
                    return (
                      <Card
                        key={item.key}
                        onClick={() => navigate(`/platform/product/${product.id}`)}
                        style={{
                          minWidth: isMobile ? '260px' : '300px',
                          maxWidth: isMobile ? '260px' : '300px',
                          flexShrink: 0,
                          position: 'relative', overflow: 'hidden',
                          background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                          border: 'none', borderRadius: '16px', cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s', minHeight: '200px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <CardContent style={{ padding: '24px', position: 'relative', zIndex: 1 }}>
                          <div style={{ marginBottom: '20px', width: '64px', height: '64px' }} />
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                              {product.name || 'Aucun'}
                            </div>
                            {product.reference && (
                              <div style={{ fontSize: '14px', color: '#6b7280' }}>{product.reference}</div>
                            )}
                          </div>
                          {(product.categoryName || product.subcategory) && (
                            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {product.categoryName && <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>{product.categoryName}</div>}
                              {product.subcategory && (
                                <>
                                  {product.categoryName && <span style={{ fontSize: '14px', color: '#9ca3af' }}>•</span>}
                                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>{formatSubcategoryForDisplay(product.subcategory)}</div>
                                </>
                              )}
                            </div>
                          )}
                          {profitabilityInfo.text && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--secondary, #10b981)' }}>
                                {isPositive ? '+' : ''}{profitabilityInfo.text}
                              </div>
                            </div>
                          )}
                          <div style={{
                            marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(229, 231, 235, 0.8)',
                            fontSize: '13px', color: '#6b7280',
                          }}>
                            {formatAvailabilityLabel(item.availabilityStart, item.availabilityEnd)}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }

                  return (
                    <Card
                      key={item.key}
                      onClick={() => navigate(`/platform/product/${product.id}`)}
                      style={{
                        minWidth: isMobile ? '260px' : '300px',
                        maxWidth: isMobile ? '260px' : '300px',
                        flexShrink: 0,
                        position: 'relative', overflow: 'hidden', border: '1px solid #e5e7eb',
                        borderRadius: '12px', cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s', backgroundColor: 'white',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{
                        position: 'relative', height: '180px', backgroundColor: '#ffffff',
                        overflow: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '12px',
                      }}>
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.name || 'Product'}
                            style={{
                              position: 'absolute', inset: 0, width: '100%', height: '100%',
                              objectFit: 'cover', objectPosition: 'center',
                              transform: 'scale(1.22)', transformOrigin: 'center', zIndex: 0,
                            }}
                          />
                        )}
                      </div>
                      <CardContent style={{ padding: isMobile ? '16px' : '20px' }}>
                        <h4 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', marginBottom: '8px', color: '#111827' }}>
                          {product.name || 'Aucun'}
                        </h4>
                        {(product.categoryName || product.subcategory) && (
                          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {product.categoryName && <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>{product.categoryName}</div>}
                            {product.subcategory && (
                              <>
                                {product.categoryName && <span style={{ fontSize: '14px', color: '#9ca3af' }}>•</span>}
                                <div style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>{formatSubcategoryForDisplay(product.subcategory)}</div>
                              </>
                            )}
                          </div>
                        )}
                        {profitabilityInfo.text && (
                          <div style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '700', color: 'var(--secondary, #10b981)' }}>
                            {isPositive ? '+' : ''}{profitabilityInfo.text}
                          </div>
                        )}
                        <div style={{
                          marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(229, 231, 235, 0.8)',
                          fontSize: '13px', color: '#6b7280',
                        }}>
                          {formatAvailabilityLabel(item.availabilityStart, item.availabilityEnd)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actualités | [Mes documents above Plus fortes hausses] on desktop; on phone: Actualités last */}
          <div
            style={{
              display: isMobile ? 'flex' : 'grid',
              flexDirection: isMobile ? 'column' : undefined,
              gridTemplateColumns: isMobile ? undefined : 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: isPhone ? '16px' : isMobile ? '20px' : '30px',
              marginBottom: isPhone ? '16px' : isMobile ? '20px' : '30px',
            }}
          >
          {/* Actualités - left on desktop, last on phone */}
            <Card style={{ ...roundedCardStyle, order: isMobile ? 1 : 0 }}>
              <CardHeader>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <CardTitle
                      style={{
                        fontSize: isMobile ? '18px' : '20px',
                        fontWeight: 800,
                        color: '#111827',
                        letterSpacing: '-0.01em',
                        margin: 0,
                      }}
                    >
                      Actualités
                    </CardTitle>
                    <CardDescription style={{ fontSize: isMobile ? '12px' : '13px', marginTop: 2 }}>
                      Dernières nouvelles et mises à jour du marché
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {newsLoading ? (
                  <div style={{ fontSize: isMobile ? '14px' : '16px' }}>Chargement des actualités...</div>
                ) : newsPosts.length === 0 ? (
                  <p style={{ fontSize: isMobile ? '14px' : '16px' }}>Aucune actualité disponible</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isPhone ? '12px' : isMobile ? '16px' : '20px' }}>
                    {newsPosts.map((post: any) => (
                      <div
                        key={post.id}
                        role={post.articleUrl ? 'button' : undefined}
                        tabIndex={post.articleUrl ? 0 : undefined}
                        onClick={post.articleUrl ? () => window.open(post.articleUrl, '_blank', 'noopener,noreferrer') : undefined}
                        onKeyDown={post.articleUrl ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open(post.articleUrl, '_blank', 'noopener,noreferrer'); } } : undefined}
                        style={{
                          padding: isPhone ? '10px' : isMobile ? '12px' : '14px',
                          border: '1px solid rgba(229, 231, 235, 1)',
                          borderRadius: 16,
                          backgroundColor: 'white',
                          display: 'flex',
                          flexDirection: isNarrowForCards ? 'column' : 'row',
                          alignItems: 'stretch',
                          gap: isNarrowForCards ? 10 : 12,
                          boxShadow: '0 10px 26px rgba(2, 6, 23, 0.04)',
                          transition: 'transform 160ms ease, box-shadow 160ms ease',
                          cursor: post.articleUrl ? 'pointer' : 'default',
                        }}
                        onMouseEnter={(e) => {
                          if (isMobile) return;
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 16px 40px rgba(2, 6, 23, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                          if (isMobile) return;
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 10px 26px rgba(2, 6, 23, 0.04)';
                        }}
                      >
                        {post.imageUrl ? (
                          <div
                            style={{
                              width: isNarrowForCards ? '100%' : 200,
                              height: isNarrowForCards ? 180 : '100%',
                              minHeight: isNarrowForCards ? 180 : 140,
                              borderRadius: 14,
                              overflow: 'hidden',
                              background: 'rgba(2, 6, 23, 0.06)',
                              flexShrink: 0,
                              position: 'relative',
                              alignSelf: isNarrowForCards ? undefined : 'stretch',
                            }}
                          >
                            <img
                              src={post.imageUrl}
                              alt={post.title}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center',
                                display: 'block',
                              }}
                              loading="lazy"
                            />
                          </div>
                        ) : null}

                        <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
                          <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                            {new Date(post.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>

                          <h3
                            style={{
                              fontSize: isNarrowForCards ? '14px' : '15px',
                              fontWeight: 600,
                              margin: 0,
                              color: '#111827',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {post.title}
                          </h3>

                          <div
                            style={
                              {
                                fontSize: 13,
                                color: '#6b7280',
                                lineHeight: 1.45,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word',
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: isNarrowForCards ? 3 : 2,
                                overflow: 'hidden',
                              } as any
                            }
                          >
                            {post.content}
                          </div>

                          <div style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Par {post.sourceName || getWebsiteNameFromUrl(post.articleUrl) || 'Admin'}
                          </div>
                        </div>
                      </div>
                    ))}

                    {newsHasMore && (
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="platform-hoverable"
                          onClick={loadMoreNewsPosts}
                          disabled={newsLoadingMore}
                          aria-label="Voir plus d'actualités"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            padding: isMobile ? '8px 10px' : '10px 12px',
                            borderRadius: 12,
                            cursor: 'pointer',
                            // Same style as "Tout voir" (secondary color).
                            color: 'var(--platform-button-bg, var(--accent, var(--primary, #030213)))',
                            fontSize: isMobile ? 13 : 14,
                            fontWeight: 700,
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                            opacity: newsLoadingMore ? 0.7 : 1,
                            cursor: newsLoadingMore ? 'wait' : 'pointer',
                          }}
                        >
                          {newsLoadingMore ? 'Chargement...' : 'Voir plus'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right column: Mes documents above Plus fortes hausses - first on phone */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: isPhone ? '12px' : isMobile ? '16px' : '20px',
              }}
            >
              {/* Mes documents - first */}
              <Card style={roundedCardStyle}>
              <CardHeader>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <CardTitle
                      style={{
                        fontSize: isMobile ? '18px' : '20px',
                        fontWeight: 800,
                        color: '#111827',
                        letterSpacing: '-0.01em',
                        margin: 0,
                      }}
                    >
                      Mes documents
                    </CardTitle>
                    <CardDescription style={{ fontSize: isMobile ? '12px' : '13px', marginTop: 2 }}>
                      Vos documents personnels et contrats
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {documentsLoading ? (
                  <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#6b7280' }}>Chargement des documents...</p>
                ) : documents.length === 0 ? (
                  <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#6b7280' }}>Aucun document</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isPhone ? '8px' : '10px' }}>
                    {documents.slice(0, 10).map((doc: any) => {
                      const typeLabels: Record<string, string> = {
                        contract: 'Contrat',
                        kyc: 'Document KYC',
                        identity: "Pièce d'identité",
                        address: 'Justificatif de domicile',
                        financial: 'Document financier',
                        other: 'Autre',
                      };
                      const typeLabel = typeLabels[doc.documentType] || doc.documentType || 'Document';
                      const creationLabel = formatDocumentCreatedOnForDisplay(doc);
                      return (
                        <div
                          key={doc.id}
                          style={{
                            display: 'flex',
                            alignItems: isNarrowForCards ? 'flex-start' : 'center',
                            flexDirection: isNarrowForCards ? 'column' : 'row',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: isPhone ? '10px 12px' : '12px 14px',
                            backgroundColor: '#f9fafb',
                            borderRadius: 10,
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0, width: isNarrowForCards ? '100%' : undefined }}>
                            <div style={{ fontWeight: 600, fontSize: isMobile ? 14 : 15, color: '#111827', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                              {doc.name}
                            </div>
                            <div style={{ fontSize: isMobile ? 12 : 13, color: '#6b7280', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                              <span>{typeLabel}</span>
                              {creationLabel && (
                                <span>
                                  • {creationLabel}
                                </span>
                              )}
                            </div>
                          </div>
                          {doc.fileUrl && (
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Voir le document"
                              style={{
                                flexShrink: 0,
                                alignSelf: isNarrowForCards ? 'flex-start' : undefined,
                                fontSize: isMobile ? 13 : 14,
                                fontWeight: 600,
                                color: 'var(--platform-button-bg, #030213)',
                                textDecoration: 'underline',
                                textUnderlineOffset: 3,
                              }}
                            >
                              Voir le document
                            </a>
                          )}
                        </div>
                      );
                    })}
                    {documents.length > 10 && (
                      <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 4 }}>
                        + {documents.length - 10} autre{documents.length - 10 > 1 ? 's' : ''} document{documents.length - 10 > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

              {/* Plus fortes hausses / baisses - below Mes documents */}
              {!assetsLoading && assets.length > 0 && (gainers.length > 0 || losers.length > 0) && (
                  <>
                    {gainers.length > 0 && (
                      <Card className="platform-moversCard">
                        <div className="platform-moversHeader">
                          <TrendingUp className={`platform-moversIcon platform-moversIcon--up ${isMobile ? 'h-4 w-4' : 'h-4 w-4'}`} />
                          <div className="platform-moversTitle">PLUS FORTES HAUSSES</div>
                        </div>
                        <CardContent className="platform-moversContent">
                          <div className="platform-moversList">
                            {gainers.map((asset: any) => (
                              <React.Fragment key={asset.id}>
                                <MarketMoverRow asset={asset} direction="up" />
                              </React.Fragment>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Plus fortes baisses - only show when there are losers */}
                    {losers.length > 0 && (
                      <Card className="platform-moversCard">
                        <div className="platform-moversHeader">
                          <TrendingDown className={`platform-moversIcon platform-moversIcon--down ${isMobile ? 'h-4 w-4' : 'h-4 w-4'}`} />
                          <div className="platform-moversTitle">PLUS FORTES BAISSES</div>
                        </div>
                        <CardContent className="platform-moversContent">
                          <div className="platform-moversList">
                            {losers.map((asset: any) => (
                              <React.Fragment key={asset.id}>
                                <MarketMoverRow asset={asset} direction="down" />
                              </React.Fragment>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
