import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { ClientsList } from './ClientsList';
import { OrderManagement } from './OrderManagement';
import { PortfolioMonitoring } from './PortfolioMonitoring';
import { Users, TrendingUp, ShoppingCart, Activity } from 'lucide-react';

const mockStats = {
  totalClients: 47,
  activeOrders: 23,
  portfoliosManaged: 47,
  totalAUM: 5847230,
};

export function DashboardConseiller() {
  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Clients actifs</CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">{mockStats.totalClients}</div>
            <p className="text-xs text-slate-500 mt-1">
              +3 ce mois
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Ordres en cours</CardTitle>
            <ShoppingCart className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">{mockStats.activeOrders}</div>
            <p className="text-xs text-slate-500 mt-1">
              12 en attente de validation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Portefeuilles gérés</CardTitle>
            <Activity className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">{mockStats.portfoliosManaged}</div>
            <p className="text-xs text-slate-500 mt-1">
              Performance moyenne +8.2%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Actifs sous gestion</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-slate-900">{mockStats.totalAUM.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</div>
            <p className="text-xs text-slate-500 mt-1">
              +12.4% vs année dernière
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList>
          <TabsTrigger value="clients">Mes Clients</TabsTrigger>
          <TabsTrigger value="orders">Gestion d'ordres</TabsTrigger>
          <TabsTrigger value="monitoring">Suivi Portefeuilles</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-4">
          <ClientsList />
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <OrderManagement />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <PortfolioMonitoring />
        </TabsContent>
      </Tabs>
    </div>
  );
}
