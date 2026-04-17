import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ArrowLeft, User, Power, CheckCircle, XCircle, FileText, Mail } from 'lucide-react';
import { apiCall } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { toast } from 'sonner';
import { EditPersonalInfoModal } from './EditPersonalInfoModal';
import { EditPatrimonialInfoModal } from './EditPatrimonialInfoModal';
import { ClientInfoTab } from './ClientInfoTab';
import { ClientAssetsTab } from './ClientAssetsTab';
import { ClientTransactionsTab } from './ClientTransactionsTab';
import { ClientPositionsTab } from './ClientPositionsTab';
import { ClientNotesTab } from './ClientNotesTab';
import { ClientMiscTab } from './ClientMiscTab';
import { ClientVerificationTab } from './ClientVerificationTab';
import { ClientDocumentsTab } from './ClientDocumentsTab';
import { ClientHistoryTab } from './ClientHistoryTab';
import { ClientPlatformLogsTab } from './ClientPlatformLogsTab';
import '../styles/Clients.css';

interface ClientDetailProps {
  clientId: string;
  onBack: () => void;
}

const ClientPortfolioTab = lazy(() =>
  import('./ClientPortfolioTab').then((m) => ({ default: m.ClientPortfolioTab }))
);

const CLIENT_DETAIL_TAB_STORAGE_PREFIX = 'client_detail_active_tab_';
const CLIENT_DETAIL_TABS = [
  'info',
  'assets',
  'portfolio',
  'transactions',
  'positions',
  'notes',
  'verification',
  'documents',
  'misc',
  'history',
  'platform-logs',
] as const;

type ClientDetailTab = typeof CLIENT_DETAIL_TABS[number];

