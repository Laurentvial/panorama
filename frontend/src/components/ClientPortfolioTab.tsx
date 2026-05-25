import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Wallet, TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import { ClientWallet } from './ClientWallet';
import { apiCall } from '../utils/api';
import { formatAmount } from '../utils/currency';
import { CurrencyIcon } from './CurrencyIcon';

interface ClientPortfolioTabProps {
  client: any;
  clientId?: string;
  onRefresh?: () => void;
}

export function ClientPortfolioTab({ client, clientId, onRefresh }: ClientPortfolioTabProps) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
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
  }, [clientId]);

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
  }, [clientId]);

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
        case 'transfert':
          // Simplified logic: only check transfer_to (to_field)
          // If transfer_to = product ID → investment (solde → product)
          // If transfer_to = 'solde' → withdrawal (product → solde)
          const transferTo = transaction.to || transaction.to_field || transaction.transfer_to || null;
          const hasProductId = transaction.productId || null;
          
          // If transfer_to is a product ID (not 'solde'), it's an investment
          if (transferTo && transferTo !== 'solde') {
            // Investment: solde → product
            calculatedTotalInvesti += amount;
            calculatedTradingPortfolio += amount;
            // Don't affect profit/loss - investments start at 0 profit/loss
            // Profit/loss will only change when position values change (future feature)
          } else if (transferTo === 'solde') {
            // Withdrawal: product → solde
            // When status is 'valide', subtract from totalInvesti (capital returned from terminated product)
            calculatedTotalInvesti -= amount;
            calculatedTradingPortfolio -= amount;
            // Note: Withdrawal profit/loss will be calculated based on position values when that feature is implemented
            // For now, we don't adjust profit/loss for withdrawals since we don't track position values
          } else if (hasProductId) {
            // Fallback: If transaction has productId but no transfer_to, assume it's a subscription (solde → product)
            calculatedTotalInvesti += amount;
            calculatedTradingPortfolio += amount;
            // Don't affect profit/loss - investments start at 0 profit/loss
            // Profit/loss will only change when position values change (future feature)
          }
          // Other cases don't affect calculations
          break;
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
    
    // Commencer avec le profit/loss des transactions
    let total = hasCompletedTransactions ? calculatedValues.profitLoss : 0;
    
    // Ajouter le profit/loss des positions de trading
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

      total += Number.isFinite(positionPnl) ? positionPnl : 0;
    }
    return total;
  }, [positions, calculatedValues, hasCompletedTransactions]);
  
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
  
  // Valeur du Portefeuille = Liquidité disponible + Valeur investie (tradingPortfolio) + Bénéfice/Perte
  const portfolioValue = useMemo(
    () => Math.max(0, availableFunds) + tradingPortfolio + profitLoss,
    [availableFunds, tradingPortfolio, profitLoss]
  );

  const accountCurrency = (client?.accountCurrency || client?.account_currency || 'EUR').toString().trim().toUpperCase();
  const formatCurrency = (amount: number) => formatAmount(amount, accountCurrency);

  return (
    <div className="space-y-6">
      {/* Header with Add Product Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Portefeuille</h2>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bénéfices / Perte</CardTitle>
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
          </CardContent>
        </Card>
      </div>

      {/* Wallet Details */}
      <ClientWallet client={client} transactions={transactions} positions={positions} />
    </div>
  );
}
