import React, { useMemo } from 'react';
import { Card, CardContent } from './ui/card';
import { Label } from './ui/label';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ClientWalletProps {
  client: any;
  transactions?: any[];
  positions?: any[];
}

export function ClientWallet({ client, transactions = [], positions = [] }: ClientWalletProps) {
  // Calculate current profitLoss from positions
  const currentProfitLoss = useMemo(() => {
    let total = 0;
    for (const p of positions || []) {
      if (p?.status !== 'open' && p?.status !== 'done') continue;

      const profitLossNum =
        p?.profit_loss == null ? null : typeof p.profit_loss === 'string' ? parseFloat(p.profit_loss) : Number(p.profit_loss);
      const investedNum = typeof p?.invested_amount === 'string' ? parseFloat(p.invested_amount) : Number(p.invested_amount);
      const expectedTotalNum =
        p?.expected_total == null ? null : typeof p.expected_total === 'string' ? parseFloat(p.expected_total) : Number(p.expected_total);
      
      // Récupérer la devise de l'actif et le taux de change
      const assetCurrency = (p?.assetCurrency || p?.asset_currency || p?.asset?.currency || 'EUR').trim().toUpperCase();
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
      }

      total += Number.isFinite(positionPnl) ? positionPnl : 0;
    }
    return total;
  }, [positions]);

  // Calculate wallet evolution from transactions
  const evolutionData = useMemo(() => {
    // Only consider completed transactions
    const completedTransactions = (transactions || []).filter((t: any) => t?.status === 'termine');
    
    if (completedTransactions.length === 0) {
      return [];
    }

    // Sort transactions by date
    const sortedTransactions = [...completedTransactions].sort(
      (a: any, b: any) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );

    // Calculate cumulative wallet value over time
    let runningInvestedCapital = 0;
    let runningTradingPortfolio = 0;
    let runningBonus = 0;
    let runningProfitLoss = 0;

    const dateMap = new Map<string, number>();

    sortedTransactions.forEach((transaction: any) => {
      const amountNum = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : Number(transaction.amount);
      const amount = Number.isFinite(amountNum) ? amountNum : 0;

      // Update running totals based on transaction type
      switch (transaction.type) {
        case 'depot':
          runningInvestedCapital += amount;
          break;
        case 'retrait':
          runningInvestedCapital -= amount;
          break;
        case 'bonus':
          runningBonus += amount;
          runningInvestedCapital += amount;
          break;
        case 'achat':
          runningTradingPortfolio += amount;
          break;
        case 'vente':
          runningTradingPortfolio -= amount;
          break;
        case 'interets':
          runningProfitLoss += amount;
          break;
        case 'frais':
        case 'perte':
          runningProfitLoss -= amount;
          break;
        case 'transfert': {
          const transferTo = transaction.to || transaction.to_field || transaction.transfer_to || null;
          if (transferTo && transferTo !== 'balance') {
            runningTradingPortfolio += amount;
          } else if (transferTo === 'balance') {
            runningTradingPortfolio -= amount;
          } else if (transaction.productId) {
            runningTradingPortfolio += amount;
          }
          break;
        }
      }

      // Calculate wallet value at this point: availableFunds + tradingPortfolio + profitLoss
      const availableFunds = runningInvestedCapital - runningTradingPortfolio;
      const walletValue = Math.max(0, availableFunds) + runningTradingPortfolio + runningProfitLoss;

      // Use date as key (format: YYYY-MM-DD)
      const transactionDate = new Date(transaction.datetime);
      const dateKey = transactionDate.toISOString().split('T')[0];
      
      // Store the latest value for each date
      dateMap.set(dateKey, walletValue);
    });

    // Convert map to array and sort by date
    const data = Array.from(dateMap.entries())
      .map(([dateKey, value]) => {
        const date = new Date(dateKey);
        return {
          date: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
          value: value,
          fullDate: dateKey
        };
      })
      .sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime())
      .map(({ date, value }) => ({ date, value }));

    // If we have data, add current value as last point (including current profitLoss from positions)
    if (data.length > 0) {
      const lastTransactionDate = Array.from(dateMap.keys()).sort().pop();
      if (lastTransactionDate) {
        const lastDate = new Date(lastTransactionDate);
        const today = new Date();
        
        // Calculate current wallet value
        const lastRunningInvestedCapital = runningInvestedCapital;
        const lastRunningTradingPortfolio = runningTradingPortfolio;
        const lastAvailableFunds = lastRunningInvestedCapital - lastRunningTradingPortfolio;
        const currentWalletValue = Math.max(0, lastAvailableFunds) + lastRunningTradingPortfolio + currentProfitLoss;
        
        // Only add today's point if it's different from the last transaction date
        const lastDateKey = lastDate.toISOString().split('T')[0];
        const todayKey = today.toISOString().split('T')[0];
        
        if (lastDateKey !== todayKey) {
          data.push({
            date: today.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
            value: currentWalletValue
          });
        } else {
          // Update last point with current profitLoss
          if (data.length > 0) {
            data[data.length - 1].value = currentWalletValue;
          }
        }
      }
    }

    return data;
  }, [transactions, currentProfitLoss]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  return (
    <Card>
      <CardContent>
        {/* Evolution Chart */}
        <div>
          <Label className="text-slate-700 font-semibold mb-4 block">
            Évolution au cours du temps
          </Label>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={evolutionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="date" 
                stroke="#64748b"
                fontSize={12}
              />
              <YAxis 
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '8px'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
                name="Valeur du wallet"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

