import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { PortfolioOverview } from './PortfolioOverview';
import { ProductCatalog } from './ProductCatalog';
import { ReportingClient } from './ReportingClient';
import { TrendingUp, Wallet, FileText, ShoppingBag } from 'lucide-react';

const mockPortfolio = {
  totalValue: 125430.50,
  dailyChange: 2.34,
  dailyChangeAmount: 2870.20,
  positions: [
    { id: 1, type: 'Action', name: 'Apple Inc.', symbol: 'AAPL', quantity: 50, avgPrice: 178.20, currentPrice: 185.40, value: 9270, change: 4.04 },
    { id: 2, type: 'Action', name: 'Microsoft Corp.', symbol: 'MSFT', quantity: 30, avgPrice: 340.50, currentPrice: 355.20, value: 10656, change: 4.32 },
    { id: 3, type: 'Crypto', name: 'Bitcoin', symbol: 'BTC', quantity: 0.5, avgPrice: 42000, currentPrice: 45500, value: 22750, change: 8.33 },
    { id: 4, type: 'Crypto', name: 'Ethereum', symbol: 'ETH', quantity: 5, avgPrice: 2800, currentPrice: 3100, value: 15500, change: 10.71 },
    { id: 5, type: 'Livret', name: 'Livret A+', symbol: 'LVA', quantity: 1, avgPrice: 50000, currentPrice: 50625, value: 50625, change: 1.25 },
    { id: 6, type: 'Action', name: 'Tesla Inc.', symbol: 'TSLA', quantity: 20, avgPrice: 245.30, currentPrice: 258.75, value: 5175, change: 5.48 },
  ],
};

export function DashboardClient() {
  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Valeur totale</CardTitle>
            <Wallet className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">{mockPortfolio.totalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
            <p className="text-xs text-slate-500 mt-1">
              <span className="text-green-600">+{mockPortfolio.dailyChange}%</span> aujourd'hui
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Variation journalière</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-green-600">+{mockPortfolio.dailyChangeAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
            <p className="text-xs text-slate-500 mt-1">
              Depuis l'ouverture
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Positions actives</CardTitle>
            <ShoppingBag className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">{mockPortfolio.positions.length}</div>
            <p className="text-xs text-slate-500 mt-1">
              Réparties sur 3 types
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Rapports</CardTitle>
            <FileText className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">12</div>
            <p className="text-xs text-slate-500 mt-1">
              Disponibles ce mois
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="portfolio" className="space-y-4">
        <TabsList>
          <TabsTrigger value="portfolio">Mon Portefeuille</TabsTrigger>
          <TabsTrigger value="products">Produits disponibles</TabsTrigger>
          <TabsTrigger value="reporting">Mes Rapports</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="space-y-4">
          <PortfolioOverview portfolio={mockPortfolio} />
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <ProductCatalog userRole="client" />
        </TabsContent>

        <TabsContent value="reporting" className="space-y-4">
          <ReportingClient />
        </TabsContent>
      </Tabs>
    </div>
  );
}
