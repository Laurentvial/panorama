import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ChevronLeft, TrendingUp, TrendingDown, BarChart3, FileText, Newspaper, DollarSign, Check, ExternalLink, X } from 'lucide-react';
import '../styles/Modal.css';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';
import { useIsMobile } from './ui/use-mobile';
import { StockChart } from './StockChart';
import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN } from '../utils/constants';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [data, setData] = useState<any>(null);
  const [dataType, setDataType] = useState<'asset' | 'product' | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'news'>('overview');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1D' | '1W' | '1M' | '6M' | '1Y' | '3Y' | 'MAX'>('1W');
  const [timeframePerformance, setTimeframePerformance] = useState<{ percent: number; absolute: number; start: number; end: number } | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeAmountEur, setTradeAmountEur] = useState<string>('');
  const [tradeOrderError, setTradeOrderError] = useState<string | null>(null);
  const [isPlacingTradeOrder, setIsPlacingTradeOrder] = useState(false);
  const [tradeOrderSuccess, setTradeOrderSuccess] = useState<{
    amountEur: number;
    assetCurrency: string;
    estimatedShares: number;
    fxRateEurToAsset: number;
    transaction: any | null;
  } | null>(null);
  const [fxRateEurToAsset, setFxRateEurToAsset] = useState<number>(1);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [showCGVModal, setShowCGVModal] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  // Profitability simulator state
  const [simulatorAmount, setSimulatorAmount] = useState<number>(10000);
  const [simulatorBasePrice, setSimulatorBasePrice] = useState<string>('10000');
  const [simulatorRateMode, setSimulatorRateMode] = useState<'min' | 'avg' | 'max' | 'custom'>('avg');
  const [simulatorCustomRate, setSimulatorCustomRate] = useState<string>('');
  
  // Helper function to format date to French format (jj/mm/aaaa) - declared before use
  const formatDateToFrench = (dateString: string): string => {
    if (!dateString) return '';
    // If it's already in French format (contains /), return as-is
    if (dateString.includes('/')) {
      return dateString;
    }
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  };
  
  // Subscription form state
  const [showSubscriptionForm, setShowSubscriptionForm] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState({
    firstName: currentUser?.fname || currentUser?.firstName || '',
    lastName: currentUser?.lname || currentUser?.lastName || '',
    birthDate: currentUser?.birthDate ? formatDateToFrench(currentUser.birthDate) : '',
    city: currentUser?.city || '',
    amount: '',
    interestPeriod: '',
    contractEnd: '',
    acceptTerms: false,
    acceptConditions: false,
  });
  const [clientIP, setClientIP] = useState('');
  const isMobile = useIsMobile();
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const getTruncatedText = (text: string, limit: number) => {
    const normalized = (text || '').toString();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, limit).trimEnd()}…`;
  };

  useEffect(() => {
    // Reset "Lire plus" when navigating to another item
    setIsDescriptionExpanded(false);
  }, [id, dataType]);

  // Keep a stable currency value for hooks (never behind conditional returns)
  const tradeAssetCurrency =
    dataType === 'asset' ? (String(data?.currency || 'USD').trim().toUpperCase() || 'USD') : 'EUR';

  // Helper function to convert date string to Date object
  const parseDateString = (dateString: string): Date | undefined => {
    if (!dateString) return undefined;
    try {
      // Handle ISO format (YYYY-MM-DD)
      if (dateString.includes('-')) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) return date;
      }
      // Handle French format (DD/MM/YYYY)
      if (dateString.includes('/')) {
        const [day, month, year] = dateString.split('/');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(date.getTime())) return date;
      }
      return undefined;
    } catch {
      return undefined;
    }
  };

  // Helper function to convert Date to ISO string (YYYY-MM-DD)
  const dateToISOString = (date: Date | undefined): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    // Get client IP
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIP(data.ip))
      .catch(() => setClientIP('N/A'));
    
    // Set current date in French format for initial display
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    setSubscriptionData(prev => ({ ...prev, contractEnd: `${day}/${month}/${year}` }));
  }, []);

  // Load transactions to calculate available balance
  useEffect(() => {
    if (currentUser && currentUser.id) {
      const loadTransactions = async () => {
        try {
          const transactionsResponse = await apiCall(`/api/clients/${currentUser.id}/transactions/`);
          setTransactions(transactionsResponse.transactions || []);
        } catch (error) {
          console.error('Error loading transactions:', error);
        }
      };
      loadTransactions();
    }
  }, [currentUser]);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  useEffect(() => {
    // Load categories for enriching product data
    loadCategories();
  }, []);

  useEffect(() => {
    // Re-enrich product data when categories are loaded
    if (dataType === 'product' && data && categories.length > 0 && data.categoryId) {
      const category = categories.find((c: any) => c.id === data.categoryId);
      if (category && !data.categoryName) {
        setData({ ...data, categoryName: category.title });
      }
    }
  }, [categories, dataType, data]);

  // FX rate fetch for the Trade modal (must be a top-level hook).
  useEffect(() => {
    if (!showTradeModal) return;
    if (dataType !== 'asset') return;

    setFxError(null);

    if (!tradeAssetCurrency || tradeAssetCurrency === 'EUR') {
      setFxRateEurToAsset(1);
      return;
    }

    let cancelled = false;
    setFxLoading(true);

    apiCall(`/api/forex/quote/?from=EUR&to=${encodeURIComponent(tradeAssetCurrency)}`, { method: 'GET' })
      .then((res: any) => {
        if (cancelled) return;
        const rate = Number(res?.exchange_rate);
        if (!Number.isFinite(rate) || rate <= 0) {
          setFxError('Impossible de récupérer le taux de change.');
          setFxRateEurToAsset(0);
          return;
        }
        setFxRateEurToAsset(rate);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setFxError(e?.message || 'Impossible de récupérer le taux de change.');
        setFxRateEurToAsset(0);
      })
      .finally(() => {
        if (cancelled) return;
        setFxLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showTradeModal, dataType, tradeAssetCurrency]);

  const loadCategories = async () => {
    try {
      const categoriesResponse = await apiCall('/api/categories/');
      const categoriesData = categoriesResponse?.categories || categoriesResponse || [];
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // First, check if client has access to this product/asset
      if (!currentUser?.id) {
        toast.error('Utilisateur non identifié');
        navigate('/platform');
        return;
      }
      
      const [clientProductsResponse, clientAssetsResponse] = await Promise.all([
        apiCall(`/api/clients/${currentUser.id}/products/`).catch(() => ({ products: [] })),
        apiCall(`/api/clients/${currentUser.id}/assets/`).catch(() => ({ assets: [] })),
      ]);
      
      const clientProducts = (clientProductsResponse as any)?.products || [];
      const clientAssets = (clientAssetsResponse as any)?.assets || [];
      const clientProductIds = clientProducts.map((cp: any) => {
        const product = cp.product || cp;
        return product?.id;
      }).filter(Boolean);
      const clientAssetIds = clientAssets.map((ca: any) => {
        const asset = ca.asset || ca;
        return asset?.id;
      }).filter(Boolean);
      
      // Check if the requested ID is in client's accessible products or assets
      const hasAccess = clientProductIds.includes(id) || clientAssetIds.includes(id);
      
      if (!hasAccess) {
        toast.error('Vous n\'avez pas accès à ce produit ou actif');
        navigate('/platform/discover');
        return;
      }
      
      // Try loading as product first (since smartPortfolios are products)
      // If that fails with 404, silently try as asset (this is expected behavior)
      let productLoaded = false;
      try {
        // Suppress console error for 404 on product endpoint (expected when ID is an asset)
        const productResponse = await apiCall(`/api/products/${id}/`).catch((error: any) => {
          // If 404, return null to trigger asset fallback without logging error
          if (error?.status === 404) {
            return null;
          }
          throw error;
        });
        
        if (!productResponse) {
          // 404 on product, try as asset
          throw { status: 404 };
        }
        
        const productData = productResponse.product || productResponse;
        
        // Load categories if not already loaded, then enrich product
        let categoriesData = categories;
        if (categoriesData.length === 0) {
          try {
            const categoriesResponse = await apiCall('/api/categories/');
            categoriesData = categoriesResponse?.categories || categoriesResponse || [];
            setCategories(categoriesData);
          } catch (error) {
            console.error('Error loading categories:', error);
          }
        }
        
        // Enrich product with category name (similar to PlatformDiscover)
        let enrichedProductData = productData;
        if (productData.categoryId && categoriesData.length > 0) {
          const category = categoriesData.find((c: any) => c.id === productData.categoryId);
          if (category) {
            enrichedProductData = { ...productData, categoryName: category.title };
          }
        }
        
        setData(enrichedProductData);
        setDataType('product');
        productLoaded = true;
      } catch (productError: any) {
        // If product fails (404), silently try as asset
        // Only log non-404 errors (404 is expected when ID is an asset, not a product)
        if (productError?.status && productError.status !== 404) {
          console.error('Error loading product:', productError);
        }
        // Silently continue to try loading as asset - 404 is expected here
        
        // Try loading as asset
        try {
          const assetResponse = await apiCall(`/api/assets/${id}/`);
          setData(assetResponse.asset || assetResponse);
          setDataType('asset');
          productLoaded = true;
        } catch (assetError: any) {
          // Only show error if both failed and it's not a 404
          if (assetError?.status && assetError.status !== 404) {
            console.error('Error loading asset:', assetError);
            toast.error('Erreur lors du chargement');
          } else if (productError?.status === 404 && assetError?.status === 404) {
            // Both returned 404 - item doesn't exist
            toast.error('Produit ou actif non trouvé');
          }
        }
      }
      
      // If neither product nor asset was loaded, show error
      if (!productLoaded && !data) {
        toast.error('Produit ou actif non trouvé');
      }
    } catch (error: any) {
      // Handle unexpected errors
      if (error?.status !== 404) {
        console.error('Error loading data:', error);
        toast.error('Erreur lors du chargement');
      }
    } finally {
      setLoading(false);
    }
  };

  const parseFinancialValue = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Get available interest period options from product
  const getInterestPeriodOptions = (product: any): string[] => {
    const allOptions = ['Quotidien', 'Hebdomadaire', 'Mensuel', 'Trimestriel', 'Semestriel', 'Annuel', 'Fin de contrat', 'Capitalisation des fonds'];
    
    if (!product || !product.interestPeriod) {
      return allOptions;
    }
    
    // Parse comma-separated values
    const productValues = String(product.interestPeriod).split(',').map(p => p.trim()).filter(p => p);
    
    // Filter to only include valid options
    const validOptions = productValues.filter(v => allOptions.includes(v));
    
    // If product has specific values, return only those options
    if (validOptions.length > 0) {
      return validOptions;
    }
    
    // If no valid options found, return all options (fallback)
    return allOptions;
  };

  const formatProfitability = (product: any): string => {
    if (product.isVariableProfitability === 'Oui' && product.variableProfitability) {
      const min = parseFinancialValue(product.profitability);
      const max = parseFinancialValue(product.variableProfitability);
      const period = product.profitabilityPeriod || 'Mensuel';
      return `${min.toFixed(2)} à ${max.toFixed(2)}% ${period}`;
    } else if (product.profitability !== null && product.profitability !== undefined) {
      const profit = parseFinancialValue(product.profitability);
      const period = product.profitabilityPeriod || 'Mensuel';
      return `${profit.toFixed(2)}% ${period}`;
    }
    return 'N/A';
  };

  const calculateGains = (product: any, amount: number, basePrice: number): number => {
    // Backward-compat wrapper kept for existing call sites.
    // The simulator now uses per-period profitability and optional compounding.
    const sim = simulateProfitability(product, basePrice, {
      rateMode: simulatorRateMode,
      customRatePct: simulatorCustomRate,
    });
    return sim.totalProfit;
  };

  const parseDurationMonths = (duration: any): number => {
    if (!duration) return 0;
    const m = String(duration).match(/(\d+)/);
    const v = m ? parseInt(m[1], 10) : 0;
    return Number.isFinite(v) && v > 0 ? v : 0;
  };

  const profitabilityPeriodMonths = (period: any, durationMonths: number): number => {
    const p = String(period || '').trim().toLowerCase();
    if (!p) return 1;
    if (p.includes('fin') && (p.includes('contrat') || p.includes('matur'))) {
      return Math.max(1, durationMonths || 1);
    }
    if (p.includes('mens')) return 1;
    if (p.includes('trim')) return 3;
    if (p.includes('sem')) return 6;
    if (p.includes('ann') || p === 'an' || p.includes('année') || p.includes('annee')) return 12;
    // Fallback: try parse a number of months
    const m = p.match(/(\d+)/);
    const v = m ? parseInt(m[1], 10) : 0;
    return Number.isFinite(v) && v > 0 ? v : 1;
  };

  const normalizeBool = (v: any): boolean => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.trim().toLowerCase() === 'oui' || v.trim().toLowerCase() === 'true' || v.trim() === '1';
    return Boolean(v);
  };

  const getRateBoundsPct = (product: any): { min: number; max: number; avg: number } => {
    const min = parseFinancialValue(product?.profitability);
    const maxRaw = parseFinancialValue(product?.variableProfitability);
    const isVar = product?.isVariableProfitability === 'Oui' && maxRaw > 0;
    const max = isVar ? maxRaw : min;
    const avg = isVar ? (min + max) / 2 : min;
    return { min, max, avg };
  };

  const simulateProfitability = (
    product: any,
    principal: number,
    opts: { rateMode: 'min' | 'avg' | 'max' | 'custom'; customRatePct: string }
  ): {
    durationMonths: number;
    periodMonths: number;
    compound: boolean;
    pickedRatePct: number;
    rows: Array<{
      index: number;
      months: number;
      base: number;
      ratePct: number;
      profit: number;
      end: number;
    }>;
    totalProfit: number;
    endCapital: number;
    annualizedPct: number | null;
  } => {
    const durationMonths = parseDurationMonths(product?.duration);
    const periodMonths = profitabilityPeriodMonths(product?.profitabilityPeriod, durationMonths);
    const compound = normalizeBool(product?.capitalisationFonds ?? product?.capitalisation_fonds);

    const bounds = getRateBoundsPct(product);
    let pickedRatePct = bounds.avg;
    if (opts.rateMode === 'min') pickedRatePct = bounds.min;
    if (opts.rateMode === 'max') pickedRatePct = bounds.max;
    if (opts.rateMode === 'custom') {
      const v = parseFinancialValue(opts.customRatePct);
      if (Number.isFinite(v)) pickedRatePct = v;
    }

    const rows: Array<{ index: number; months: number; base: number; ratePct: number; profit: number; end: number }> = [];
    const safePrincipal = Number.isFinite(principal) ? Math.max(0, principal) : 0;
    if (!product || safePrincipal <= 0 || durationMonths <= 0 || pickedRatePct <= 0) {
      return { durationMonths, periodMonths, compound, pickedRatePct, rows, totalProfit: 0, endCapital: safePrincipal, annualizedPct: null };
    }

    let remaining = durationMonths;
    let capital = safePrincipal;
    let totalProfit = 0;
    let idx = 1;

    while (remaining > 0) {
      const step = Math.min(periodMonths, remaining);
      const proration = periodMonths > 0 ? step / periodMonths : 1;
      const effectiveRatePct = pickedRatePct * proration;
      const base = compound ? capital : safePrincipal;
      const profit = base * (effectiveRatePct / 100);
      totalProfit += profit;
      const end = compound ? (base + profit) : (safePrincipal + totalProfit);
      rows.push({
        index: idx,
        months: step,
        base,
        ratePct: effectiveRatePct,
        profit,
        end,
      });
      capital = end;
      remaining -= step;
      idx += 1;
    }

    const endCapital = compound ? capital : safePrincipal + totalProfit;
    const annualizedPct =
      durationMonths > 0 && endCapital > 0
        ? (Math.pow(endCapital / safePrincipal, 12 / durationMonths) - 1) * 100
        : null;

    return { durationMonths, periodMonths, compound, pickedRatePct, rows, totalProfit, endCapital, annualizedPct };
  };

  // Initialize signature canvas
  useEffect(() => {
    const canvas = signatureCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }

      // Add touch event listeners manually with { passive: false } to allow preventDefault
      const handleTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        isDrawingRef.current = true;
        setIsDrawing(true);
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const touch = e.touches[0];
        ctx.beginPath();
        ctx.moveTo(
          touch.clientX - rect.left,
          touch.clientY - rect.top
        );
      };

      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        if (!isDrawingRef.current) return;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const touch = e.touches[0];
        ctx.lineTo(
          touch.clientX - rect.left,
          touch.clientY - rect.top
        );
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      };

      const handleTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        isDrawingRef.current = false;
        setIsDrawing(false);
        if (canvas) {
          setSignature(canvas.toDataURL());
        }
      };

      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

      return () => {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, []);

  // Initialize simulator when product loads
  useEffect(() => {
    if (dataType === 'product' && data) {
      const product = data;
      const minInvestment = parseFinancialValue(product.minEntryValue);
      if (minInvestment > 0 && simulatorAmount === 10000) {
        setSimulatorAmount(minInvestment);
        setSimulatorBasePrice(minInvestment.toString());
      } else if (minInvestment === 0 && simulatorAmount === 10000) {
        // If no minimum, start with a reasonable default
        setSimulatorAmount(10000);
        setSimulatorBasePrice('10000');
      }
      
      // Initialize interestPeriod from product if available
      if (product.interestPeriod) {
        const productValues = String(product.interestPeriod).split(',').map(p => p.trim()).filter(p => p);
        const allOptions = ['Mensuel', 'Trimestriel', 'Semestriel', 'Annuel', 'Fin de contrat', 'Capitalisation des fonds'];
        const validOptions = productValues.filter(v => allOptions.includes(v));
        // If only one option available, pre-select it
        if (validOptions.length === 1) {
          setSubscriptionData(prev => ({ ...prev, interestPeriod: validOptions[0] }));
        }
      }
    }
  }, [dataType, data]);

  const handleSubscribe = async () => {
    setSubscriptionError(null);

    // After a successful subscription, we intentionally block new transactions
    // until the user refreshes the page (requested UX).
    if (subscriptionSuccess) {
      toast.info('Souscription déjà effectuée.');
      return;
    }
    
    if (!subscriptionData.acceptTerms || !subscriptionData.acceptConditions) {
      setSubscriptionError('Veuillez accepter les conditions générales');
      return;
    }

    if (!currentUser?.id) {
      setSubscriptionError('Utilisateur non connecté');
      return;
    }

    if (!data || dataType !== 'product') {
      setSubscriptionError('Produit non trouvé');
      return;
    }

    const productData = data;

    const amount = parseFloat(subscriptionData.amount);
    if (!amount || amount <= 0) {
      setSubscriptionError('Veuillez saisir un montant valide');
      return;
    }

    // Validate minimum and maximum investment
    const minInvestment = parseFinancialValue(productData.minEntryValue);
    const maxInvestment = parseFinancialValue(productData.maxEntryValue);
    if (minInvestment > 0 && amount < minInvestment) {
      setSubscriptionError(`Le montant minimum est de ${minInvestment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`);
      return;
    }
    if (maxInvestment > 0 && amount > maxInvestment) {
      setSubscriptionError(`Le montant maximum est de ${maxInvestment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`);
      return;
    }

    if (!signature) {
      setSubscriptionError('Veuillez signer le contrat');
      return;
    }

    // Validate available balance before creating transaction
    const completedTransactions = transactions.filter((t: any) => t.status === 'termine');
    
    let calculatedInvestedCapital = 0;
    let calculatedTradingPortfolio = 0;
    
    completedTransactions.forEach((transaction: any) => {
      const txnAmount = parseFloat(transaction.amount) || 0;
      
      if (transaction.type === 'depot') {
        calculatedInvestedCapital += txnAmount;
      } else if (transaction.type === 'retrait') {
        calculatedInvestedCapital -= txnAmount;
      } else if (transaction.type === 'bonus') {
        calculatedInvestedCapital += txnAmount;
      } else if (transaction.type === 'interets') {
        // Interest transactions credit gains to cash balance
        calculatedInvestedCapital += txnAmount;
      } else if (transaction.type === 'achat') {
        calculatedTradingPortfolio += txnAmount;
      } else if (transaction.type === 'vente') {
        calculatedTradingPortfolio -= txnAmount;
      } else if (transaction.type === 'transfert') {
        const transferFrom = transaction.from || transaction.from_field || null;
        const transferTo = transaction.to || transaction.to_field || null;
        if (transferFrom === 'balance' && transferTo && transferTo !== 'balance') {
          calculatedTradingPortfolio += txnAmount;
        } else if (transferFrom && transferFrom !== 'balance' && transferTo === 'balance') {
          calculatedTradingPortfolio -= txnAmount;
        }
      }
    });
    
    // Use calculated values or fallback to client object values
    const investedCapital = completedTransactions.length > 0 
      ? calculatedInvestedCapital 
      : parseFinancialValue(currentUser?.investedCapital || currentUser?.invested_capital || 0);
    const tradingPortfolio = completedTransactions.length > 0 
      ? calculatedTradingPortfolio 
      : parseFinancialValue(currentUser?.tradingPortfolio || currentUser?.trading_portfolio || 0);
    
    // Available funds = investedCapital - tradingPortfolio (bonus is included in investedCapital)
    const availableFunds = investedCapital - tradingPortfolio;
    
    if (amount > availableFunds) {
      setSubscriptionError(`Fonds insuffisants. Solde disponible: ${availableFunds.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR, montant demandé: ${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`);
      return;
    }

    setIsSubscribing(true);
    try {
      // Calculate gains using the same simulator logic as the product page
      const sim = simulateProfitability(productData, amount, { rateMode: 'avg', customRatePct: '' });
      const gains = sim.totalProfit;
      const total = sim.endCapital;
      
      // Format profitability for display
      let profitabilityDisplay = 'N/A';
      if (productData.isVariableProfitability === 'Oui' && productData.variableProfitability) {
        const min = parseFinancialValue(productData.profitability);
        const max = parseFinancialValue(productData.variableProfitability);
        profitabilityDisplay = `${min.toFixed(2)} à ${max.toFixed(2)}% ${productData.profitabilityPeriod || ''}`.trim();
      } else if (productData.profitability !== null && productData.profitability !== undefined) {
        const profit = parseFinancialValue(productData.profitability);
        profitabilityDisplay = `${profit.toFixed(2)}% ${productData.profitabilityPeriod || ''}`.trim();
      }
      
      // Get category name
      const categoryName = categories.find(c => c.id === productData.categoryId)?.title || productData.categoryName || 'N/A';
      
      // Create subscription details object
      const subscriptionDetails = {
        firstName: subscriptionData.firstName,
        lastName: subscriptionData.lastName,
        birthDate: subscriptionData.birthDate,
        city: subscriptionData.city,
        ip: clientIP,
        productId: productData.id,
        productName: productData.name,
        productReference: productData.reference || null,
        category: categoryName,
        country: 'FRANCE', // Default or from product
        subscriptionDate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        duration: productData.duration || 'N/A',
        interestPeriod: subscriptionData.interestPeriod || productData.interestPeriod || 'N/A',
        profitability: profitabilityDisplay,
        investment: amount,
        profits: gains,
        total: total,
        contractEnd: subscriptionData.contractEnd ? formatDateToFrench(subscriptionData.contractEnd) : 'N/A',
        hasSignature: !!signature
      };
      
      // Create transaction of type 'transfert' - Transfer from Balance Cash to the chosen product
      // We only need to_field: product ID = investment (balance → product)
      const transactionData = {
        type: 'transfert',
        amount: amount,
        description: `Transfert de Balance Cash vers ${productData.name}${productData.reference ? ` (${productData.reference})` : ''}.`,
        status: 'en_cours',
        datetime: new Date().toISOString(),
        to_field: productData.id, // Transfer to product (investment: balance → product)
        subscription_details: {
          ...subscriptionDetails,
          signature: signature || null, // Include signature in subscription_details
        },
      };

      const response = await apiCall(`/api/clients/${currentUser.id}/transactions/create/`, {
        method: 'POST',
        body: JSON.stringify(transactionData),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response) {
        setSubscriptionSuccess('Souscription effectuée avec succès !');
        // Bring the user back to the top so the success message is immediately visible.
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Reset form
        setSubscriptionData({
          firstName: currentUser?.fname || currentUser?.firstName || '',
          lastName: currentUser?.lname || currentUser?.lastName || '',
          birthDate: currentUser?.birthDate || '',
          city: currentUser?.city || '',
          amount: '',
          interestPeriod: '',
          contractEnd: '',
          acceptTerms: false,
          acceptConditions: false,
        });
        setSignature(null);
        setSubscriptionError(null);
        const canvas = signatureCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      }
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      setSubscriptionError(error?.message || 'Erreur lors de la souscription. Veuillez réessayer.');
    } finally {
      setIsSubscribing(false);
    }
  };

  // Open contract PDF in new tab
  const openContractPDF = () => {
    if (dataType !== 'product' || !data || !currentUser) {
      toast.error('Données manquantes pour générer le contrat');
      return;
    }

    const product = data;

    // Get API base URL
    const apiUrl = import.meta.env.VITE_URL || 'http://127.0.0.1:8000';
    
    // Get authentication token (same logic as apiCall)
    const path = window.location?.pathname || '';
    const isAdminRoute = path.startsWith('/admin');
    let token: string | null = null;
    
    if (!isAdminRoute) {
      // Check sessionStorage first (for impersonated clients)
      const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
      const sessionUserType = sessionStorage.getItem('userType');
      if (sessionToken && (sessionUserType === 'client' || sessionToken.startsWith('client_'))) {
        token = sessionToken;
      } else {
        // Check localStorage for client token
        const clientToken = localStorage.getItem(CLIENT_ACCESS_TOKEN);
        if (clientToken) {
          token = clientToken;
        }
      }
    }
    
    // Fallback to admin token
    if (!token) {
      token = localStorage.getItem(ACCESS_TOKEN);
    }
    
    // Build query parameters
    const params = new URLSearchParams();
    if (token) {
      params.append('token', token);
    }
    if (subscriptionData.firstName) {
      params.append('firstName', subscriptionData.firstName);
    }
    if (subscriptionData.lastName) {
      params.append('lastName', subscriptionData.lastName);
    }
    if (subscriptionData.birthDate) {
      params.append('birthDate', subscriptionData.birthDate);
    }
    if (subscriptionData.city) {
      params.append('city', subscriptionData.city);
    }
    if (subscriptionData.amount) {
      params.append('amount', subscriptionData.amount);
    }
    if (subscriptionData.interestPeriod) {
      params.append('interestPeriod', subscriptionData.interestPeriod);
    }
    if (signature) {
      params.append('signature', signature);
    }
    
    // Build URL
    const pdfUrl = `${apiUrl}/api/products/${product.id}/contract-pdf/?${params.toString()}`;
    
    // Open in new tab
    window.open(pdfUrl, '_blank');
  };

  // Generate contract preview
  const generateContractPreview = (productData: any) => {
    if (!productData || !currentUser) return null;

    const companyName = 'CIM Banque SA';
    const companyAddress = '16 rue Merle d\'Aubigné, 1207 Genève - SUISSE';
    const companyWebsite = 'web.interface-cim.fr';
    const companyEmail = 'contact@interface-cim.fr';

    const investorName = `${subscriptionData.firstName || currentUser.fname || currentUser.firstName || ''} ${subscriptionData.lastName || currentUser.lname || currentUser.lastName || ''}`.trim();
    const investorEmail = currentUser.email || '';
    const investorPhone = currentUser.phone || currentUser.mobile || subscriptionData.city || '';
    const investorBirthDate = subscriptionData.birthDate ? formatDateToFrench(subscriptionData.birthDate) : (currentUser.birthDate ? formatDateToFrench(currentUser.birthDate) : '');
    const investorCity = subscriptionData.city || currentUser.city || '';

    const amount = parseFloat(subscriptionData.amount) || parseFinancialValue(productData.minEntryValue) || 10000;
    const duration = productData.duration || '1 mois';
    const durationMonths = parseInt(duration.match(/(\d+)/)?.[1] || '1');
    
    // Calculate profitability
    let profitabilityText = '';
    if (productData.isVariableProfitability === 'Oui' && productData.variableProfitability) {
      const min = parseFinancialValue(productData.profitability);
      const max = parseFinancialValue(productData.variableProfitability);
      const period = productData.profitabilityPeriod || 'mensuel';
      profitabilityText = `${min.toFixed(2)}% NET variable jusqu'à ${max.toFixed(2)}% NET ${period}`;
    } else if (productData.profitability !== null && productData.profitability !== undefined) {
      const profit = parseFinancialValue(productData.profitability);
      const period = productData.profitabilityPeriod || 'mensuel';
      profitabilityText = `${profit.toFixed(2)}% NET ${period}`;
    }

    // Calculate contract end date (using today as start date)
    const contractStartDate = new Date();
    const contractEndDate = new Date(contractStartDate);
    contractEndDate.setMonth(contractEndDate.getMonth() + durationMonths);
    const contractEndDateStr = formatDateToFrench(contractEndDate.toISOString().split('T')[0]);

    // Calculate interest (use the same logic as the profitability simulator)
    const sim = simulateProfitability(productData, amount, { rateMode: 'avg', customRatePct: '' });
    const profitabilityRate = sim.pickedRatePct;
    const interestAmount = sim.totalProfit;

    // Interest period
    const interestPeriod = subscriptionData.interestPeriod || productData.interestPeriod || 'Fin de contrat';

    // Auto-renewal / compounding
    const autoRenewal = normalizeBool(productData.capitalisationFonds ?? productData.capitalisation_fonds) ? 'OUI' : 'NON';

    // Min/Max investment
    const minInvestment = parseFinancialValue(productData.minEntryValue) || 0;
    const maxInvestment = parseFinancialValue(productData.maxEntryValue) || 0;

    const today = new Date();
    const todayStr = formatDateToFrench(today.toISOString().split('T')[0]);
    const todayFormatted = today.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return {
      companyName,
      companyAddress,
      companyWebsite,
      companyEmail,
      investorName,
      investorEmail,
      investorPhone,
      investorBirthDate,
      investorCity,
      productName: productData.name || '',
      amount,
      duration,
      durationMonths,
      profitabilityText,
      contractEndDateStr,
      interestAmount,
      interestPeriod,
      autoRenewal,
      minInvestment,
      maxInvestment,
      todayStr,
      todayFormatted,
      cgv: productData.cgv || '',
      profitabilityRate,
    };
  };

  if (loading) {
    return (
      <div style={{ padding: '20px 20px' }}>
        <div>Chargement...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '20px 20px' }}>
        <div>Produit introuvable</div>
      </div>
    );
  }

  // Product view (internal investment products)
  if (dataType === 'product') {
    const product = data;
    const minInvestment = parseFinancialValue(product.minEntryValue);
    const maxInvestment = parseFinancialValue(product.maxEntryValue);
    
    const basePriceNum = parseFinancialValue(simulatorBasePrice) || 0;
    const sim = simulateProfitability(product, basePriceNum, {
      rateMode: simulatorRateMode,
      customRatePct: simulatorCustomRate,
    });
    const calculatedGains = sim.totalProfit;
    const total = sim.endCapital;

    // Helper function to get TradingView symbol for products linked to assets
    const getProductTradingViewSymbol = (productData: any): string | null => {
      if (!productData || productData.linkToAssets !== 'Oui' && productData.link_to_assets !== 'Oui') {
        return null;
      }
      
      // Try to use product reference as symbol (may need to be configured)
      if (productData.reference) {
        // For now, use reference directly - in production, you might want to fetch linked asset
        return productData.reference;
      }
      
      return null;
    };

    // Get TradingView symbol for product (if linked to assets)
    const productTradingViewSymbol = getProductTradingViewSymbol(product);
    const isProductLinkedToAssets = product.linkToAssets === 'Oui' || product.link_to_assets === 'Oui';
    
    return (
      <div
        style={{
          width: '100%',
          maxWidth: 1280,
          margin: '0 auto',
          padding: isMobile ? '16px' : '24px',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Breadcrumb */}
        <div style={{ 
          marginBottom: isMobile ? '16px' : '20px', 
          fontSize: isMobile ? '12px' : '14px', 
          color: '#6b7280',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
        }}>
          <span 
            onClick={() => navigate('/platform/discover')}
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
          >
            Découvrir
          </span>
          {(product.categoryTitle || product.categoryName) && (
            <>
              {' > '}
              <span>{product.categoryTitle || product.categoryName}</span>
            </>
          )}
          {product.subcategory && (
            <>
              {' > '}
              <span>{product.subcategory}</span>
            </>
          )}
          {' > '}
          <span>{product.name}</span>
        </div>

        {/* Header Section */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          marginBottom: isMobile ? '20px' : '30px',
          paddingBottom: isMobile ? '16px' : '20px',
          borderBottom: '1px solid #e5e7eb',
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="platform-page-title" style={{ marginBottom: '8px', wordBreak: 'break-word' }}>
              {product.name || 'N/A'}
            </h1>
            {product.reference && (
              <div style={{ fontSize: isMobile ? '14px' : '16px', color: '#6b7280' }}>
                {product.reference}
              </div>
            )}
          </div>

        </div>

        {/* Product Details Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', 
          gap: isMobile ? '20px' : '30px', 
          marginBottom: isMobile ? '20px' : '30px' 
        }}>
          {/* Main Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Product Image */}
            {product.imageUrl && (
              <div style={{ 
                marginBottom: '20px',
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
              }}>
                <img 
                  src={product.imageUrl}
                  alt={product.name}
                  style={{
                    width: '100%',
                    height: isMobile ? 'auto' : '500px',
                    maxHeight: isMobile ? '300px' : '500px',
                    borderRadius: '12px',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
            )}
            
            {/* Product Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>Détails du produit</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', 
                  gap: isMobile ? '16px' : '20px' 
                }}>
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Durée</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {product.duration ? `${product.duration} Mois` : 'N/A'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Rentabilité</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--platform-button-bg)' }}>
                      {formatProfitability(product)}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Investissement minimum</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {minInvestment > 0 ? `${minInvestment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR` : 'N/A'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Plafond de souscription</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {maxInvestment > 0 ? `${maxInvestment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR` : 'N/A'}
                    </div>
                  </div>
                  
                  {product.availabilityStart && (
                    <div>
                      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Début de disponibilité</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                        {formatDateToFrench(product.availabilityStart)}
                      </div>
                    </div>
                  )}
                  
                  {product.availabilityEnd && (
                    <div>
                      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Fin de disponibilité</div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                        {formatDateToFrench(product.availabilityEnd)}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Capitalisation des fonds</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {product.capitalisationFonds || product.capitalisation_fonds ? 'Oui' : 'Non'}
                    </div>
                  </div>
                </div>
                
                <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                  <Button 
                    variant="outline" 
                    style={{ fontSize: '14px' }}
                    onClick={() => setShowCGVModal(true)}
                  >
                    <FileText className="h-4 w-4" style={{ marginRight: '8px' }} />
                    Conditions générales
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Stock Charts for Products Linked to Assets */}
            {/* Note: To show charts for products linked to assets, we need to fetch the linked asset ID */}
            {/* For now, charts are only available when viewing assets directly */}

            {/* Profitability Simulator */}
            <Card>
              <CardHeader>
                <CardTitle>Simulateur de rentabilité</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Montant */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                  }}>
                    <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>Montant</span>
                    <Input
                      type="number"
                      value={simulatorBasePrice}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSimulatorBasePrice(value);
                        const numValue = parseFloat(value) || 0;
                        setSimulatorAmount(numValue);
                      }}
                      style={{ 
                        width: isMobile ? '100%' : '120px', 
                        textAlign: isMobile ? 'left' : 'right',
                        border: 'none',
                        backgroundColor: 'transparent',
                        padding: '0',
                        maxWidth: '100%',
                      }}
                    />
                  </div>

                  {/* Taux (min/avg/max/custom) */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '8px 12px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '14px', color: '#374151', fontWeight: 500, marginBottom: 6 }}>Taux utilisé</div>
                      <Select
                        value={simulatorRateMode}
                        onValueChange={(v) => setSimulatorRateMode(v as any)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="min">Minimum</SelectItem>
                          <SelectItem value="avg">Moyen</SelectItem>
                          <SelectItem value="max">Maximum</SelectItem>
                          <SelectItem value="custom">Personnalisé</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div style={{ padding: '8px 12px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '14px', color: '#374151', fontWeight: 500, marginBottom: 6 }}>Taux (%)</div>
                      <Input
                        type="number"
                        value={simulatorRateMode === 'custom' ? simulatorCustomRate : String(sim.pickedRatePct || 0)}
                        onChange={(e) => setSimulatorCustomRate(e.target.value)}
                        disabled={simulatorRateMode !== 'custom'}
                        style={{ backgroundColor: simulatorRateMode === 'custom' ? 'white' : '#f9fafb' }}
                      />
                      <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                        {product?.profitabilityPeriod ? `par ${product.profitabilityPeriod}` : 'par période'}
                        {sim.compound ? ' • capitalisation' : ''}
                      </div>
                    </div>
                  </div>
                  
                  {/* Calculation Fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Durée */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                    }}>
                      <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>Durée</span>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>{product.duration ? `${product.duration} Mois` : 'N/A'}</span>
                    </div>
                    
                    {/* Rentabilité */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                    }}>
                      <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>Rentabilité</span>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>{formatProfitability(product)}</span>
                    </div>
                    
                    {/* Gains */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: isMobile ? '8px' : '8px 12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      flexWrap: 'wrap',
                      gap: isMobile ? '4px' : '0',
                    }}>
                      <span style={{ 
                        fontSize: isMobile ? '13px' : '14px', 
                        color: '#374151', 
                        fontWeight: '500',
                        flex: '0 1 auto',
                        minWidth: 0,
                      }}>Gains</span>
                      <span style={{ 
                        fontSize: isMobile ? '13px' : '14px', 
                        color: '#6b7280',
                        flex: '0 1 auto',
                        minWidth: 0,
                        textAlign: 'right',
                        wordBreak: 'break-word',
                      }}>
                        {calculatedGains.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                      </span>
                    </div>
                    
                    {/* Total */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: isMobile ? '8px' : '8px 12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      flexWrap: 'wrap',
                      gap: isMobile ? '4px' : '0',
                    }}>
                      <span style={{ 
                        fontSize: isMobile ? '13px' : '14px', 
                        color: '#374151', 
                        fontWeight: '500',
                        flex: '0 1 auto',
                        minWidth: 0,
                      }}>Total</span>
                      <span style={{ 
                        fontSize: isMobile ? '13px' : '14px', 
                        color: '#6b7280',
                        flex: '0 1 auto',
                        minWidth: 0,
                        textAlign: 'right',
                        wordBreak: 'break-word',
                      }}>
                        {total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                      </span>
                    </div>

                    {/* Annualized */}
                    {sim.annualizedPct != null && Number.isFinite(sim.annualizedPct) && (
                      <div style={{ 
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: isMobile ? '8px' : '8px 12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        flexWrap: 'wrap',
                        gap: isMobile ? '4px' : '0',
                      }}>
                        <span style={{ fontSize: isMobile ? '13px' : '14px', color: '#374151', fontWeight: '500' }}>
                          Annualisé (indicatif)
                        </span>
                        <span style={{ fontSize: isMobile ? '13px' : '14px', color: '#6b7280' }}>
                          {sim.annualizedPct.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Breakdown table */}
                  {sim.rows.length > 0 && (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 13, color: '#374151', fontWeight: 600 }}>
                        Détail par période
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                          <thead>
                            <tr style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb' }}>
                              <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>Période</th>
                              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>Mois</th>
                              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>Base</th>
                              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>Taux</th>
                              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>Profit</th>
                              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>Fin</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sim.rows.map((r) => (
                              <tr key={r.index} style={{ borderBottom: '1px solid rgba(229,231,235,0.7)' }}>
                                <td style={{ padding: '10px 12px', fontSize: 13, color: '#111827', fontWeight: 600 }}>#{r.index}</td>
                                <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', textAlign: 'right' }}>{r.months}</td>
                                <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', textAlign: 'right' }}>
                                  {r.base.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </td>
                                <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', textAlign: 'right' }}>
                                  {r.ratePct.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                </td>
                                <td style={{ padding: '10px 12px', fontSize: 13, color: '#0f766e', textAlign: 'right', fontWeight: 700 }}>
                                  +{r.profit.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </td>
                                <td style={{ padding: '10px 12px', fontSize: 13, color: '#111827', textAlign: 'right', fontWeight: 800 }}>
                                  {r.end.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', fontSize: 12, color: '#6b7280' }}>
                        Le calcul utilise la rentabilité “par période” (mensuelle/trimestrielle/…) et applique la capitalisation si elle est activée sur le produit.
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Description */}
            {product.description && (
              <Card>
                <CardHeader>
                  <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const limit = isMobile ? 280 : 520;
                    const full = String(product.description || '');
                    const shouldTruncate = full.length > limit;
                    const text = isDescriptionExpanded ? full : getTruncatedText(full, limit);
                    return (
                      <>
                        <div style={{ 
                          fontSize: isMobile ? '13px' : '14px', 
                          color: '#374151', 
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {text}
                        </div>
                        {shouldTruncate && (
                          <button
                            type="button"
                            onClick={() => setIsDescriptionExpanded((v) => !v)}
                            style={{
                              marginTop: 10,
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              color: 'var(--platform-button-bg)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            {isDescriptionExpanded ? 'Lire moins' : 'Lire plus'}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div style={{ 
            position: 'sticky',
            top: isMobile ? '76px' : '88px',
            alignSelf: 'flex-start',
            maxHeight: isMobile ? 'calc(100vh - 96px)' : 'calc(100% - 108px)',
            overflowY: 'auto',
          }}>
            {/* Subscription Form Card */}
            {showSubscriptionForm && (
              <Card style={{ marginBottom: '20px'}}>
                <CardHeader>
                  <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>Formulaire de souscription</CardTitle>
                </CardHeader>
                <CardContent style={{ minHeight: '100px' }}>
                  {subscriptionSuccess ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{
                        padding: '12px',
                        backgroundColor: '#f0fdf4',
                        border: '1px solid #86efac',
                        borderRadius: '8px',
                        color: '#166534',
                        fontSize: '14px',
                        textAlign: 'center',
                        fontWeight: 600,
                      }}>
                        {subscriptionSuccess}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px', minHeight: '650px' }}>

                    
                    <div>
                      <Label htmlFor="firstName">Prénom</Label>
                      <Input
                        id="firstName"
                        value={subscriptionData.firstName}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, firstName: e.target.value })}
                        placeholder="Prénom"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="lastName">Nom</Label>
                      <Input
                        id="lastName"
                        value={subscriptionData.lastName}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, lastName: e.target.value })}
                        placeholder="Nom"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="birthDate">Date de naissance</Label>
                      <Input
                        id="birthDate"
                        value={subscriptionData.birthDate || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Always update with the raw value user is typing - no formatting during typing
                          setSubscriptionData({ ...subscriptionData, birthDate: value });
                        }}
                        onBlur={(e) => {
                          // When user finishes typing, try to convert to ISO format if complete
                          const value = e.target.value.trim();
                          if (!value) {
                            setSubscriptionData({ ...subscriptionData, birthDate: '' });
                            return;
                          }
                          
                          // Try to parse French date format (jj/mm/aaaa)
                          const dateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                          if (dateMatch) {
                            const [, day, month, year] = dateMatch;
                            const dayNum = parseInt(day);
                            const monthNum = parseInt(month);
                            const yearNum = parseInt(year);
                            
                            // Validate date
                            if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
                              const date = new Date(yearNum, monthNum - 1, dayNum);
                              // Check if date is valid (handles cases like 31/02)
                              if (date.getDate() === dayNum && date.getMonth() === monthNum - 1 && date.getFullYear() === yearNum) {
                                setSubscriptionData({ ...subscriptionData, birthDate: dateToISOString(date) });
                              } else {
                                // Invalid date, keep as-is
                                setSubscriptionData({ ...subscriptionData, birthDate: value });
                              }
                            } else {
                              // Keep as-is if incomplete or invalid
                              setSubscriptionData({ ...subscriptionData, birthDate: value });
                            }
                          } else {
                            // Not a complete date format, keep as-is
                            setSubscriptionData({ ...subscriptionData, birthDate: value });
                          }
                        }}
                        placeholder="jj/mm/aaaa"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="ip">IP de la transaction</Label>
                      <Input
                        id="ip"
                        value={clientIP}
                        disabled
                        style={{ backgroundColor: '#f9fafb', color: '#6b7280' }}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="transactionDate">Fait le (Date)</Label>
                      <Input
                        id="transactionDate"
                        type="date"
                        value={new Date().toISOString().split('T')[0]}
                        disabled
                        style={{ backgroundColor: '#f9fafb', color: '#6b7280' }}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="city">À (Ville)</Label>
                      <Input
                        id="city"
                        value={subscriptionData.city}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, city: e.target.value })}
                        placeholder="Ville"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="amount">Montant</Label>
                      <Input
                        id="amount"
                        type="number"
                        value={subscriptionData.amount}
                        onChange={(e) => setSubscriptionData({ ...subscriptionData, amount: e.target.value })}
                        placeholder="10000"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="interestPeriod">Période d'intérêt</Label>
                      {(() => {
                        const availableOptions = getInterestPeriodOptions(product);
                        const isSingleOption = availableOptions.length === 1;
                        const currentValue = subscriptionData.interestPeriod || (isSingleOption ? availableOptions[0] : '');
                        
                        return (
                          <Select
                            value={currentValue}
                            onValueChange={(value) => setSubscriptionData({ ...subscriptionData, interestPeriod: value })}
                            disabled={isSingleOption}
                          >
                            <SelectTrigger id="interestPeriod" style={isSingleOption ? { backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' } : {}}>
                              <SelectValue placeholder={isSingleOption ? availableOptions[0] : "Sélectionner une période"} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>
                    
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Signature</div>
                      <div style={{ 
                        padding: '16px', 
                        backgroundColor: '#f9fafb', 
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        position: 'relative',
                      }}>
                        {signature ? (
                          <div style={{ position: 'relative' }}>
                            <img 
                              src={signature} 
                              alt="Signature" 
                              style={{ 
                                width: '100%', 
                                maxHeight: '150px', 
                                objectFit: 'contain',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                backgroundColor: 'white',
                              }} 
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setSignature(null);
                                const canvas = signatureCanvasRef.current;
                                if (canvas) {
                                  const ctx = canvas.getContext('2d');
                                  if (ctx) {
                                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                                  }
                                }
                              }}
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                padding: '4px 8px',
                                fontSize: '12px',
                              }}
                            >
                              Effacer
                            </Button>
                          </div>
                        ) : (
                          <>
                            <canvas
                              ref={signatureCanvasRef}
                              width={600}
                              height={150}
                              style={{
                                width: '100%',
                                height: '150px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                backgroundColor: 'white',
                                cursor: 'crosshair',
                                touchAction: 'none',
                              }}
                              onMouseDown={(e) => {
                                isDrawingRef.current = true;
                                setIsDrawing(true);
                                const canvas = signatureCanvasRef.current;
                                if (!canvas) return;
                                const rect = canvas.getBoundingClientRect();
                                const ctx = canvas.getContext('2d');
                                if (!ctx) return;
                                ctx.beginPath();
                                ctx.moveTo(
                                  e.clientX - rect.left,
                                  e.clientY - rect.top
                                );
                              }}
                              onMouseMove={(e) => {
                                if (!isDrawingRef.current) return;
                                const canvas = signatureCanvasRef.current;
                                if (!canvas) return;
                                const rect = canvas.getBoundingClientRect();
                                const ctx = canvas.getContext('2d');
                                if (!ctx) return;
                                ctx.lineTo(
                                  e.clientX - rect.left,
                                  e.clientY - rect.top
                                );
                                ctx.strokeStyle = '#000';
                                ctx.lineWidth = 2;
                                ctx.lineCap = 'round';
                                ctx.lineJoin = 'round';
                                ctx.stroke();
                              }}
                              onMouseUp={() => {
                                isDrawingRef.current = false;
                                setIsDrawing(false);
                                const canvas = signatureCanvasRef.current;
                                if (canvas) {
                                  setSignature(canvas.toDataURL());
                                }
                              }}
                              onMouseLeave={() => {
                                isDrawingRef.current = false;
                                setIsDrawing(false);
                                const canvas = signatureCanvasRef.current;
                                if (canvas) {
                                  setSignature(canvas.toDataURL());
                                }
                              }}
                            />
                            <div style={{ 
                              marginTop: '8px', 
                              fontSize: '12px', 
                              color: '#6b7280',
                              textAlign: 'center',
                            }}>
                              Signez dans la zone ci-dessus
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Prévisualisation du contrat</div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openContractPDF}
                        style={{ width: '100%' }}
                      >
                        Voir le contrat
                      </Button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={subscriptionData.acceptTerms}
                          onChange={(e) => setSubscriptionData({ ...subscriptionData, acceptTerms: e.target.checked })}
                        />
                        <span style={{ fontSize: '14px' }}>Bon pour accord</span>
                      </label>
                      
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={subscriptionData.acceptConditions}
                          onChange={(e) => setSubscriptionData({ ...subscriptionData, acceptConditions: e.target.checked })}
                        />
                        <span style={{ fontSize: '14px' }}>J'accepte les Termes et Conditions</span>
                      </label>
                    </div>
                    
                    <Button 
                      onClick={handleSubscribe}
                      disabled={isSubscribing}
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--platform-button-bg)',
                        color: 'white',
                        fontWeight: '600',
                        padding: '12px',
                        borderRadius: '8px',
                        marginTop: '10px',
                        opacity: isSubscribing ? 0.6 : 1,
                        cursor: isSubscribing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSubscribing ? 'Souscription en cours...' : 'Souscrire'}
                    </Button>
                    {subscriptionError && (
                      <div style={{
                        marginTop: '12px',
                        padding: '12px',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        color: '#dc2626',
                        fontSize: '14px',
                        textAlign: 'center',
                      }}>
                        {subscriptionError}
                      </div>
                    )}
                  </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* CGV Modal */}
        {showCGVModal && (
          <div className="modal-overlay" onClick={() => setShowCGVModal(false)}>
            <div className="modal-content modal-content--scrollable" onClick={(e) => e.stopPropagation()} style={{ maxWidth: isMobile ? '95vw' : '800px' }}>
              <div className="modal-header">
                <h2 className="modal-title">Conditions Générales de Vente</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="modal-close"
                  onClick={() => setShowCGVModal(false)}
                >
                  <X className="planning-icon-md" />
                </Button>
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: '#374151', 
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
              }}>
                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>{product.name}</div>
                {product.cgv || 'Aucune condition générale disponible pour ce produit.'}
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // Asset view (crypto/stocks) - existing code
  const asset = data;
  const getAssetType = () => {
    const type = asset?.type?.toLowerCase() || '';
    if (type.includes('crypto') || type.includes('cryptomonnaie')) {
      return 'crypto';
    }
    return 'other';
  };

  const isCrypto = getAssetType() === 'crypto';
  const price = parseFinancialValue(asset?.price || asset?.lastPrice || 0);
  const priceChange = parseFinancialValue(asset?.priceChange || asset?.change || 0);
  const priceChangePercent = parseFinancialValue(asset?.priceChangePercent || asset?.changePercent || 0);
  const displayedChangePercent =
    typeof timeframePerformance?.percent === 'number' && Number.isFinite(timeframePerformance.percent)
      ? timeframePerformance.percent
      : priceChangePercent;

  const assetCurrency = tradeAssetCurrency;
  const assetExchange = String(asset?.exchange || '').trim().toUpperCase();
  const assetDisplayCurrency = (String(asset?.currency || assetCurrency || 'USD').trim().toUpperCase() || 'USD');

  const getMarketOpenStatus = (): boolean | null => {
    if (isCrypto) return true;

    const exchange = assetExchange;
    const region = String(asset?.region || '').toLowerCase();

    type MarketSession = { timeZone: string; openMinutes: number; closeMinutes: number; weekendClosed: boolean };
    const session: MarketSession | null =
      exchange.includes('NASDAQ') || exchange.includes('NYSE') || exchange.includes('NYSEARCA') || exchange.includes('AMEX') || region.includes('united') || region === 'us'
        ? { timeZone: 'America/New_York', openMinutes: 9 * 60 + 30, closeMinutes: 16 * 60, weekendClosed: true }
        : exchange.includes('EURONEXT') || region.includes('france')
          ? { timeZone: 'Europe/Paris', openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30, weekendClosed: true }
          : null;

    if (!session) return null;

    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: session.timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());

      const map: Record<string, string> = {};
      for (const p of parts) {
        if (p.type !== 'literal') map[p.type] = p.value;
      }

      const weekday = map.weekday;
      const hour = Number(map.hour);
      const minute = Number(map.minute);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

      if (session.weekendClosed && (weekday === 'Sat' || weekday === 'Sun')) return false;

      const minutes = hour * 60 + minute;
      return minutes >= session.openMinutes && minutes < session.closeMinutes;
    } catch {
      return null;
    }
  };

  const marketOpenStatus = getMarketOpenStatus();
  const marketStatusText =
    marketOpenStatus === null ? 'Marché' : marketOpenStatus ? 'Marché ouvert' : 'Marché fermé';

  const amountEurNum = parseFinancialValue(String(tradeAmountEur).replace(',', '.'));
  const amountInAssetCurrency = amountEurNum * (assetCurrency === 'EUR' ? 1 : fxRateEurToAsset || 0);
  const estimatedShares =
    amountInAssetCurrency > 0 && price > 0 ? amountInAssetCurrency / price : 0;

  const getTimeframeLabel = (tf: typeof selectedTimeframe) => {
    switch (tf) {
      case '1D':
        return 'Dernières 24h';
      case '1W':
        return 'Semaine passée';
      case '1M':
        return 'Mois passé';
      case '6M':
        return '6 derniers mois';
      case '1Y':
        return 'Année passée';
      case '3Y':
        return '3 dernières années';
      case 'MAX':
      default:
        return 'Depuis le début';
    }
  };

  // Helper function to get TradingView symbol from asset
  // First tries to use the native trading_view_symbol if available (user-confirmed)
  // Otherwise falls back to constructing it from exchange and symbol
  // CRITICAL: TradingView embed widgets REQUIRE exchange prefix format (e.g., "NASDAQ:INTC")
  // Based on TradingView documentation, widgets work with "EXCHANGE:SYMBOL" format
  const getTradingViewSymbol = (assetData: any): string | null => {
    if (!assetData) return null;
    
    const assetTypeLower = (assetData.type || '').toLowerCase();
    const isAssetCrypto = assetTypeLower.includes('crypto') || assetTypeLower.includes('cryptomonnaie');
    
    // Priority 1: Use native TradingView symbol if available (user-confirmed during creation)
    const nativeSymbol = (assetData.trading_view_symbol || assetData.tradingViewSymbol || '').trim();
    if (nativeSymbol) {
      // CRITICAL: TradingView embed widgets REQUIRE exchange prefix format (e.g., "NASDAQ:INTC")
      // Based on TradingView documentation and user's finding, widgets work with "NASDAQ:INTC" format
      // Keep the symbol exactly as the user specified it
      if (nativeSymbol.includes(':')) {
        console.log(`[ProductDetail] Using native TradingView symbol with exchange prefix: ${nativeSymbol}`);
        return nativeSymbol; // Keep exchange prefix - widgets require it
      }
      
      // No exchange prefix - try to add it if we have exchange info
      const exchange = (assetData.exchange || '').toUpperCase().trim();
      if (exchange && !isAssetCrypto) {
        const symbolWithExchange = `${exchange}:${nativeSymbol.toUpperCase()}`;
        console.log(`[ProductDetail] Adding exchange prefix to native symbol: ${nativeSymbol} -> ${symbolWithExchange}`);
        return symbolWithExchange;
      }
      
      // No exchange available, return as-is
      console.log(`[ProductDetail] Using native symbol without exchange prefix: ${nativeSymbol}`);
      return nativeSymbol.toUpperCase();
    }
    
    // Priority 2: Fallback to constructing from exchange and symbol
    const symbol = (assetData.alpha_vantage_symbol || assetData.alphaVantageSymbol || '').toUpperCase().trim();
    if (!symbol) return null;
    
    const exchange = (assetData.exchange || '').toUpperCase().trim();
    
    // TradingView embed widgets REQUIRE exchange prefix format
    // Always use EXCHANGE:SYMBOL format if we have exchange info
    if (exchange) {
      if (isAssetCrypto) {
        // For crypto, use EXCHANGE:SYMBOLUSDT format (e.g., BINANCE:BTCUSDT)
        if (symbol.endsWith('USDT')) {
          return `${exchange}:${symbol}`;
        } else {
          return `${exchange}:${symbol}USDT`;
        }
      } else {
        // For stocks (US and international), use EXCHANGE:SYMBOL format
        // TradingView widgets work with "NASDAQ:INTC" format
        return `${exchange}:${symbol}`;
      }
    }
    
    // Fallback: use symbol without exchange (may not work but worth trying)
    console.warn(`[ProductDetail] No exchange available for symbol ${symbol}, using symbol without exchange prefix`);
    return symbol;
  };

  // Get TradingView symbol for current asset
  const tradingViewSymbol = getTradingViewSymbol(asset);
  
  // Debug: log the symbol being used (only if asset exists and we have symbol data)
  // Note: This is not a hook, just a conditional log, so it's safe
  if (asset && dataType === 'asset' && (tradingViewSymbol || asset.alpha_vantage_symbol || asset.alphaVantageSymbol)) {
    const nativeSymbol = (asset.trading_view_symbol || asset.tradingViewSymbol || '').trim();
    console.log('[ProductDetail] TradingView symbol for asset:', {
      assetName: asset.name,
      assetReference: asset.reference,
      alphaVantageSymbol: asset.alpha_vantage_symbol || asset.alphaVantageSymbol,
      exchange: asset.exchange,
      type: asset.type,
      nativeTradingViewSymbol: nativeSymbol,
      finalTradingViewSymbol: tradingViewSymbol,
      hasExchangePrefix: tradingViewSymbol?.includes(':'),
      note: nativeSymbol && nativeSymbol !== tradingViewSymbol ? 'Symbol was modified' : 'Using symbol as-is'
    });
    
    // Warn if symbol doesn't have exchange prefix
    if (tradingViewSymbol && !tradingViewSymbol.includes(':')) {
      console.warn('[ProductDetail] WARNING: TradingView symbol has no exchange prefix:', tradingViewSymbol);
      console.warn('[ProductDetail] TradingView widgets work better with format "EXCHANGE:SYMBOL" (e.g., "NASDAQ:INTC")');
    }
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1280,
        margin: '0 auto',
        padding: isMobile ? '16px' : '24px',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Breadcrumb */}
      <div style={{ marginBottom: '20px', fontSize: '14px', color: '#6b7280' }}>
        <span 
          onClick={() => navigate('/platform/discover')}
          style={{ cursor: 'pointer', textDecoration: 'underline' }}
        >
          Découvrir
        </span>
        {' > '}
        {isCrypto && (
          <>
            <span>Crypto</span>
            {' > '}
            <span>Coins</span>
            {' > '}
          </>
        )}
        <span>{asset.reference || asset.name}</span>
      </div>

      {/* Header Section */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: isMobile ? '20px' : '30px',
        paddingBottom: isMobile ? '16px' : '20px',
        borderBottom: '1px solid #e5e7eb',
        flexWrap: 'wrap',
        gap: isMobile ? '12px' : '0',
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: isMobile ? '12px' : '16px',
          flex: 1,
          minWidth: 0,
        }}>
          {/* Asset Logo */}
          {asset.logoUrl ? (
            <img 
              src={asset.logoUrl}
              alt={asset.name}
              style={{
                width: isMobile ? '48px' : '82px',
                height: isMobile ? '48px' : '82px',
                borderRadius: '5px',
                objectFit: 'contain',
                flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: isMobile ? '48px' : '64px',
              height: isMobile ? '48px' : '64px',
              borderRadius: '12px',
              backgroundColor: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: isMobile ? '20px' : '24px',
              fontWeight: 'bold',
              flexShrink: 0,
            }}>
              {asset.name?.charAt(0) || 'A'}
            </div>
          )}
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: isMobile ? '8px' : '12px', 
              flexWrap: 'wrap',
            }}>
              <h1 style={{ 
                fontSize: isMobile ? '16px' : '20px', 
                fontWeight: 'bold', 
                margin: 0,
                wordBreak: 'break-word',
              }}>
                {asset.reference || 'N/A'} {asset.name || ''}
              </h1>
            </div>
            
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: isMobile ? '12px' : '20px',
              flexWrap: 'wrap',
            }}>
              <div style={{ 
                fontSize: isMobile ? '18px' : '20px', 
                fontWeight: 'bold', 
                color: priceChangePercent >= 0 ? 'var(--platform-button-bg)' : '#ef4444' 
              }}>
                {price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ 
                fontSize: isMobile ? '12px' : '14px', 
                color: priceChangePercent >= 0 ? 'var(--platform-button-bg)' : '#ef4444' 
              }}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                {' '}({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
              </div>
            </div>
            
            <div style={{ 
              fontSize: isMobile ? '12px' : '14px', 
              color: '#6b7280'
            }}>
              {marketStatusText} • PRIX PAR {assetExchange || '—'}, EN {assetDisplayCurrency}
            </div>
          </div>
        </div>

        {currentUser?.tradingEnabled !== false && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: isMobile ? '100%' : 'auto' }}>
            <Button 
              style={{
                backgroundColor: 'var(--platform-button-bg)',
                color: 'white',
                fontWeight: '600',
                padding: '12px 24px',
                borderRadius: 9999,
                border: 'none',
                cursor: 'pointer',
                width: isMobile ? '100%' : 'auto',
              }}
            onClick={() => {
              setTradeAmountEur('');
              setFxError(null);
              setTradeOrderSuccess(null);
              setShowTradeModal(true);
            }}
            >
              Trader
            </Button>
          </div>
        )}
      </div>

      {/* Trade modal (client enters amount in EUR) */}
      <Dialog
        open={showTradeModal}
        onOpenChange={(open) => {
          setShowTradeModal(open);
          if (open) {
            setTradeOrderError(null);
            setTradeOrderSuccess(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tradeOrderSuccess ? 'Ordre placé' : `Trader ${asset?.reference || asset?.name || ''}`}
            </DialogTitle>
            <DialogDescription>
              {tradeOrderSuccess
                ? "Votre ordre a été enregistré. Vous trouverez le récapitulatif ci-dessous."
                : `Saisissez un montant en EUR. Le nombre d’actions est estimé en fonction du prix actuel${
                    assetCurrency !== 'EUR' ? ` et du taux de change EUR/${assetCurrency}` : ''
                  }.`}
            </DialogDescription>
          </DialogHeader>

          {tradeOrderSuccess ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 9999,
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Check size={22} color="#16a34a" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Ordre placé</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {asset?.reference || asset?.name || 'Actif'}
                  </div>
                </div>
              </div>

              <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                  <span>Montant</span>
                  <strong>
                    {tradeOrderSuccess.amountEur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginTop: 6 }}>
                  <span>Actions estimées</span>
                  <strong>
                    {tradeOrderSuccess.estimatedShares > 0
                      ? tradeOrderSuccess.estimatedShares.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
                      : '—'}
                  </strong>
                </div>
                {tradeOrderSuccess.assetCurrency !== 'EUR' && tradeOrderSuccess.fxRateEurToAsset > 0 && (
                  <div style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
                    Taux utilisé: <strong>1 EUR ≈ {tradeOrderSuccess.fxRateEurToAsset.toFixed(6)} {tradeOrderSuccess.assetCurrency}</strong>
                  </div>
                )}
                {!!tradeOrderSuccess.transaction && (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>
                    Référence: <strong>{tradeOrderSuccess.transaction?.id || tradeOrderSuccess.transaction?.reference || '—'}</strong>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowTradeModal(false);
                    setTradeOrderSuccess(null);
                    setTradeAmountEur('');
                  }}
                >
                  Fermer
                </Button>
                <Button
                  onClick={() => {
                    setShowTradeModal(false);
                    setTradeOrderSuccess(null);
                    setTradeAmountEur('');
                    navigate('/platform/portfolio');
                  }}
                >
                  Voir portefeuille
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label htmlFor="trade-amount-eur">Montant (EUR)</Label>
              <Input
                id="trade-amount-eur"
                inputMode="decimal"
                placeholder="Ex: 1000"
                value={tradeAmountEur}
                onChange={(e) => {
                  setTradeAmountEur(e.target.value);
                  if (tradeOrderError) setTradeOrderError(null);
                }}
              />
              {tradeOrderError && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#ef4444' }}>
                  {tradeOrderError}
                </div>
              )}
            </div>

            {assetCurrency !== 'EUR' && (
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {fxLoading ? (
                  <div>Récupération du taux de change…</div>
                ) : fxError ? (
                  <div style={{ color: '#ef4444' }}>{fxError}</div>
                ) : (
                  <>
                    <div>
                      Taux estimé: <strong>1 EUR ≈ {fxRateEurToAsset.toFixed(6)} {assetCurrency}</strong>
                    </div>
                    {amountEurNum > 0 && fxRateEurToAsset > 0 && (
                      <div>
                        Montant converti: <strong>{amountInAssetCurrency.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {assetCurrency}</strong>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb' }}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Estimation</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                <span>Prix par action</span>
                <strong>
                  {price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {assetCurrency}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginTop: 6 }}>
                <span>Actions estimées</span>
                <strong>
                  {estimatedShares > 0
                    ? estimatedShares.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
                    : '—'}
                </strong>
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {isCrypto
                ? "Marché crypto: ouvert 24/7."
                : "Si le marché est fermé, l’opération sera exécutée à la prochaine ouverture."}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button
                variant="outline"
                disabled={isPlacingTradeOrder}
                onClick={() => setShowTradeModal(false)}
              >
                Fermer
              </Button>
              <Button
                disabled={
                  isPlacingTradeOrder ||
                  amountEurNum <= 0 ||
                  (assetCurrency !== 'EUR' && (fxLoading || fxRateEurToAsset <= 0))
                }
                onClick={async () => {
                  try {
                    if (!currentUser?.id) {
                      toast.error('Utilisateur non connecté');
                      return;
                    }
                    if (!asset?.id) {
                      toast.error('Actif introuvable');
                      return;
                    }

                    setTradeOrderError(null);
                    setIsPlacingTradeOrder(true);

                    const payload = {
                      type: 'transfert',
                      amount: Number(amountEurNum),
                      description: `Ordre de trading: ${asset?.reference || asset?.name || asset?.id}`,
                      datetime: new Date().toISOString(),
                      status: 'termine',
                      transfer_from: 'balance',
                      transfer_to: 'trading',
                      subscription_details: {
                        tradeType: 'asset',
                        assetId: asset.id,
                        assetName: asset?.name || undefined,
                        assetReference: asset?.reference || undefined,
                        assetCurrency,
                        price,
                        estimatedShares,
                        fxRateEurToAsset: assetCurrency !== 'EUR' ? fxRateEurToAsset : 1,
                      },
                    };

                    const created = await apiCall(`/api/clients/${currentUser.id}/transactions/create/`, {
                      method: 'POST',
                      body: JSON.stringify(payload),
                    });

                    // Prefer the created transaction if the API returns it, otherwise fetch the
                    // latest matching transaction and display it in the modal.
                    let createdTransaction: any | null =
                      (created && (created as any).transaction) ? (created as any).transaction : created || null;

                    try {
                      const transactionsResponse = await apiCall(`/api/clients/${currentUser.id}/transactions/`);
                      const list = (transactionsResponse?.transactions || []) as any[];
                      setTransactions(list);

                      if (!createdTransaction && Array.isArray(list) && list.length > 0) {
                        const normalizedAmount = Number(amountEurNum);
                        const sorted = [...list].sort(
                          (a: any, b: any) => new Date(b?.datetime || 0).getTime() - new Date(a?.datetime || 0).getTime()
                        );
                        createdTransaction =
                          sorted.find((t: any) => {
                            const details = t?.subscription_details || t?.subscriptionDetails || {};
                            const tAmount = typeof t?.amount === 'string' ? parseFloat(t.amount) : Number(t?.amount);
                            return (
                              t?.type === 'transfert' &&
                              Number.isFinite(tAmount) &&
                              Math.abs(tAmount - normalizedAmount) < 0.0001 &&
                              (details?.assetId === asset.id ||
                                details?.assetReference === asset?.reference ||
                                String(t?.description || '').includes(String(asset?.reference || asset?.name || '')))
                            );
                          }) || sorted[0] || null;
                      }
                    } catch (e) {
                      // If fetching fails, we still show the success state with the values we have.
                      console.warn('Unable to refresh transactions after order placement:', e);
                    }

                    setTradeOrderSuccess({
                      amountEur: Number(amountEurNum),
                      assetCurrency,
                      estimatedShares,
                      fxRateEurToAsset: assetCurrency !== 'EUR' ? fxRateEurToAsset : 1,
                      transaction: createdTransaction,
                    });
                  } catch (error: any) {
                    console.error('Error placing trade order:', error);
                    const msg = String(error?.error || error?.message || '').trim();
                    if (msg.toLowerCase().includes('fonds insuffisants')) {
                      setTradeOrderError(msg || 'Fonds insuffisants');
                    } else {
                      toast.error(msg || 'Erreur lors du placement de l’ordre');
                    }
                  } finally {
                    setIsPlacingTradeOrder(false);
                  }
                }}
              >
                {isPlacingTradeOrder ? 'Traitement…' : 'Confirmer'}
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: isMobile ? '4px' : '8px', 
        marginBottom: isMobile ? '20px' : '30px',
        borderBottom: '1px solid #e5e7eb',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
      }}>
        {[
          { id: 'overview', label: 'Vue d\'ensemble', icon: BarChart3 },
          { id: 'analysis', label: 'Analyse', icon: FileText },
          { id: 'news', label: 'Actualités', icon: Newspaper },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: isMobile ? '10px 16px' : '12px 20px',
                border: 'none',
                backgroundColor: 'transparent',
                borderBottom: isActive ? '2px solid var(--platform-button-bg)' : '2px solid transparent',
                color: isActive ? '#111827' : '#6b7280',
                fontWeight: isActive ? '600' : '400',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? '6px' : '8px',
                fontSize: isMobile ? '12px' : '14px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', 
        gap: isMobile ? '20px' : '30px' 
      }}>
        {/* Main Content */}
        <div>
          {activeTab === 'overview' && (
            <Card>
              <CardHeader>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <CardTitle style={{ fontSize: isMobile ? '16px' : '18px' }}>Performance</CardTitle>
                    <div
                      style={{
                        fontSize: isMobile ? 12 : 13,
                        fontWeight: 600,
                        lineHeight: 1.1,
                        color: displayedChangePercent >= 0 ? 'var(--platform-button-bg)' : '#ef4444',
                      }}
                    >
                      {displayedChangePercent >= 0 ? '+' : ''}
                      {displayedChangePercent.toFixed(2)}% {getTimeframeLabel(selectedTimeframe)}
                    </div>
                  </div>

                  {/* Time range selector (top-right of chart) */}
                  <div style={{ width: isMobile ? '100%' : 180 }}>
                    <Select
                      value={selectedTimeframe}
                      onValueChange={(v) => setSelectedTimeframe(v as any)}
                    >
                      <SelectTrigger style={{ height: 38 }}>
                        <SelectValue placeholder="Période" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1D">1 jour</SelectItem>
                        <SelectItem value="1W">1 semaine</SelectItem>
                        <SelectItem value="1M">1 mois</SelectItem>
                        <SelectItem value="6M">6 mois</SelectItem>
                        <SelectItem value="1Y">1 an</SelectItem>
                        <SelectItem value="3Y">3 ans</SelectItem>
                        <SelectItem value="MAX">Max</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Stock Chart - Shows chart using Alpha Vantage/Finnhub data */}
                {asset.alpha_vantage_symbol || asset.alphaVantageSymbol ? (
                  <div style={{ marginBottom: '20px' }}>
                    <StockChart
                      assetId={String(asset.id)}
                      assetName={asset.name || asset.reference}
                      width="100%"
                      height={isMobile ? 400 : 500}
                      chartType="area"
                      showVolume={false}
                      timeframe={selectedTimeframe}
                      onPerformanceChange={setTimeframePerformance}
                    />
                  </div>
                ) : (
                  <div style={{
                    height: '300px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px',
                    border: '1px solid #e5e7eb',
                  }}>
                    <div style={{ color: '#6b7280' }}>
                      Symbole non disponible. Veuillez configurer "alpha_vantage_symbol" pour cet actif dans la gestion des actifs.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'analysis' && (
            <Card>
              <CardHeader>
                <CardTitle>Analyse</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ color: '#6b7280' }}>
                  Analyse détaillée du produit à venir...
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'news' && (
            <Card>
              <CardHeader>
                <CardTitle>Actualités</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ color: '#6b7280' }}>
                  Actualités liées au produit à venir...
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            position: isMobile ? 'static' : 'sticky',
            top: isMobile ? undefined : '88px',
            alignSelf: 'flex-start',
            maxHeight: isMobile ? 'none' : 'calc(100vh - 80px)',
            overflowY: 'visible',
          }}
        >
          {/* Additional Info Cards */}
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {asset.description && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: 6 }}>Description</div>
                    {(() => {
                      const limit = isMobile ? 220 : 320;
                      const full = String(asset.description || '');
                      const shouldTruncate = full.length > limit;
                      const text = isDescriptionExpanded ? full : getTruncatedText(full, limit);
                      return (
                        <>
                          <div style={{ fontSize: '13px', color: '#111827', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                            {text}
                          </div>
                          {shouldTruncate && (
                            <button
                              type="button"
                              onClick={() => setIsDescriptionExpanded((v) => !v)}
                              style={{
                                marginTop: 8,
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                color: 'var(--platform-button-bg)',
                                fontWeight: 600,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              {isDescriptionExpanded ? 'Lire moins' : 'Lire plus'}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
                {asset.category && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: isMobile ? '4px' : '0',
                  }}>
                    <span style={{ 
                      color: '#6b7280',
                      flex: '0 1 auto',
                      minWidth: 0,
                    }}>Catégorie:</span>
                    <span style={{ 
                      fontWeight: '600',
                      flex: '0 1 auto',
                      minWidth: 0,
                      textAlign: 'right',
                      wordBreak: 'break-word',
                    }}>{asset.category}</span>
                  </div>
                )}
                {asset.type && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: isMobile ? '4px' : '0',
                  }}>
                    <span style={{ 
                      color: '#6b7280',
                      flex: '0 1 auto',
                      minWidth: 0,
                    }}>Type:</span>
                    <span style={{ 
                      fontWeight: '600',
                      flex: '0 1 auto',
                      minWidth: 0,
                      textAlign: 'right',
                      wordBreak: 'break-word',
                    }}>{asset.type}</span>
                  </div>
                )}
                {(asset.exchange || asset.region) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Marché:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {[asset.exchange, asset.region].filter(Boolean).join(' • ')}
                    </span>
                  </div>
                )}
                {asset.currency && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Devise:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {asset.currency}
                    </span>
                  </div>
                )}
                {asset.sector && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Secteur:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {asset.sector}
                    </span>
                  </div>
                )}
                {asset.industry && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Industrie:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {asset.industry}
                    </span>
                  </div>
                )}
                {asset.country && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Pays:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {asset.country}
                    </span>
                  </div>
                )}
                {asset.headquarters && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Siège:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {asset.headquarters}
                    </span>
                  </div>
                )}
                {(asset.marketCap || asset.market_cap) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Capitalisation:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {Number(asset.marketCap || asset.market_cap).toLocaleString('fr-FR')} {asset.marketCapCurrency || asset.market_cap_currency || 'USD'}
                    </span>
                  </div>
                )}
                {asset.employees && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Employés:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {Number(asset.employees).toLocaleString('fr-FR')}
                    </span>
                  </div>
                )}
                {asset.ceo && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>PDG:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {asset.ceo}
                    </span>
                  </div>
                )}
                {asset.foundedYear && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Fondée en:</span>
                    <span style={{ fontWeight: '600', flex: '0 1 auto', minWidth: 0, textAlign: 'right', wordBreak: 'break-word' }}>
                      {asset.foundedYear}
                    </span>
                  </div>
                )}
                {asset.website && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobile ? '4px' : '0' }}>
                    <span style={{ color: '#6b7280', flex: '0 1 auto', minWidth: 0 }}>Site web:</span>
                    <a
                      href={asset.website}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', color: '#2563eb' }}
                    >
                      {asset.website}
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
