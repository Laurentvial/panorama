import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Slider } from './ui/slider';
import { ChevronLeft, TrendingUp, TrendingDown, BarChart3, FileText, Newspaper, DollarSign, MoreHorizontal, Check, ExternalLink } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';
import { useIsMobile } from './ui/use-mobile';
import { StockChart } from './StockChart';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [data, setData] = useState<any>(null);
  const [dataType, setDataType] = useState<'asset' | 'product' | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'analysis' | 'news' | 'financials'>('overview');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1D' | '1W' | '1M' | '6M' | '1Y' | '3Y' | 'MAX'>('1W');
  const [showCGVModal, setShowCGVModal] = useState(false);
  const [showGainsModal, setShowGainsModal] = useState(false);
  const [showContractPreview, setShowContractPreview] = useState(false);
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
    const allOptions = ['Mensuel', 'Trimestriel', 'Semestriel', 'Annuel', 'Fin de contrat', 'Capitalisation des fonds'];
    
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
    if (!product || amount <= 0 || basePrice <= 0) return 0;
    
    // Parse duration (assuming format like "1 mois" or "12 mois")
    const durationMatch = product.duration?.match(/(\d+)/);
    const durationMonths = durationMatch ? parseInt(durationMatch[1]) : 1;
    
    // Get profitability rate (use average if variable)
    let profitabilityRate = 0;
    if (product.isVariableProfitability === 'Oui' && product.variableProfitability) {
      const min = parseFinancialValue(product.profitability);
      const max = parseFinancialValue(product.variableProfitability);
      profitabilityRate = (min + max) / 2; // Use average for calculation
    } else if (product.profitability !== null && product.profitability !== undefined) {
      profitabilityRate = parseFinancialValue(product.profitability);
    }
    
    // Calculate gains: basePrice * (profitabilityRate / 100) * durationMonths
    const gains = basePrice * (profitabilityRate / 100) * durationMonths;
    return gains;
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
      } else if (transaction.type === 'achat' || transaction.type === 'investissement') {
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
      // Calculate gains - use annual rate
      const durationMatch = productData.duration?.match(/(\d+)/);
      const durationMonths = durationMatch ? parseInt(durationMatch[1]) : 1;
      
      let profitabilityRate = 0;
      if (productData.isVariableProfitability === 'Oui' && productData.variableProfitability) {
        const min = parseFinancialValue(productData.profitability);
        const max = parseFinancialValue(productData.variableProfitability);
        profitabilityRate = (min + max) / 2; // Use average
      } else if (productData.profitability !== null && productData.profitability !== undefined) {
        profitabilityRate = parseFinancialValue(productData.profitability);
      }
      
      // Calculate gains: amount * (annualRate / 100) * (durationMonths / 12)
      const gains = amount * (profitabilityRate / 100) * (durationMonths / 12);
      const total = amount + gains;
      
      // Format profitability for display
      let profitabilityDisplay = 'N/A';
      if (productData.isVariableProfitability === 'Oui' && productData.variableProfitability) {
        const min = parseFinancialValue(productData.profitability);
        const max = parseFinancialValue(productData.variableProfitability);
        profitabilityDisplay = `${min.toFixed(2)} à ${max.toFixed(2)}%`;
      } else if (productData.profitability !== null && productData.profitability !== undefined) {
        const profit = parseFinancialValue(productData.profitability);
        profitabilityDisplay = `${profit.toFixed(2)}%`;
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
        description: `Transfert de Balance Cash vers ${productData.name}${productData.reference ? ` (${productData.reference})` : ''}. Montant: ${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR. Période d'intérêt: ${subscriptionData.interestPeriod || productData.interestPeriod || 'N/A'}. Date de fin de contrat: ${subscriptionData.contractEnd ? formatDateToFrench(subscriptionData.contractEnd) : 'N/A'}. Signature incluse.`,
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

    // Calculate contract end date
    const contractStartDate = subscriptionData.contractEnd ? parseDateString(subscriptionData.contractEnd) : new Date();
    const contractEndDate = contractStartDate ? new Date(contractStartDate) : new Date();
    contractEndDate.setMonth(contractEndDate.getMonth() + durationMonths);
    const contractEndDateStr = formatDateToFrench(contractEndDate.toISOString().split('T')[0]);

    // Calculate interest
    const profitabilityRate = productData.isVariableProfitability === 'Oui' && productData.variableProfitability
      ? (parseFinancialValue(productData.profitability) + parseFinancialValue(productData.variableProfitability)) / 2
      : parseFinancialValue(productData.profitability);
    const interestAmount = amount * (profitabilityRate / 100) * durationMonths;

    // Interest period
    const interestPeriod = subscriptionData.interestPeriod || productData.interestPeriod || 'Fin de contrat';

    // Auto-renewal
    const autoRenewal = productData.capitalisationFonds === 'Oui' ? 'OUI' : 'NON';

    // Min/Max investment
    const minInvestment = parseFinancialValue(productData.minEntryValue) || 0;
    const maxInvestment = parseFinancialValue(productData.maxEntryValue) || 0;

    const today = new Date();
    const todayStr = formatDateToFrench(today.toISOString().split('T')[0]);

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
    
    // Set defaults for slider if no limits
    const sliderMin = minInvestment > 0 ? minInvestment : 1000;
    const sliderMax = maxInvestment > 0 ? maxInvestment : 1000000;
    
    const basePriceNum = parseFinancialValue(simulatorBasePrice) || 0;
    const calculatedGains = calculateGains(product, simulatorAmount, basePriceNum);
    const total = basePriceNum + calculatedGains;

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
      <div style={{ 
        padding: isMobile ? '16px' : '20px',
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}>
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
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
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
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Investissement maximum</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {maxInvestment > 0 ? `${maxInvestment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR` : 'N/A'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Reconduction</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {product.capitalisationFonds === 'Oui' ? 'Oui' : 'Non'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Garantie contractuelle</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {product.noProfitability === 'Non' ? 'Oui' : 'Non'}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Indice de confiance</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      100/100
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
                  <Button 
                    variant="outline" 
                    style={{ fontSize: '14px' }}
                    onClick={() => setShowGainsModal(true)}
                  >
                    <BarChart3 className="h-4 w-4" style={{ marginRight: '8px' }} />
                    Récapitulatif des gains
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
                  {/* Amount Slider */}
                  <div>
                    <div style={{ 
                      position: 'relative', 
                      marginBottom: '8px',
                      paddingTop: '20px',
                    }}>
                      {/* Current value label above slider */}
                      <div style={{
                        position: 'absolute',
                        top: '0',
                        left: sliderMax > sliderMin 
                          ? `${Math.min(100, Math.max(0, ((simulatorAmount - sliderMin) / (sliderMax - sliderMin)) * 100))}%`
                          : '0%',
                        transform: 'translateX(-50%)',
                        backgroundColor: '#374151',
                        color: 'white',
                        padding: isMobile ? '3px 6px' : '4px 8px',
                        borderRadius: '4px',
                        fontSize: isMobile ? '11px' : '12px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        maxWidth: isMobile ? '80px' : 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        zIndex: 10,
                      }}>
                        {simulatorAmount.toLocaleString('fr-FR')} EUR
                      </div>
                    </div>
                    
                    <div style={{ 
                      width: '100%', 
                      padding: '16px 0', 
                      minHeight: '40px',
                      position: 'relative',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                    }}>
                      <style>{`
                        [data-slot="slider-track"] {
                          height: 8px !important;
                          background-color: #000000 !important;
                          border-radius: 9999px !important;
                        }
                        [data-slot="slider-range"] {
                          background-color: #10b981 !important;
                          height: 100% !important;
                          border-radius: 9999px !important;
                        }
                        [data-slot="slider-thumb"] {
                          width: 20px !important;
                          height: 20px !important;
                          background-color: white !important;
                          border: 3px solid #10b981 !important;
                          border-radius: 50% !important;
                          cursor: pointer !important;
                          box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
                          display: block !important;
                        }
                      `}</style>
                      <Slider
                        value={[simulatorAmount]}
                        min={sliderMin}
                        max={sliderMax}
                        step={1000}
                        onValueChange={(values) => {
                          const newValue = values[0];
                          setSimulatorAmount(newValue);
                          setSimulatorBasePrice(newValue.toString());
                        }}
                      />
                    </div>
                    
                    {/* Min and Max labels */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '8px',
                      fontSize: isMobile ? '11px' : '12px',
                      color: '#9ca3af',
                      flexWrap: 'wrap',
                      gap: isMobile ? '4px' : '0',
                    }}>
                      <span style={{ 
                        flex: isMobile ? '1 1 100%' : '0 1 auto',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: isMobile ? 'nowrap' : 'normal',
                      }}>{minInvestment > 0 ? `${minInvestment.toLocaleString('fr-FR')} EUR` : 'Aucune limite'}</span>
                      <span style={{ 
                        flex: isMobile ? '1 1 100%' : '0 1 auto',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: isMobile ? 'nowrap' : 'normal',
                        textAlign: isMobile ? 'left' : 'right',
                      }}>{maxInvestment > 0 ? `${maxInvestment.toLocaleString('fr-FR')} EUR` : 'Aucune limite'}</span>
                    </div>
                    
                    {/* Scale markers */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '4px',
                      fontSize: isMobile ? '10px' : '11px',
                      color: '#d1d5db',
                      flexWrap: isMobile ? 'wrap' : 'nowrap',
                      gap: isMobile ? '4px' : '0',
                      overflowX: isMobile ? 'auto' : 'visible',
                    }}>
                      <span style={{ flexShrink: 0 }}>{sliderMin.toLocaleString('fr-FR')}</span>
                      {!isMobile && (
                        <>
                          <span>{((sliderMin + sliderMax) / 4).toLocaleString('fr-FR')}</span>
                          <span>{((sliderMin + sliderMax) / 2).toLocaleString('fr-FR')}</span>
                          <span>{((sliderMin + sliderMax) * 3 / 4).toLocaleString('fr-FR')}</span>
                        </>
                      )}
                      <span style={{ flexShrink: 0 }}>{sliderMax.toLocaleString('fr-FR')}</span>
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
                    
                    {/* Prix de base */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: 'white',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                    }}>
                      <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>Prix de base</span>
                      <Input
                        type="number"
                        value={simulatorBasePrice}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSimulatorBasePrice(value);
                          const numValue = parseFloat(value) || 0;
                          // Only update slider if within limits (or no limits set)
                          const withinMin = minInvestment === 0 || numValue >= minInvestment;
                          const withinMax = maxInvestment === 0 || numValue <= maxInvestment;
                          if (withinMin && withinMax) {
                            setSimulatorAmount(numValue);
                          }
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
                  </div>
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
                  <div style={{ 
                    fontSize: isMobile ? '13px' : '14px', 
                    color: '#374151', 
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {product.description}
                  </div>
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
                    
                    <div>
                      <Label htmlFor="contractEnd">Fin de contrat</Label>
                      <Input
                        id="contractEnd"
                        value={subscriptionData.contractEnd || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Always update with the raw value user is typing - no formatting during typing
                          setSubscriptionData({ ...subscriptionData, contractEnd: value });
                        }}
                        onBlur={(e) => {
                          // When user finishes typing, try to convert to ISO format if complete
                          const value = e.target.value.trim();
                          if (!value) {
                            setSubscriptionData({ ...subscriptionData, contractEnd: '' });
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
                                setSubscriptionData({ ...subscriptionData, contractEnd: dateToISOString(date) });
                              } else {
                                // Invalid date, keep as-is
                                setSubscriptionData({ ...subscriptionData, contractEnd: value });
                              }
                            } else {
                              // Keep as-is if incomplete or invalid
                              setSubscriptionData({ ...subscriptionData, contractEnd: value });
                            }
                          } else {
                            // Not a complete date format, keep as-is
                            setSubscriptionData({ ...subscriptionData, contractEnd: value });
                          }
                        }}
                        placeholder="jj/mm/aaaa"
                      />
                    </div>
                    
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Prévisualisation du contrat</div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowContractPreview(true)}
                        style={{ width: '100%' }}
                      >
                        Voir le contrat
                      </Button>
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
                        backgroundColor: '#10b981',
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
        <Dialog open={showCGVModal} onOpenChange={setShowCGVModal}>
          <DialogContent style={{ 
            maxWidth: isMobile ? '95vw' : '800px', 
            maxHeight: '80vh', 
            overflow: 'auto', 
            zIndex: 9999,
            width: isMobile ? '95vw' : 'auto',
            margin: isMobile ? '16px' : 'auto',
          }}>
            <DialogHeader>
              <DialogTitle>Conditions Générales de Vente</DialogTitle>
              <DialogDescription>
                {product.name}
              </DialogDescription>
            </DialogHeader>
            <div style={{ 
              fontSize: '14px', 
              color: '#374151', 
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              marginTop: '20px',
            }}>
              {product.cgv || 'Aucune condition générale disponible pour ce produit.'}
            </div>
          </DialogContent>
        </Dialog>

        {/* Contract Preview Modal */}
        <Dialog open={showContractPreview} onOpenChange={setShowContractPreview}>
          <DialogContent style={{ 
            maxWidth: isMobile ? '95vw' : '900px', 
            maxHeight: '90vh', 
            overflow: 'auto', 
            zIndex: 9999,
            width: isMobile ? '95vw' : 'auto',
            margin: isMobile ? '16px' : 'auto',
          }}>
            {(() => {
              const contractData = generateContractPreview(product);
              if (!contractData) return <div>Chargement...</div>;

              return (
                <>
                  <DialogHeader>
                    <DialogTitle>Prévisualisation du contrat</DialogTitle>
                    <DialogDescription>
                      {contractData.productName}
                    </DialogDescription>
                  </DialogHeader>
                  <div style={{ 
                    fontFamily: 'Arial, sans-serif',
                    padding: isMobile ? '16px 0' : '20px 0',
                    color: '#374151',
                    lineHeight: '1.6',
                    marginTop: '20px',
                  }}>
                  {/* Header */}
                  <div style={{ marginBottom: '30px', textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '20px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>{contractData.productName}</div>
                    <div style={{ fontSize: '14px' }}>{contractData.companyName}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{contractData.companyAddress}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>{contractData.companyWebsite} - {contractData.companyEmail}</div>
                  </div>

                  {/* Parties */}
                  <div style={{ marginBottom: '30px' }}>
                    <p style={{ marginBottom: '15px', fontSize: '14px' }}>
                      La société : {contractData.companyName}<br />
                      Exerçant sous l'enseigne : {contractData.companyWebsite}<br />
                      Ayant son siège social : {contractData.companyAddress}<br />
                      Représentée à l'acte par son représentant légal domicilié en cette qualité au dit siège.<br />
                      Ci-après dénommée « LA SOCIÉTÉ » d'une part et,
                    </p>
                    <p style={{ marginBottom: '15px', fontSize: '14px' }}>
                      Nom : {contractData.investorName}<br />
                      Mail : {contractData.investorEmail}<br />
                      Tél : {contractData.investorPhone}<br />
                      Date de naissance : {contractData.investorBirthDate}<br />
                      Ci-après dénommée « L'INVESTISSEUR » d'autre part.
                    </p>
                    <p style={{ fontSize: '14px', fontStyle: 'italic' }}>
                      CI-APRÈS DÉSIGNÉES ENSEMBLE « LES PARTIES » ET INDIVIDUELLEMENT « LA PARTIE »
                    </p>
                    <p style={{ marginTop: '15px', fontSize: '14px' }}>
                      {contractData.companyName} est un groupe spécialisé dans l'investissement de produit financier.<br />
                      À cet égard, LA SOCIÉTÉ entend proposer à ses clients qui investissent, une garantie contractuelle de capital initial dans les conditions prévues ci-après.
                    </p>
                  </div>

                  {/* Object */}
                  <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>1/ OBJET DU PROTOCOLE</h3>
                    <p style={{ fontSize: '14px' }}>
                      a. Le protocole de garantie « {contractData.productName} » est une garantie contractuelle permettant au souscripteur de l'épargne de récupérer, à la fin du placement, le montant du versement effectué à la souscription ainsi que les intérêts.
                    </p>
                  </div>

                  {/* Duration */}
                  <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>2/ DURÉE DU CONTRAT</h3>
                    <p style={{ fontSize: '14px' }}>
                      a. Le présent contrat prend effet à compter du jour de la signature des présentes et ce pour une durée de :<br />
                      {contractData.durationMonths} {contractData.durationMonths > 1 ? 'mois' : 'mois'} avec une rentabilité garantie de {contractData.profitabilityText}.
                    </p>
                    <p style={{ fontSize: '14px' }}>
                      b. La date d'échéance est donc fixée au {contractData.contractEndDateStr}.
                    </p>
                    <p style={{ fontSize: '14px' }}>
                      c. Reconduction automatique du contrat : {contractData.autoRenewal}.
                    </p>
                  </div>

                  {/* Payment */}
                  <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>3/ MODALITÉS DE PAIEMENT</h3>
                    <p style={{ fontSize: '14px' }}>
                      a. LA SOCIÉTÉ reconnaîtra la validité du versement comptant et en consentira quittance régulière dès réception du versement.
                    </p>
                    <p style={{ fontSize: '14px' }}>
                      b. L'INVESTISSEUR percevra ses intérêts en « {contractData.interestPeriod} ».
                    </p>
                  </div>

                  {/* Summary */}
                  <div style={{ marginBottom: '30px', border: '1px solid #000', padding: '20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>RÉCAPITULATIF DE VOTRE SOUSCRIPTION</h3>
                    <div style={{ fontSize: '14px', marginBottom: '10px' }}>
                      <strong>TITRE</strong> {contractData.productName}
                    </div>
                    <div style={{ fontSize: '14px', marginBottom: '10px' }}>
                      <strong>DURÉE</strong> {contractData.duration}
                    </div>
                    <div style={{ fontSize: '14px', marginBottom: '10px' }}>
                      <strong>RENTABILITÉ</strong> {contractData.profitabilityText}
                    </div>
                    <div style={{ fontSize: '14px', marginBottom: '10px' }}>
                      <strong>TOTAL NET</strong> {contractData.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </div>
                    <div style={{ marginTop: '30px', fontSize: '14px' }}>
                      <strong>SIGNATURE DE L'INVESTISSEUR :</strong><br />
                      " Bon pour accord "<br />
                      " J'accepte les Termes et Conditions "
                    </div>
                    <div style={{ marginTop: '20px', fontSize: '14px' }}>
                      Fait le : {contractData.todayStr}<br />
                      À : {contractData.investorCity}
                    </div>
                  </div>

                  {/* Interest Table */}
                  <div style={{ marginBottom: '30px', border: '1px solid #000', padding: '20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>RÉCAPITULATIF DE VOTRE SOUSCRIPTION</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #000' }}>
                          <th style={{ padding: '10px', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Intérêts payés</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Performance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '10px' }}>{contractData.contractEndDateStr}</td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>{contractData.interestAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>{contractData.profitabilityRate.toFixed(2)} %</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Terms & Conditions */}
                  {contractData.cgv && (
                    <div style={{ marginBottom: '30px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>TERMES & CONDITIONS</h3>
                      <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: contractData.cgv.replace(/\n/g, '<br />') }} />
                    </div>
                  )}
                </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Gains Summary Modal */}
        <Dialog open={showGainsModal} onOpenChange={setShowGainsModal}>
          <DialogContent style={{ 
            maxWidth: isMobile ? '95vw' : '800px', 
            maxHeight: '80vh', 
            overflow: 'auto', 
            zIndex: 9999,
            width: isMobile ? '95vw' : 'auto',
            margin: isMobile ? '16px' : 'auto',
          }}>
            <DialogHeader>
              <DialogTitle>Récapitulatif des gains</DialogTitle>
              <DialogDescription>
                {product.name}
              </DialogDescription>
            </DialogHeader>
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Rentabilité</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#10b981' }}>
                    {formatProfitability(product)}
                  </div>
                </div>
                
                {product.duration && (
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Durée</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {product.duration} Mois
                    </div>
                  </div>
                )}
                
                {product.minEntryValue && (
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Investissement minimum</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {parseFinancialValue(product.minEntryValue).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                    </div>
                  </div>
                )}
                
                {product.maxEntryValue && (
                  <div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Investissement maximum</div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                      {parseFinancialValue(product.maxEntryValue).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                    </div>
                  </div>
                )}
                
                <div style={{ 
                  marginTop: '20px',
                  padding: '16px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                }}>
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                    Calcul des gains estimés
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    Les gains sont calculés sur la base de la rentabilité indiquée et peuvent varier selon les conditions du marché.
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
    <div style={{ padding: '20px 120px' }}>
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
                color: priceChangePercent >= 0 ? '#10b981' : '#ef4444' 
              }}>
                {price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ 
                fontSize: isMobile ? '12px' : '14px', 
                color: priceChangePercent >= 0 ? '#10b981' : '#ef4444' 
              }}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                {' '}({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
              </div>
            </div>
            
            <div style={{ 
              fontSize: isMobile ? '12px' : '14px', 
              color: '#6b7280'
            }}>
              Marché ouvert • PRIX PAR xxx, EN EUR
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button 
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              fontWeight: '600',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Trader
          </Button>
          <Button variant="outline" style={{ padding: '12px' }}>
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </div>

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
          { id: 'chart', label: 'Graphique', icon: TrendingUp },
          { id: 'analysis', label: 'Analyse', icon: FileText },
          { id: 'news', label: 'Actualités', icon: Newspaper },
          { id: 'financials', label: 'Finances', icon: DollarSign },
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
                borderBottom: isActive ? '2px solid #10b981' : '2px solid transparent',
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
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  flexWrap: isMobile ? 'wrap' : 'nowrap',
                  gap: isMobile ? '8px' : '0',
                }}>
                  <CardTitle style={{ fontSize: isMobile ? '16px' : '18px' }}>Performance</CardTitle>
                  <Button variant="outline" style={{ 
                    fontSize: isMobile ? '11px' : '12px', 
                    padding: isMobile ? '6px 10px' : '6px 12px',
                    flexShrink: 0,
                  }}>
                    {isMobile ? 'Vue complète' : 'Vue complète des fonds'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Stock Chart - Shows chart using Alpha Vantage/Finnhub data */}
                {asset.alpha_vantage_symbol || asset.alphaVantageSymbol ? (
                  <div style={{ marginBottom: '20px' }}>
                    <StockChart
                      assetId={asset.id}
                      assetName={asset.name || asset.reference}
                      width="100%"
                      height={isMobile ? 400 : 500}
                      chartType="area"
                      showVolume={false}
                      timeframe={selectedTimeframe}
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

                {/* Timeframe Selector */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  {['1D', '1W', '1M', '6M', '1Y', '3Y', 'MAX'].map((timeframe) => (
                    <button
                      key={timeframe}
                      onClick={() => setSelectedTimeframe(timeframe as any)}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        backgroundColor: selectedTimeframe === timeframe ? '#10b981' : 'white',
                        color: selectedTimeframe === timeframe ? 'white' : '#111827',
                        fontWeight: selectedTimeframe === timeframe ? '600' : '400',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      {timeframe}
                    </button>
                  ))}
                </div>

                {/* Performance Info */}
                <div style={{ fontSize: '18px', fontWeight: '600', color: priceChangePercent >= 0 ? '#10b981' : '#ef4444' }}>
                  {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}% Semaine passée
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'chart' && (
            <Card>
              <CardHeader>
                <CardTitle>Graphique</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>
                  Le graphique est disponible dans l'onglet "Vue d'ensemble" ci-dessus.
                </div>
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

          {activeTab === 'financials' && (
            <Card>
              <CardHeader>
                <CardTitle>Données financières</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ color: '#6b7280' }}>
                  Données financières détaillées à venir...
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '20px',
          position: 'sticky',
          top: isMobile ? '76px' : '88px',
          alignSelf: 'flex-start',
          maxHeight: isMobile ? 'calc(100vh - 60px)' : 'calc(100vh - 80px)',
          overflowY: 'visible',
        }}>
          {/* Why is it moving? */}
          <Card>
            <CardHeader>
              <CardTitle>Pourquoi {asset.reference || asset.name} bouge-t-il ?</CardTitle>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                Découvrez les facteurs qui influencent le prix de cet actif.
              </p>
              <Button 
                style={{
                  width: '100%',
                  backgroundColor: '#111827',
                  color: 'white',
                  fontWeight: '600',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                S'abonner au club
              </Button>
            </CardContent>
          </Card>

          {/* Additional Info Cards */}
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
