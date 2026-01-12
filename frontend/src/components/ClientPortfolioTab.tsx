import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PieChart, Plus } from 'lucide-react';
import { ClientWallet } from './ClientWallet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';

interface ClientPortfolioTabProps {
  client: any;
  clientId?: string;
  onRefresh?: () => void;
}

export function ClientPortfolioTab({ client, clientId, onRefresh }: ClientPortfolioTabProps) {
  const [loading, setLoading] = useState(false);
  
  // Get wallet data from client object
  const investedCapital = client?.investedCapital || client?.invested_capital || 0;
  const tradingPortfolio = client?.tradingPortfolio || client?.trading_portfolio || 0;
  const bonus = client?.bonus || 0;
  
  // Calculate available funds
  const availableFunds = investedCapital - tradingPortfolio - bonus;
  
  // Calculate profit/loss from transactions (simplified - you might want to fetch actual transactions)
  const profitLoss = 0; // This could be calculated from transactions if needed
  
  const portfolioValue = tradingPortfolio + profitLoss;

  // Product types available
  const productTypes = [
    { value: 'epargne_sur_mesure', label: 'Epargne sur mesure' },
    { value: 'epargne_bourse_crypto', label: 'Epargne Bourse / Crypto' },
    { value: 'action', label: 'Action' },
    { value: 'crypto_monnaie', label: 'Crypto Monnaie' },
    { value: 'etf', label: 'Etf' },
    { value: 'matiere_premiere', label: 'Matiere premiere' },
  ];

  async function handleAddProduct(productType: string) {
    if (!clientId) {
      toast.error('ID client manquant');
      return;
    }

    setLoading(true);
    try {
      // First, get available assets of this type
      const assetsResponse = await apiCall('/api/assets/');
      const allAssets = assetsResponse?.assets || [];
      
      // Filter assets by type (matching the product type)
      const typeMapping: { [key: string]: string[] } = {
        'epargne_sur_mesure': ['epargne', 'savings'],
        'epargne_bourse_crypto': ['epargne', 'bourse', 'crypto'],
        'action': ['action', 'stock', 'actions'],
        'crypto_monnaie': ['crypto', 'cryptomonnaie', 'cryptocurrency'],
        'etf': ['etf'],
        'matiere_premiere': ['matiere', 'commodity', 'commodities'],
      };

      const matchingTypes = typeMapping[productType] || [];
      const filteredAssets = allAssets.filter((asset: any) => 
        matchingTypes.some(type => 
          asset.type?.toLowerCase().includes(type.toLowerCase()) ||
          asset.category?.toLowerCase().includes(type.toLowerCase())
        )
      );

      if (filteredAssets.length === 0) {
        toast.info(`Aucun produit de type "${productTypes.find(p => p.value === productType)?.label}" disponible pour le moment`);
        return;
      }

      // For now, add the first matching asset
      // In a real scenario, you might want to show a dialog to select a specific asset
      const assetToAdd = filteredAssets[0];
      
      await apiCall(`/api/clients/${clientId}/assets/add/`, {
        method: 'POST',
        body: JSON.stringify({ assetId: assetToAdd.id }),
      });

      toast.success(`Produit "${productTypes.find(p => p.value === productType)?.label}" ajouté au portefeuille`);
      
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error('Error adding product:', error);
      toast.error(error?.message || `Erreur lors de l'ajout du produit`);
    } finally {
      setLoading(false);
    }
  }

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
        {clientId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={loading}>
                <Plus className="w-4 h-4 mr-2" />
                {loading ? 'Ajout...' : 'Ajouter un produit'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {productTypes.map((product) => (
                <DropdownMenuItem
                  key={product.value}
                  onClick={() => handleAddProduct(product.value)}
                  className="cursor-pointer"
                >
                  {product.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
              {formatCurrency(investedCapital)}
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
      <ClientWallet client={client} />
    </div>
  );
}
