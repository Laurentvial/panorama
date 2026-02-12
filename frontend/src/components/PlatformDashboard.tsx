import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, Check, PieChart, Shield } from 'lucide-react';
import { apiCall } from '../utils/api';
import { useIsMobile } from './ui/use-mobile';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
import '../styles/PlatformDashboardMovers.css';

export function PlatformDashboard() {
  const { currentUser } = useUser();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [newsPosts, setNewsPosts] = useState<any[]>([]);
  const [visibleNewsCount, setVisibleNewsCount] = useState(5);
  const [assets, setAssets] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [verificationConfig, setVerificationConfig] = useState<Record<string, { enabled: boolean }>>({});


  const loadDashboardData = async () => {
    try {
      setLoading(true);
      // Load client-specific assets and products
      const [transactionsResponse, clientAssetsResponse, clientProductsResponse, positionsResponse] = await Promise.all([
        apiCall(`/api/clients/${currentUser.id}/transactions/`),
        apiCall(`/api/clients/${currentUser.id}/assets/`),
        apiCall(`/api/clients/${currentUser.id}/products/`),
        apiCall(`/api/clients/${currentUser.id}/positions/`),
      ]);
      
      setAllTransactions(transactionsResponse.transactions || []);
      // Extract assets from ClientAsset objects
      const clientAssets = (clientAssetsResponse as any)?.assets || [];
      const assetsList = clientAssets.map((ca: any) => {
        // Handle both structures: {asset: {...}} and direct asset object
        return ca.asset || ca;
      }).filter(Boolean);
      setAssets(assetsList);
      // Extract products from ClientProduct objects
      const clientProducts = (clientProductsResponse as any)?.products || [];
      const productsList = clientProducts.map((cp: any) => {
        // Handle both structures: {product: {...}} and direct product object
        return cp.product || cp;
      }).filter(Boolean);
      setProducts(productsList);
      setPositions((positionsResponse as any)?.positions || []);
      
      // Load verification config separately to avoid breaking the Promise.all if it fails
      try {
        // Add cache-busting timestamp to ensure fresh data
        const verificationConfigResponse = await apiCall(`/api/clients/${currentUser.id}/verification-config/?_t=${Date.now()}`);
        const config = (verificationConfigResponse as any)?.stepsConfig || {};
        setVerificationConfig(config);
        console.log('Loaded verification config for dashboard:', config);
        console.log('Step 3 (UI) maps to Step 8 (Config/KYC). Step 8 enabled?', config?.step_8?.enabled !== false);
        console.log('Step 8 (KYC) config object:', config?.step_8);
      } catch (error: any) {
        // Silently fail - config will default to all steps enabled
        console.log('Verification config not available, using defaults');
        setVerificationConfig({});
      }
    } catch (error: any) {
      // If it's a redirect error, don't log it - page is navigating away
      if (error?.isRedirecting) {
        return;
      }
      // If it's an authentication error, the redirect will happen in apiCall
      if (error?.status === 401 || error?.message?.includes('token') || error?.message?.includes('Authentication')) {
        // Redirect is handled in apiCall, just return early
        return;
      }
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNewsPosts = async () => {
    try {
      setNewsLoading(true);
      const newsResponse = await apiCall('/api/news/');
      setNewsPosts(newsResponse.news || []);
      setVisibleNewsCount(5);
    } catch (error: any) {
      console.error('Error loading news posts:', error);
      // If it's a 401 and we're on a public endpoint, try without auth
      if (error?.status === 401) {
        try {
          // Try fetching news without authentication (public endpoint)
          const apiUrl = getApiBaseUrl();
          const response = await fetch(`${apiUrl}/api/news/`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          if (response.ok) {
            const data = await response.json();
            setNewsPosts(data.news || []);
            setVisibleNewsCount(5);
            return;
          }
        } catch (fallbackError) {
          console.error('Fallback news fetch also failed:', fallbackError);
        }
      }
      // Set empty array on error
      setNewsPosts([]);
      setVisibleNewsCount(5);
    } finally {
      setNewsLoading(false);
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

  const formatAssetCurrency = (currencyRaw: any): string => {
    const c = (currencyRaw ?? '').toString().trim().toUpperCase();
    if (!c || c === 'EUR' || c === '€') return '€';
    return c;
  };

  useEffect(() => {
    if (currentUser && currentUser.id) {
      loadDashboardData();
      loadNewsPosts();
      
      // Refresh asset prices every 2 minutes (scheduler runs every 10 minutes)
      const priceRefreshInterval = setInterval(() => {
        loadDashboardData();
      }, 120000); // 2 minutes
      
      return () => {
        clearInterval(priceRefreshInterval);
      };
    }
  }, [currentUser]);

  // Parse financial values, handling strings, null, undefined, and ensuring they're numbers
  const parseFinancialValue = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Stats: align with "Mon Portefeuille" (PlatformPortfolio)
  const calculatedValues = React.useMemo(() => {
    let calculatedInvestedCapital = 0;
    let calculatedTradingPortfolio = 0;

    const completedTransactions = (allTransactions || []).filter((t: any) => t?.status === 'valide');

    for (const transaction of completedTransactions) {
      const amount = parseFinancialValue(transaction?.amount);
      switch (transaction?.type) {
        case 'depot':
          calculatedInvestedCapital += amount;
          break;
        case 'retrait':
          calculatedInvestedCapital -= amount;
          break;
        case 'bonus':
          calculatedInvestedCapital += amount;
          break;
        case 'interets':
          // Interest transactions credit gains to cash balance
          calculatedInvestedCapital += amount;
          break;
        case 'achat':
          calculatedTradingPortfolio += amount;
          break;
        case 'vente':
          calculatedTradingPortfolio -= amount;
          break;
        case 'transfert': {
          const transferTo = transaction?.to || transaction?.to_field || transaction?.transfer_to || null;
          const hasProductId = Boolean(transaction?.productId);
          if (transferTo && transferTo !== 'balance') {
            // balance -> product
            calculatedTradingPortfolio += amount;
          } else if (transferTo === 'balance') {
            // product -> balance
            calculatedTradingPortfolio -= amount;
          } else if (hasProductId) {
            // Fallback: assume subscription (balance -> product)
            calculatedTradingPortfolio += amount;
          }
          break;
        }
        default:
          break;
      }
    }

    return {
      investedCapital: calculatedInvestedCapital,
      tradingPortfolio: Math.max(0, calculatedTradingPortfolio),
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
    // 1. Les transactions (interets, frais, perte) - pas de calculatedValues ici car pas de transactions chargées
    // 2. Les positions de trading ouvertes (open) et fermées (done), excluant les positions pending
    
    // Commencer avec 0 (pas de calculatedValues dans Dashboard)
    let total = 0;
    
    // Créer un map des actifs pour accès rapide
    const assetsMap = new Map<string, any>();
    for (const a of assets || []) {
      const id = a?.id != null ? String(a.id) : '';
      if (id) assetsMap.set(id, a);
    }
    
    // Ajouter le profit/loss des positions de trading
    for (const p of positions || []) {
      // Inclure uniquement les positions ouvertes (open) et fermées (done)
      // Exclure toutes les positions pending
      if (p?.status === 'pending') continue;
      // Inclure seulement open, done, et cancelled (si elles ont un profit_loss)
      if (p?.status !== 'open' && p?.status !== 'done' && p?.status !== 'cancelled') continue;

      const profitLossNum =
        p?.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
      const investedNum = typeof p?.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
      const expectedTotalNum =
        p?.expected_total == null ? null : typeof p.expected_total === 'string' ? parseFloat(p.expected_total) : Number(p.expected_total);
      
      // Récupérer la devise de l'actif et le taux de change
      const assetId = p?.assetId || p?.asset_id || p?.asset?.id || null;
      const asset = assetId ? assetsMap.get(String(assetId)) : null;
      const assetCurrency = (p?.assetCurrency || p?.asset_currency || p?.asset?.currency || asset?.currency || 'EUR').trim().toUpperCase();
      const fxNum =
        p?.fx_rate_eur_to_asset == null
          ? null
          : typeof p.fx_rate_eur_to_asset === 'string'
            ? parseFloat(p.fx_rate_eur_to_asset)
            : Number(p.fx_rate_eur_to_asset);
      const fxRate = fxNum != null && Number.isFinite(fxNum) && fxNum > 0 ? fxNum : null;

      let positionPnl = 0;
      if (profitLossNum != null && Number.isFinite(profitLossNum)) {
        // Si le profit_loss est dans une devise différente de EUR, convertir en EUR
        if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
          // profit_loss est en devise de l'actif, convertir en EUR: EUR = asset_ccy / fx_rate_eur_to_asset
          positionPnl = profitLossNum / fxRate;
        } else {
          // Déjà en EUR ou pas de taux de change disponible
          positionPnl = profitLossNum;
        }
      } else if (p?.status === 'done' && expectedTotalNum != null && Number.isFinite(expectedTotalNum) && Number.isFinite(investedNum)) {
        // Calculer le P&L à partir de expected_total et invested_amount
        // Ces valeurs sont déjà en EUR (invested_amount est toujours en EUR)
        positionPnl = expectedTotalNum - investedNum;
      } else if (p?.status === 'open' && assetId && asset) {
        // Pour les positions ouvertes sans profit_loss stocké, calculer en temps réel
        const entryPriceNum = p?.entry_price == null ? null : typeof p.entry_price === 'string' ? parseFloat(p.entry_price) : Number(p.entry_price);
        const qtyNum = p?.quantity == null ? null : typeof p.quantity === 'string' ? parseFloat(p.quantity) : Number(p.quantity);
        const investedAssetNum =
          p?.invested_amount_asset_currency == null
            ? null
            : typeof p.invested_amount_asset_currency === 'string'
              ? parseFloat(p.invested_amount_asset_currency)
              : Number(p.invested_amount_asset_currency);
        
        const entryPrice = entryPriceNum != null && Number.isFinite(entryPriceNum) && entryPriceNum > 0 ? entryPriceNum : null;
        const qty = qtyNum != null && Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 0;
        const investedAsset = investedAssetNum != null && Number.isFinite(investedAssetNum) && investedAssetNum > 0 ? investedAssetNum : null;
        
        // Prix actuel de l'actif
        const currentPriceRaw = asset?.lastPrice ?? asset?.price ?? null;
        const currentPriceNum =
          currentPriceRaw == null ? null : typeof currentPriceRaw === 'string' ? parseFloat(currentPriceRaw) : Number(currentPriceRaw);
        const currentPrice = currentPriceNum != null && Number.isFinite(currentPriceNum) ? currentPriceNum : null;
        
        if (currentPrice != null && qty > 0) {
          // Calculer le P&L en devise de l'actif
          let pnlAsset = 0;
          if (investedAsset != null && investedAsset > 0) {
            // Utiliser invested_amount_asset_currency si disponible
            const marketValue = qty * currentPrice;
            pnlAsset = marketValue - investedAsset;
          } else if (entryPrice != null && entryPrice > 0) {
            // Sinon utiliser entry_price
            const marketValue = qty * currentPrice;
            const costBasis = qty * entryPrice;
            pnlAsset = marketValue - costBasis;
          }
          
          // Convertir en EUR si nécessaire
          if (assetCurrency !== 'EUR' && fxRate != null && fxRate > 0) {
            positionPnl = pnlAsset / fxRate;
          } else {
            positionPnl = pnlAsset;
          }
        }
      }

      total += Number.isFinite(positionPnl) ? positionPnl : 0;
    }
    return total;
  }, [positions, assets]);

  const availableFunds = React.useMemo(() => investedCapital - tradingPortfolio, [investedCapital, tradingPortfolio]);

  // Répartition du portefeuille: se baser sur les TRANSACTIONS + inclure la BALANCE (liquidités disponibles)
  const allocationByType = React.useMemo(() => {
    const completedTransactions = (allTransactions || []).filter((t: any) => t?.status === 'valide');

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

      // Transfer direction fields can come from several aliases (serializer exposes from/to and from_field/to_field)
      const to = t?.to ?? t?.to_field ?? t?.transfer_to ?? t?.transferTo ?? null;
      const from = t?.from ?? t?.from_field ?? t?.transfer_from ?? t?.transferFrom ?? null;

      // What counts for "portfolio allocation" is the product/asset side, not deposits/withdrawals.
      // - transfert: balance → product (invest) / product → balance (withdraw)
      // - achat / investissement: invest
      // - vente: disinvest (if resolvable)
      let delta = 0;
      let typeLabel: string | null = null;

      if (t?.type === 'transfert') {
        if (to && String(to) !== 'balance') {
          // balance -> product
          delta = amount;
          typeLabel = resolveTypeLabel(t, to);
        } else if (to && String(to) === 'balance') {
          // product -> balance
          const productId = from && String(from) !== 'balance' ? from : t?.productId || null;
          delta = -amount;
          typeLabel = resolveTypeLabel(t, productId);
        } else {
          // Best-effort fallback: treat as investment into linked product
          delta = amount;
          typeLabel = resolveTypeLabel(t);
        }
      } else if (t?.type === 'achat') {
        delta = amount;
        typeLabel = resolveTypeLabel(t);
      } else if (t?.type === 'vente') {
        delta = -amount;
        typeLabel = resolveTypeLabel(t);
      } else {
        continue;
      }

      const key = String(typeLabel || 'Autre');
      totals.set(key, (totals.get(key) || 0) + delta);
    }

    // Ajouter la balance (fonds disponibles)
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
  const isProfit = profitLoss >= 0;

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
    if (verificationConfig && verificationConfig[stepKey] !== undefined) {
      const stepConfig = verificationConfig[stepKey];
      if (stepConfig && typeof stepConfig === 'object' && stepConfig.enabled === false) {
        return false;
      }
      return true;
    }
    return true; // Default to enabled
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
  
  const verificationStepperSteps = [
    { id: 1 as const, label: 'Inscription', enabled: isStepEnabled(1), completed: isStep1Completed },
    { id: 2 as const, label: 'Verification', enabled: isStepEnabled(2), completed: isStep2Completed },
    { id: 3 as const, label: 'Investir', enabled: isStepEnabled(3), completed: isStep3Completed },
  ].filter((s) => s.enabled);

  const currentVerificationStepId =
    verificationStepperSteps.find((s) => !s.completed)?.id ?? null;

  const roundedCardStyle: React.CSSProperties = { borderRadius: '10px', overflow: 'hidden' };

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
    <div style={{ padding: isMobile ? '16px' : '20px 20px' }}>

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {/* Account Verification Steps */}
          {hasIncompleteEnabledSteps && (
            <Card
              style={{
                marginBottom: isMobile ? '20px' : '30px',
                borderRadius: 16,
                overflow: 'hidden',
                border: '1px solid rgba(229, 231, 235, 1)',
                backgroundColor: '#ffffff',
                boxShadow: '0 10px 30px rgba(2, 6, 23, 0.06)',
              }}
            >
              <CardContent style={{ padding: isMobile ? '18px' : '24px' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'stretch' : 'center',
                    justifyContent: 'space-between',
                    gap: isMobile ? 16 : 24,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div
                        aria-hidden="true"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 12,
                          background: 'color-mix(in srgb, #10b981 14%, transparent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid color-mix(in srgb, #10b981 22%, transparent)',
                          flexShrink: 0,
                        }}
                      >
                        <Shield className="h-4 w-4" style={{ color: '#10b981' }} />
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {verificationStepperSteps.filter((s) => s.completed).length}/{verificationStepperSteps.length} étapes complétées
                      </div>
                    </div>

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
                        marginBottom: 14,
                        lineHeight: '1.55',
                      }}
                    >
                      La vérification de votre identité aide à empêcher quelqu’un d’autre de créer un compte en votre nom.
                    </p>

                    <Button
                      onClick={() => {
                        navigate('/platform/verification');
                      }}
                      variant="platform"
                      style={{
                        width: isMobile ? '100%' : 'auto',
                        ['--platform-button-bg' as any]: '#10b981',
                      }}
                    >
                      Vérifier votre compte
                    </Button>
                  </div>

                  {/* Stepper (hide when there is only 1 enabled step) */}
                  {verificationStepperSteps.length > 1 && (
                    <div
                      style={{
                        flexShrink: 0,
                        minWidth: isMobile ? '100%' : 320,
                        maxWidth: isMobile ? '100%' : 360,
                      }}
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
                                  {s.completed ? <Check className="h-4 w-4" /> : <span style={{ fontSize: 14 }}>{s.id}</span>}
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
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr',
            gap: isMobile ? '16px' : '20px',
            marginBottom: isMobile ? '20px' : '30px' 
          }}>
            <Card style={roundedCardStyle}>
              <CardHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CardTitle style={{ fontSize: isMobile ? '18px' : '20px' }}>
                    Valeur du Portefeuille
                  </CardTitle>
                  <PieChart className={isMobile ? "h-3 w-3 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ fontSize: isMobile ? '22px' : '28px' }}>
                  {portfolioValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </div>
                <div style={{ marginTop: 6, fontSize: isMobile ? '12px' : '13px', color: isProfit ? '#10b981' : '#ef4444' }}>
                  {isProfit ? '+' : ''}{profitLoss.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
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

          {/* News Feed and Market Movers */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', 
            gap: isMobile ? '20px' : '30px' 
          }}>
            {/* News Feed */}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '20px' }}>
                    {newsPosts.slice(0, visibleNewsCount).map((post: any) => (
                      <div
                        key={post.id}
                        style={{
                          padding: isMobile ? '14px' : '16px',
                          border: '1px solid rgba(229, 231, 235, 1)',
                          borderRadius: 16,
                          backgroundColor: 'white',
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          alignItems: 'stretch',
                          gap: isMobile ? 12 : 16,
                          boxShadow: '0 10px 26px rgba(2, 6, 23, 0.04)',
                          transition: 'transform 160ms ease, box-shadow 160ms ease',
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
                              width: isMobile ? '100%' : 140,
                              height: isMobile ? 160 : 96,
                              borderRadius: 14,
                              overflow: 'hidden',
                              background: 'rgba(2, 6, 23, 0.06)',
                              flexShrink: 0,
                            }}
                          >
                            <img
                              src={post.imageUrl}
                              alt={post.title}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                              loading="lazy"
                            />
                          </div>
                        ) : null}

                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                              {post.category ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#111827',
                                    background: 'rgba(2, 6, 23, 0.06)',
                                    border: '1px solid rgba(2, 6, 23, 0.10)',
                                    padding: '4px 8px',
                                    borderRadius: 9999,
                                    lineHeight: 1,
                                  }}
                                >
                                  {String(post.category).toUpperCase()}
                                </span>
                              ) : null}

                              <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                {new Date(post.createdAt).toLocaleDateString('fr-FR', {
                                  day: '2-digit',
                                  month: 'long',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>

                            {post.articleUrl ? (
                              <button
                                type="button"
                                className="platform-hoverable"
                                onClick={() => window.open(post.articleUrl, '_blank', 'noopener,noreferrer')}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  padding: '6px 8px',
                                  borderRadius: 12,
                                  cursor: 'pointer',
                                  color: '#111827',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Lire
                              </button>
                            ) : null}
                          </div>

                          <h3
                            style={{
                              fontSize: isMobile ? '16px' : '18px',
                              fontWeight: 800,
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
                                lineHeight: 1.55,
                                whiteSpace: 'pre-wrap',
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: isMobile ? 3 : 2,
                                overflow: 'hidden',
                              } as any
                            }
                          >
                            {post.content}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              marginTop: 'auto',
                            }}
                          >
                            <div style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              Par {post.sourceName || getWebsiteNameFromUrl(post.articleUrl) || 'Admin'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {newsPosts.length > visibleNewsCount && (
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="platform-hoverable"
                          onClick={() => setVisibleNewsCount((c) => c + 5)}
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
                          }}
                        >
                          Voir plus
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gainers and Losers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '20px' }}>
              {/* Plus fortes hausses */}
              <Card className="platform-moversCard">
                <div className="platform-moversHeader">
                  <TrendingUp className={`platform-moversIcon platform-moversIcon--up ${isMobile ? 'h-4 w-4' : 'h-4 w-4'}`} />
                  <div className="platform-moversTitle">PLUS FORTES HAUSSES</div>
                </div>
                <CardContent className="platform-moversContent">
                  {gainers.length === 0 ? (
                    <div className="platform-moversEmpty">Aucune donnée disponible</div>
                  ) : (
                    <div className="platform-moversList">
                      {gainers.map((asset: any) => (
                        <MarketMoverRow key={asset.id} asset={asset} direction="up" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Plus fortes baisses */}
              <Card className="platform-moversCard">
                <div className="platform-moversHeader">
                  <TrendingDown className={`platform-moversIcon platform-moversIcon--down ${isMobile ? 'h-4 w-4' : 'h-4 w-4'}`} />
                  <div className="platform-moversTitle">PLUS FORTES BAISSES</div>
                </div>
                <CardContent className="platform-moversContent">
                  {losers.length === 0 ? (
                    <div className="platform-moversEmpty">Aucune donnée disponible</div>
                  ) : (
                    <div className="platform-moversList">
                      {losers.map((asset: any) => (
                        <MarketMoverRow key={asset.id} asset={asset} direction="down" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
