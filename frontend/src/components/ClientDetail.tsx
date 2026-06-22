import React, { Suspense, useState, useEffect, useRef } from 'react';
import { lazy } from '../utils/lazyImport';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ArrowLeft, User, Power, CheckCircle, XCircle, FileText, Mail } from 'lucide-react';
import { apiCall } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
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

const SELF_LOADING_TABS = new Set<string>([
  'assets',
  'portfolio',
  'transactions',
  'positions',
  'verification',
  'documents',
  'history',
  'platform-logs',
]);

export function ClientDetail({ clientId, onBack }: ClientDetailProps) {
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ClientDetailTab>('info');
  
  // Track which tabs have been loaded
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(['info']));
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  
  // Data for tabs (loaded lazily)
  const [notes, setNotes] = useState<any[]>([]);
  const [clientRibs, setClientRibs] = useState<any[]>([]);
  const [availableRibs, setAvailableRibs] = useState<any[]>([]);
  const [clientWallets, setClientWallets] = useState<any[]>([]);
  const [availableWallets, setAvailableWallets] = useState<any[]>([]);
  const [clientUsefulLinks, setClientUsefulLinks] = useState<any[]>([]);
  const [availableUsefulLinks, setAvailableUsefulLinks] = useState<any[]>([]);
  const loadingTabRequestRef = useRef(0);
  const [selfLoadingRefreshToken, setSelfLoadingRefreshToken] = useState(0);
  
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
    if (SELF_LOADING_TABS.has(tabName)) {
      setLoadedTabs((prev) => new Set(prev).add(tabName));
      return;
    }

    if (!forceReload && loadedTabs.has(tabName)) {
      return; // Already loaded, skip unless forced
    }

    const requestId = ++loadingTabRequestRef.current;
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

        case 'misc':
          const [ribsData, availableRibsData, walletsData, availableWalletsData, usefulLinksData, availableUsefulLinksData] = await Promise.all([
            apiCall(`/api/clients/${clientId}/ribs/`),
            apiCall(`/api/ribs/`),
            apiCall(`/api/clients/${clientId}/wallets/`),
            apiCall(`/api/wallets/`),
            apiCall(`/api/clients/${clientId}/useful-links/`),
            apiCall(`/api/useful-links/`)
          ]);
          setClientRibs((ribsData as any).ribs || []);
          setAvailableRibs((availableRibsData as any).ribs || []);
          setClientWallets((walletsData as any).wallets || []);
          setAvailableWallets((availableWalletsData as any).wallets || []);
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
      if (!silent && loadingTabRequestRef.current === requestId) {
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
    // Self-loading tabs watch refreshToken; parent-managed tabs reload via loadTabData
    const hasLoadedSelfLoadingTabs = [...loadedTabs].some(
      (tab) => tab !== 'info' && SELF_LOADING_TABS.has(tab),
    );
    if (hasLoadedSelfLoadingTabs) {
      setSelfLoadingRefreshToken((token) => token + 1);
    }
    for (const tab of loadedTabs) {
      if (tab !== 'info' && !SELF_LOADING_TABS.has(tab)) {
        await loadTabData(tab, true);
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
        <Button
          variant="outline"
          onClick={onBack}
          className="mb-4 client-back-button"
        >
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
          className="h-8 rounded-md !border !border-amber-300 !bg-amber-100 px-3 !text-amber-900 shadow-sm transition-colors duration-200 hover:!bg-amber-300 hover:!text-amber-950 hover:!opacity-100 client-quick-action-button"
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
          className="h-8 rounded-md !border !border-blue-300 !bg-blue-100 px-3 !text-blue-900 shadow-sm transition-colors duration-200 hover:!bg-blue-300 hover:!text-blue-950 hover:!opacity-100 client-quick-action-button"
          onClick={() => navigate(`/admin/messagerie?clientId=${clientId}&mode=new`)}
        >
          <Mail className="w-4 h-4 mr-2" />
          Envoyer un message
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          className="h-8 rounded-md !border !border-purple-300 !bg-purple-100 px-3 !text-purple-900 shadow-sm transition-colors duration-200 hover:!bg-purple-300 hover:!text-purple-950 hover:!opacity-100 client-quick-action-button"
          onClick={handlePlatformAccess}
        >
          <Power className="w-4 h-4 mr-2" />
          Connexion à la plateforme
        </Button>

        <Button 
          size="sm" 
          variant="outline"
          onClick={handleToggleActive}
          className={
            client.active
              ? 'h-8 rounded-md !border !border-red-300 !bg-red-100 px-3 !text-red-900 shadow-sm transition-colors duration-200 hover:!bg-red-300 hover:!text-red-950 hover:!opacity-100 client-quick-action-button'
              : 'h-8 rounded-md !border !border-green-300 !bg-green-100 px-3 !text-green-900 shadow-sm transition-colors duration-200 hover:!bg-green-300 hover:!text-green-950 hover:!opacity-100 client-quick-action-button'
          }
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
            refreshToken={selfLoadingRefreshToken}
          />
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions">
          <ClientPositionsTab
            clientId={clientId}
            accountCurrency={client?.accountCurrency || 'EUR'}
            refreshToken={selfLoadingRefreshToken}
          />
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets">
          <ClientAssetsTab clientId={clientId} refreshToken={selfLoadingRefreshToken} />
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
            <ClientPortfolioTab
              client={client}
              clientId={clientId}
              onRefresh={loadClientData}
              refreshToken={selfLoadingRefreshToken}
            />
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
          <ClientVerificationTab
            client={client}
            clientId={clientId}
            refreshToken={selfLoadingRefreshToken}
          />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <ClientDocumentsTab
            clientId={clientId}
            accountCurrency={client?.accountCurrency || 'EUR'}
            onRefresh={loadClientData}
            refreshToken={selfLoadingRefreshToken}
          />
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
              clientWallets={clientWallets}
              availableWallets={availableWallets}
              clientUsefulLinks={clientUsefulLinks}
              availableUsefulLinks={availableUsefulLinks}
              onRefresh={loadClientData}
            />
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <ClientHistoryTab clientId={clientId} refreshToken={selfLoadingRefreshToken} />
        </TabsContent>

        {/* Platform Logs Tab */}
        <TabsContent value="platform-logs">
          <ClientPlatformLogsTab clientId={clientId} refreshToken={selfLoadingRefreshToken} />
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