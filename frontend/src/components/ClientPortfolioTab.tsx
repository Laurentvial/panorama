import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';
import { ClientWallet } from './ClientWallet';
import { apiCall } from '../utils/api';

interface ClientPortfolioTabProps {
  client: any;
  clientId?: string;
  transactions?: any[];
  onRefresh?: () => void;
}

export function ClientPortfolioTab({ client, clientId, transactions = [], onRefresh }: ClientPortfolioTabProps) {
  const [positions, setPositions] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);

  useEffect(() => {
    async function loadPositions() {
      if (!clientId) {
        setPositions([]);
        return;
      }
      try {
        // open + closed (done) only
        const data = await apiCall(`/api/clients/${clientId}/positions/?status=open,done`);
        setPositions((data as any)?.positions || []);
      } catch (error) {
        console.error('Error loading client positions for portfolio:', error);
        setPositions([]);
      }
    }
    loadPositions();
  }, [clientId]);

  useEffect(() => {
    async function loadAssets() {
      try {
        const assetsResponse = await apiCall('/api/assets/').catch(() => ({ assets: [] }));
        setAssets((assetsResponse as any)?.assets || []);
      } catch (error) {
        console.error('Error loading assets:', error);
        setAssets([]);
      }
    }
    loadAssets();
  }, []);

  // Calculate values from transactions
  const calculateValuesFromTransactions = () => {
    let calculatedInvestedCapital = 0;
    let calculatedTradingPortfolio = 0;
    let calculatedBonus = 0;
    let calculatedProfitLoss = 0;
    let calculatedTotalInvesti = 0; // achat + transfert (balance → product) - transfert (product → balance) when status is 'termine'

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
            // When status is 'termine', subtract from totalInvesti (capital returned from terminated product)
            calculatedTotalInvesti -= amount;
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
  
  const assetsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of assets || []) {
      const id = a?.id != null ? String(a.id) : '';
      if (id) map.set(id, a);
    }
    return map;
  }, [assets]);

  const profitLoss = useMemo(() => {
    // Profit/Loss basé sur:
    // 1. Les transactions (interets, frais, perte)
    // 2. Les positions de trading ouvertes (open) et fermées (done), excluant les positions pending
    
    // Commencer avec le profit/loss des transactions
    let total = hasCompletedTransactions ? calculatedValues.profitLoss : 0;
    
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
      const asset = assetId ? assetsById.get(String(assetId)) : null;
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
  }, [positions, calculatedValues, hasCompletedTransactions, assetsById]);
  
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
            <p className="text-xs text-muted-foreground mt-1">Capital total investi (achat + transfert balance→produit - transfert produit→balance terminé)</p>
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