export function ClientDetail({ clientId, onBack }: ClientDetailProps) {
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ClientDetailTab>('info');
  
  // Track which tabs have been loaded
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(['info']));
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  
  // Data for tabs (loaded lazily)
  const [notes, setNotes] = useState<any[]>([]);
  const [clientAssets, setClientAssets] = useState<any[]>([]);
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [clientProducts, setClientProducts] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [clientRibs, setClientRibs] = useState<any[]>([]);
  const [availableRibs, setAvailableRibs] = useState<any[]>([]);
  const [clientUsefulLinks, setClientUsefulLinks] = useState<any[]>([]);
  const [availableUsefulLinks, setAvailableUsefulLinks] = useState<any[]>([]);
  
  // Dialogs
  const [isEditPersonalInfoOpen, setIsEditPersonalInfoOpen] = useState(false);
  const [isEditPatrimonialInfoOpen, setIsEditPatrimonialInfoOpen] = useState(false);
  
  // Load only essential client data on mount
  useEffect(() => {
    const storageKey = `${CLIENT_DETAIL_TAB_STORAGE_PREFIX}${clientId}`;
    const storedTab = sessionStorage.getItem(storageKey);
    const initialTab = CLIENT_DETAIL_TABS.includes(storedTab as ClientDetailTab)
      ? (storedTab as ClientDetailTab)
      : 'info';

    setActiveTab(initialTab);
    setLoadedTabs(new Set(['info']));
    setLoadingTab(null);

    loadEssentialClientData();

    if (initialTab !== 'info') {
      loadTabData(initialTab, true);
    }
  }, [clientId]);

  async function loadEssentialClientData() {
    try {
      setLoading(true);
      const clientData = await apiCall(`/api/clients/${clientId}/`);
      setClient((clientData as any).client);
    } catch (error) {
      console.error('Error loading client data:', error);
      toast.error('Erreur lors du chargement des données du client');
    } finally {
      setLoading(false);
    }
  }

  // Load tab data lazily when tab is accessed
  async function loadTabData(tabName: string, forceReload: boolean = false, silent: boolean = false) {
    if (!forceReload && loadedTabs.has(tabName)) {
      return; // Already loaded, skip unless forced
    }

    if (!silent) {
      setLoadingTab(tabName);
    }
    try {
      switch (tabName) {
        case 'notes':
          const notesData = await apiCall(`/api/notes/`);
          const notesArray = Array.isArray(notesData) ? notesData : ((notesData as any).notes || notesData || []);
          const clientNotes = notesArray.filter((note: any) => (note.clientId ?? note.client_id) === clientId);
          setNotes(clientNotes);
          setLoadedTabs(prev => new Set(prev).add('notes'));
          break;
        
        case 'assets':
          const [assetsData, availableAssetsData, productsData, availableProductsData] = await Promise.all([
            apiCall(`/api/clients/${clientId}/assets/`),
            apiCall(`/api/assets/`),
            apiCall(`/api/clients/${clientId}/products/`),
            apiCall(`/api/products/`)
          ]);
          setClientAssets((assetsData as any).assets || []);
          setAvailableAssets((availableAssetsData as any).assets || []);
          setClientProducts((productsData as any).products || []);
          setAvailableProducts((availableProductsData as any).products || []);
          setLoadedTabs(prev => new Set(prev).add('assets'));
          break;
        
        case 'misc':
          const [ribsData, availableRibsData, usefulLinksData, availableUsefulLinksData] = await Promise.all([
            apiCall(`/api/clients/${clientId}/ribs/`),
            apiCall(`/api/ribs/`),
            apiCall(`/api/clients/${clientId}/useful-links/`),
            apiCall(`/api/useful-links/`)
          ]);
          setClientRibs((ribsData as any).ribs || []);
          setAvailableRibs((availableRibsData as any).ribs || []);
          setClientUsefulLinks((usefulLinksData as any).usefulLinks || []);
          setAvailableUsefulLinks((availableUsefulLinksData as any).usefulLinks || []);
          setLoadedTabs(prev => new Set(prev).add('misc'));
          break;
        
        // Transactions, positions, documents, portfolio, verification tabs load their own data
        default:
          setLoadedTabs(prev => new Set(prev).add(tabName));
          break;
      }
    } catch (error) {
      console.error(`Error loading tab data for ${tabName}:`, error);
      toast.error(`Erreur lors du chargement des données de l'onglet`);
    } finally {
      if (!silent) {
        setLoadingTab(null);
      }
    }
  }

  // Handle tab change to load data lazily
  function handleTabChange(value: string) {
    if (!CLIENT_DETAIL_TABS.includes(value as ClientDetailTab)) {
      return;
    }

    const nextTab = value as ClientDetailTab;
    setActiveTab(nextTab);
    sessionStorage.setItem(`${CLIENT_DETAIL_TAB_STORAGE_PREFIX}${clientId}`, nextTab);
    loadTabData(value);
  }

  async function loadClientData() {
    // Refresh essential client data
    await loadEssentialClientData();
    // Reload currently loaded tabs (force reload to refresh data after mutations)
    for (const tab of loadedTabs) {
      if (tab !== 'info') {
        await loadTabData(tab, true); // Force reload even if already loaded
      }
    }
  }

  function handleOpenEditModal() {
    setIsEditPersonalInfoOpen(true);
  }

  async function handlePersonalInfoUpdated() {
    await loadClientData();
  }

  async function handlePatrimonialInfoUpdated() {
    await loadClientData();
  }


  function handlePlatformAccess() {
    if (!client?.active) {
      toast.error('Compte client désactivé');
      return;
    }

    // Open in a new tab with a per-tab (sessionStorage) client session,
    // so the admin panel stays connected in the current tab.
    window.open(`/platform/impersonate/${clientId}`, '_blank', 'noopener,noreferrer');
  }

  async function handleToggleActive() {
    try {
      await apiCall(`/api/clients/${clientId}/toggle-active/`, { method: 'POST' });
      toast.success(client.active ? 'Client désactivé' : 'Client activé');
      loadClientData();
    } catch (error) {
      console.error('Error toggling active status:', error);
      toast.error('Erreur lors de la modification du statut');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <LoadingIndicator />
        <p className="mt-4 text-slate-600">Chargement des informations du client...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Client introuvable</p>
        <Button onClick={onBack} className="mt-4">
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2"/>
          Retour
        </Button>
        <div className="mt-2 flex gap-4">
          {client.profilePhoto ? (
            <img 
              src={client.profilePhoto} 
              alt="Photo de profil" 
              className="client-profile-photo-display"
            />
          ) : (
            <div className="client-profile-photo-placeholder-display">
              <User className="w-12 h-12" />
            </div>
          )}
          <div>
            <h1 className="text-slate-900 mb-1">
              {client.firstName} {client.lastName}
            </h1>
            <p className="text-slate-600">{client.email}</p>
          </div>
          </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => {
            setActiveTab('notes');
            sessionStorage.setItem(`${CLIENT_DETAIL_TAB_STORAGE_PREFIX}${clientId}`, 'notes');
            loadTabData('notes');
          }}
        >
          <FileText className="w-4 h-4 mr-2" />
          Ajouter une note
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          onClick={() => toast.info('Fonctionnalité à venir - Envoyer un message')}
        >
          <Mail className="w-4 h-4 mr-2" />
          Envoyer un message
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          onClick={handlePlatformAccess}
        >
          <Power className="w-4 h-4 mr-2" />
          Connexion à la plateforme
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          onClick={handleToggleActive}
          className={client.active ? 'client-action-button-deactivate' : 'client-action-button-activate'}
        >
          {client.active ? (
            <>
              <XCircle className="w-4 h-4 mr-2" />
              Désactiver
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Activer
            </>
          )}
        </Button>
      </div>


      {/* Client Details Tabs */}
      <Tabs value={activeTab} className="space-y-6" onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="info">Informations</TabsTrigger>
          <TabsTrigger value="assets">Actifs visibles</TabsTrigger>
          <TabsTrigger value="portfolio">Portefeuille</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="verification">Vérification</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="misc">Fonctionnalités diverses</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
          <TabsTrigger value="platform-logs">Logs plateforme</TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info">
          <ClientInfoTab 
            client={client}
            onOpenEditPersonalInfo={handleOpenEditModal}
            onOpenEditPatrimonialInfo={() => setIsEditPatrimonialInfoOpen(true)}
            onClientUpdated={loadClientData}
          />
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <ClientTransactionsTab 
            onRefresh={loadClientData}
            clientId={clientId}
            client={client}
          />
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions">
          <ClientPositionsTab clientId={clientId} accountCurrency={client?.accountCurrency || 'EUR'} />
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets">
          {loadingTab === 'assets' ? (
            <div className="flex flex-col items-center justify-center py-12">
              <LoadingIndicator />
              <p className="mt-4 text-slate-600">Chargement des actifs...</p>
            </div>
          ) : (
            <ClientAssetsTab 
              clientId={clientId}
              clientAssets={clientAssets}
              availableAssets={availableAssets}
              clientProducts={clientProducts}
              availableProducts={availableProducts}
              onRefresh={loadClientData}
            />
          )}
        </TabsContent>

        {/* Portfolio Tab */}
        <TabsContent value="portfolio">
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center py-12">
                <LoadingIndicator />
                <p className="mt-4 text-slate-600">Chargement du portefeuille...</p>
              </div>
            }
          >
            <ClientPortfolioTab client={client} clientId={clientId} onRefresh={loadClientData} />
          </Suspense>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes">
          {loadingTab === 'notes' ? (
            <div className="flex flex-col items-center justify-center py-12">
              <LoadingIndicator />
              <p className="mt-4 text-slate-600">Chargement des notes...</p>
            </div>
          ) : (
            <ClientNotesTab 
              notes={notes}
              clientId={clientId}
              onRefresh={() => loadTabData('notes', true, true)}
              onNoteCreated={(note) => setNotes(prev => [note, ...prev])}
            />
          )}
        </TabsContent>

        {/* Verification Tab */}
        <TabsContent value="verification">
          <ClientVerificationTab client={client} clientId={clientId} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <ClientDocumentsTab clientId={clientId} accountCurrency={client?.accountCurrency || 'EUR'} onRefresh={loadClientData} />
        </TabsContent>

        {/* Misc Tab */}
        <TabsContent value="misc">
          {loadingTab === 'misc' ? (
            <div className="flex flex-col items-center justify-center py-12">
              <LoadingIndicator />
              <p className="mt-4 text-slate-600">Chargement des fonctionnalités diverses...</p>
            </div>
          ) : (
            <ClientMiscTab
              clientId={clientId}
              client={client}
              clientRibs={clientRibs}
              availableRibs={availableRibs}
              clientUsefulLinks={clientUsefulLinks}
              availableUsefulLinks={availableUsefulLinks}
              onRefresh={loadClientData}
            />
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <ClientHistoryTab clientId={clientId} />
        </TabsContent>

        {/* Platform Logs Tab */}
        <TabsContent value="platform-logs">
          <ClientPlatformLogsTab clientId={clientId} />
        </TabsContent>
      </Tabs>

      {/* Edit Personal Info Modal */}
      <EditPersonalInfoModal
        isOpen={isEditPersonalInfoOpen}
        onClose={() => setIsEditPersonalInfoOpen(false)}
        client={client}
        clientId={clientId}
        onUpdate={handlePersonalInfoUpdated}
      />

      {/* Edit Patrimonial Info Modal */}
      <EditPatrimonialInfoModal
        isOpen={isEditPatrimonialInfoOpen}
        onClose={() => setIsEditPatrimonialInfoOpen(false)}
        client={client}
        clientId={clientId}
        onUpdate={handlePatrimonialInfoUpdated}
      />

    </div>
  );
}

export default ClientDetail;