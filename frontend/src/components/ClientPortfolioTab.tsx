import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';
import { ClientWallet } from './ClientWallet';

interface ClientPortfolioTabProps {
  client: any;
  clientId?: string;
  transactions?: any[];
  onRefresh?: () => void;
}

export function ClientPortfolioTab({ client, clientId, transactions = [], onRefresh }: ClientPortfolioTabProps) {
  // Calculate values from transactions
  const calculateValuesFromTransactions = () => {
    let calculatedInvestedCapital = 0;
    let calculatedTradingPortfolio = 0;
    let calculatedBonus = 0;
    let calculatedProfitLoss = 0;
    let calculatedTotalInvesti = 0; // Only achat and transfert (balance → product)

    // Only consider completed transactions (status === 'termine')
    const completedTransactions = transactions.filter((transaction: any) => 
      transaction.status === 'termine'
    );

    completedTransactions.forEach((transaction: any) => {
      const amount = parseFloat(transaction.amount) || 0;
      
      switch (transaction.type) {
        case 'depot':
          // Deposits increase invested capital
          calculatedInvestedCapital += amount;
          break;
        case 'retrait':
          // Withdrawals decrease invested capital
          calculatedInvestedCapital -= amount;
          break;
        case 'bonus':
          // Bonus increases bonus and invested capital
          calculatedBonus += amount;
          calculatedInvestedCapital += amount;
          break;
        case 'achat':
        case 'investissement':
          // Purchases increase trading portfolio (money invested in assets)
          calculatedTradingPortfolio += amount;
          // Don't affect profit/loss - investments start at 0 profit/loss
          // Profit/loss will only change when position values change (future feature)
          // Count as investment for "Total Investi"
          calculatedTotalInvesti += amount;
          break;
        case 'vente':
          // Sales decrease trading portfolio (money withdrawn from assets)
          calculatedTradingPortfolio -= amount;
          // Note: Sales profit/loss will be calculated based on position values when that feature is implemented
          // For now, we don't adjust profit/loss for sales since we don't track cost basis
          break;
        case 'interets':
          // Interest increases profit
          calculatedProfitLoss += amount;
          break;
        case 'frais':
        case 'perte':
          // Fees and losses reduce profit
          calculatedProfitLoss -= amount;
          break;
        case 'transfert':
          // Simplified logic: only check transfer_to (to_field)
          // If transfer_to = product ID → investment (balance → product)
          // If transfer_to = 'balance' → withdrawal (product → balance)
          const transferTo = transaction.to || transaction.to_field || transaction.transfer_to || null;
          const hasProductId = transaction.productId || null;
          
          // If transfer_to is a product ID (not 'balance'), it's an investment
          if (transferTo && transferTo !== 'balance') {
            // Investment: balance → product
            calculatedTotalInvesti += amount;
            calculatedTradingPortfolio += amount;
            // Don't affect profit/loss - investments start at 0 profit/loss
            // Profit/loss will only change when position values change (future feature)
          } else if (transferTo === 'balance') {
            // Withdrawal: product → balance
            calculatedTradingPortfolio -= amount;
            // Note: Withdrawal profit/loss will be calculated based on position values when that feature is implemented
            // For now, we don't adjust profit/loss for withdrawals since we don't track position values
          } else if (hasProductId) {
            // Fallback: If transaction has productId but no transfer_to, assume it's a subscription (balance → product)
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
    transactions.some((t: any) => t.status === 'termine'),
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
  
  const profitLoss = useMemo(() => calculatedValues.profitLoss, [calculatedValues.profitLoss]);
  
  // Total Investi: only achat and transfert (balance → product)
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

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
            <CardTitle className="text-sm font-medium">Liquidités Disponibles</CardTitle>
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
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalInvesti)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Capital total investi (achat + transfert balance→produit)</p>
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
      <ClientWallet client={client} />
    </div>
  );
}
