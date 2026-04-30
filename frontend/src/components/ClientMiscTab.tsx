import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Plus, Trash2, X, CreditCard, Link as LinkIcon, Wallet, MessageSquare, FileText } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { RichTextEditor } from './RichTextEditor';
import '../styles/Modal.css';
import '../styles/ClientMiscRibTable.css';

interface ClientMiscTabProps {
  clientId: string;
  client: any;
  clientRibs: any[];
  availableRibs: any[];
  clientUsefulLinks: any[];
  availableUsefulLinks: any[];
  onRefresh: () => void;
}

/** RIB ids may be string or number depending on serializer path — normalize for comparisons. */
function normalizeClientRibId(id: unknown): string | null {
  if (id === null || id === undefined) return null;
  const s = String(id).trim();
  return s === '' ? null : s;
}

export function ClientMiscTab({
  clientId,
  client,
  clientRibs,
  availableRibs,
  clientUsefulLinks,
  availableUsefulLinks,
  onRefresh
}: ClientMiscTabProps) {
  const [isAddLinkDialogOpen, setIsAddLinkDialogOpen] = useState(false);
  const [draftDisplayedRibId, setDraftDisplayedRibId] = useState<string | null>(null);
  const [savingRibDisplay, setSavingRibDisplay] = useState(false);
  const prevRibAssignmentKey = useRef<string>('');
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [savingPaymentMethods, setSavingPaymentMethods] = useState(false);
  const [tradingEnabled, setTradingEnabled] = useState<boolean>(false);
  const [savingTradingEnabled, setSavingTradingEnabled] = useState(false);
  const [showPositionPrices, setShowPositionPrices] = useState<boolean>(false);
  const [savingShowPositionPrices, setSavingShowPositionPrices] = useState(false);
  const [contractPreviewEnabled, setContractPreviewEnabled] = useState<boolean>(true);
  const [importedContractPreviewEnabled, setImportedContractPreviewEnabled] = useState<boolean>(false);
  const [savingContractPreviewEnabled, setSavingContractPreviewEnabled] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string>('');
  const [savingBannerMessage, setSavingBannerMessage] = useState(false);
  const [aiBannerContext, setAiBannerContext] = useState('');

  // Initialize payment methods from client data
  useEffect(() => {
    if (client?.paymentMethods) {
      setPaymentMethods(client.paymentMethods);
    } else {
      setPaymentMethods([]);
    }
  }, [client]);

  // Initialize trading enabled from client data
  useEffect(() => {
    if (client?.tradingEnabled !== undefined) {
      setTradingEnabled(client.tradingEnabled);
    } else {
      setTradingEnabled(false); // Default to false
    }
    if (client?.showPositionPrices !== undefined) {
      setShowPositionPrices(Boolean(client.showPositionPrices));
    } else {
      setShowPositionPrices(false);
    }
  }, [client]);

  // Initialize contract preview enabled from client data
  useEffect(() => {
    if (client?.contractPreviewEnabled !== undefined) {
      setContractPreviewEnabled(client.contractPreviewEnabled);
    } else {
      setContractPreviewEnabled(true); // Default to true
    }
    if (client?.importedContractPreviewEnabled !== undefined) {
      setImportedContractPreviewEnabled(Boolean(client.importedContractPreviewEnabled));
    } else {
      setImportedContractPreviewEnabled(false);
    }
  }, [client]);

  // Initialize banner message from client data
  useEffect(() => {
    if (client?.bannerMessage !== undefined) {
      setBannerMessage(client.bannerMessage || '');
    } else {
      setBannerMessage('');
    }
  }, [client]);

  const ribAssignmentKey = useMemo(() => {
    if (!clientRibs?.length) return 'none';
    return clientRibs
      .map((cr: any) => normalizeClientRibId(cr?.rib?.id))
      .filter((x): x is string => x !== null)
      .sort()
      .join(',');
  }, [clientRibs]);

  const sortedCatalogueRibs = useMemo(() => {
    return [...(availableRibs || [])].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
    );
  }, [availableRibs]);

  const orphanAssignedRibs = useMemo(() => {
    const catalogueIds = new Set(
      (availableRibs || []).map((r: any) => normalizeClientRibId(r.id)).filter((x): x is string => x !== null)
    );
    return (clientRibs || [])
      .map((cr: any) => cr?.rib)
      .filter((r: any) => {
        const id = normalizeClientRibId(r?.id);
        return r && id && !catalogueIds.has(id);
      });
  }, [clientRibs, availableRibs]);

  useEffect(() => {
    if (ribAssignmentKey === prevRibAssignmentKey.current) return;
    prevRibAssignmentKey.current = ribAssignmentKey;
    if (ribAssignmentKey === 'none') {
      setDraftDisplayedRibId(null);
    } else {
      const first = ribAssignmentKey.split(',')[0];
      setDraftDisplayedRibId(normalizeClientRibId(first));
    }
  }, [ribAssignmentKey]);

  const serverAssignedIds = useMemo(
    () =>
      (clientRibs || [])
        .map((cr: any) => normalizeClientRibId(cr?.rib?.id))
        .filter((x): x is string => x !== null)
        .sort(),
    [clientRibs]
  );
  const draftRibNorm = normalizeClientRibId(draftDisplayedRibId);
  const ribSelectionClean =
    (clientRibs?.length ?? 0) <= 1 &&
    (serverAssignedIds.length === 0
      ? draftRibNorm === null
      : serverAssignedIds.length === 1 && draftRibNorm === serverAssignedIds[0]);
  const ribSelectionDirty = !ribSelectionClean || (clientRibs?.length ?? 0) > 1;

  function handlePaymentMethodChange(method: string, checked: boolean | 'indeterminate') {
    if (checked === true) {
      setPaymentMethods([...paymentMethods, method]);
    } else {
      setPaymentMethods(paymentMethods.filter((m) => m !== method));
    }
  }

  async function handleSavePaymentMethods() {
    setSavingPaymentMethods(true);
    try {
      await apiCall(`/api/clients/${clientId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentMethods: paymentMethods }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Méthodes de paiement mises à jour avec succès');
      onRefresh();
    } catch (error: any) {
      console.error('Error saving payment methods:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour des méthodes de paiement');
      // Revert to original values on error
      if (client?.paymentMethods) {
        setPaymentMethods(client.paymentMethods);
      }
    } finally {
      setSavingPaymentMethods(false);
    }
  }

  async function handleSaveTradingEnabled() {
    setSavingTradingEnabled(true);
    try {
      await apiCall(`/api/clients/${clientId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ tradingEnabled: tradingEnabled }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Paramètre de trading mis à jour avec succès');
      onRefresh();
    } catch (error: any) {
      console.error('Error saving trading enabled:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour du paramètre de trading');
      // Revert to original value on error
      if (client?.tradingEnabled !== undefined) {
        setTradingEnabled(client.tradingEnabled);
      }
    } finally {
      setSavingTradingEnabled(false);
    }
  }

  async function handleSaveShowPositionPrices() {
    setSavingShowPositionPrices(true);
    try {
      await apiCall(`/api/clients/${clientId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ showPositionPrices }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Affichage des prix des positions mis à jour avec succès');
      onRefresh();
    } catch (error: any) {
      console.error('Error saving position price visibility:', error);
      toast.error(error.message || "Erreur lors de la mise à jour de l'affichage des prix");
      if (client?.showPositionPrices !== undefined) {
        setShowPositionPrices(Boolean(client.showPositionPrices));
      }
    } finally {
      setSavingShowPositionPrices(false);
    }
  }

  async function handleSaveContractPreviewEnabled() {
    setSavingContractPreviewEnabled(true);
    const effectiveImported =
      contractPreviewEnabled ? false : importedContractPreviewEnabled;
    try {
      await apiCall(`/api/clients/${clientId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          contractPreviewEnabled,
          importedContractPreviewEnabled: effectiveImported,
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Paramètres de prévisualisation du contrat mis à jour avec succès');
      onRefresh();
    } catch (error: any) {
      console.error('Error saving contract preview enabled:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour du paramètre');
      if (client?.contractPreviewEnabled !== undefined) {
        setContractPreviewEnabled(client.contractPreviewEnabled);
      }
      if (client?.importedContractPreviewEnabled !== undefined) {
        setImportedContractPreviewEnabled(Boolean(client.importedContractPreviewEnabled));
      }
    } finally {
      setSavingContractPreviewEnabled(false);
    }
  }

  async function handleSaveBannerMessage() {
    setSavingBannerMessage(true);
    try {
      await apiCall(`/api/clients/${clientId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ bannerMessage: bannerMessage }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Message de bannière mis à jour avec succès');
      onRefresh();
    } catch (error: any) {
      console.error('Error saving banner message:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour du message de bannière');
      // Revert to original value on error
      if (client?.bannerMessage !== undefined) {
        setBannerMessage(client.bannerMessage || '');
      }
    } finally {
      setSavingBannerMessage(false);
    }
  }

  async function generateAIBannerMessage(): Promise<string> {
    const response = await apiCall(`/api/clients/${clientId}/generate-banner-message/`, {
      method: 'POST',
      body: JSON.stringify({
        existingMessage: (bannerMessage || '').trim(),
        userPrompt: (aiBannerContext || '').trim(),
      }),
    });
    return response?.description || response?.text || '';
  }

  async function handleSaveDisplayedRib() {
    setSavingRibDisplay(true);
    try {
      const targetRibId = draftRibNorm;
      const currentRibIds = (clientRibs || [])
        .map((cr: any) => normalizeClientRibId(cr?.rib?.id))
        .filter((x): x is string => x !== null);
      for (const ribId of currentRibIds) {
        await apiCall(`/api/clients/${clientId}/ribs/${ribId}/`, { method: 'DELETE' });
      }
      if (targetRibId) {
        await apiCall(`/api/clients/${clientId}/ribs/add/`, {
          method: 'POST',
          body: JSON.stringify({ ribId: targetRibId }),
          headers: { 'Content-Type': 'application/json' },
        });
      }
      toast.success(
        targetRibId
          ? 'RIB affiché sur la plateforme du client mis à jour.'
          : 'Aucun RIB catalogue ne sera affiché au client.'
      );
      onRefresh();
    } catch (error: any) {
      console.error('Error saving displayed RIB:', error);
      toast.error(error?.message || "Erreur lors de l'enregistrement du RIB");
      onRefresh();
    } finally {
      setSavingRibDisplay(false);
    }
  }

  async function handleAddUsefulLink(usefulLinkId: string) {
    try {
      await apiCall(`/api/clients/${clientId}/useful-links/add/`, {
        method: 'POST',
        body: JSON.stringify({ usefulLinkId }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Lien utile ajouté avec succès');
      setIsAddLinkDialogOpen(false);
      onRefresh();
    } catch (error: any) {
      console.error('Error adding useful link:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout du lien utile');
    }
  }

  async function handleRemoveUsefulLink(usefulLinkId: string) {
    if (!confirm('Retirer ce lien utile du client ?')) return;
    
    try {
      await apiCall(`/api/clients/${clientId}/useful-links/${usefulLinkId}/`, { method: 'DELETE' });
      toast.success('Lien utile retiré avec succès');
      onRefresh();
    } catch (error) {
      console.error('Error removing useful link:', error);
      toast.error('Erreur lors du retrait du lien utile');
    }
  }

  // Filter available useful links that are not already assigned
  const availableLinksToAdd = availableUsefulLinks.filter(
    (link) => !clientUsefulLinks.some((cul) => cul.usefulLink.id === link.id)
  );

  return (
    <div className="space-y-6">
      {/* Trading Enabled Section */}
      <Card>
        <CardHeader>
          <CardTitle>Activer le trading</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Si désactivé, le client ne verra pas le bouton "Trader" dans les assets sur sa plateforme.
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="tradingEnabled"
                checked={tradingEnabled}
                onCheckedChange={(checked) => setTradingEnabled(checked === true)}
              />
              <Label htmlFor="tradingEnabled" className="font-normal cursor-pointer">
                Activer le trading
              </Label>
            </div>
            <div className="pt-2">
              <Button
                onClick={handleSaveTradingEnabled}
                disabled={savingTradingEnabled}
                size="sm"
              >
                {savingTradingEnabled ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Position Prices Section */}
      <Card>
        <CardHeader>
          <CardTitle>Prix des positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Si activé, le client verra les prix d'achat et de vente disponibles dans ses ordres/positions.
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showPositionPrices"
                checked={showPositionPrices}
                onCheckedChange={(checked) => setShowPositionPrices(checked === true)}
              />
              <Label htmlFor="showPositionPrices" className="font-normal cursor-pointer">
                Afficher les prix d'achat et de vente
              </Label>
            </div>
            <p className="text-xs text-slate-500">
              Le prix de vente est affiché uniquement lorsqu'il peut être calculé de façon fiable à partir de la position.
            </p>
            <div className="pt-2">
              <Button
                onClick={handleSaveShowPositionPrices}
                disabled={savingShowPositionPrices}
                size="sm"
              >
                {savingShowPositionPrices ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parametres du produit Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Parametres du produit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Paramètres liés aux produits et à la souscription pour ce client.
            </p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="contractPreviewEnabled"
                checked={contractPreviewEnabled}
                onCheckedChange={(checked) => {
                  const on = checked === true;
                  setContractPreviewEnabled(on);
                  if (on) {
                    setImportedContractPreviewEnabled(false);
                  }
                }}
              />
              <Label htmlFor="contractPreviewEnabled" className="font-normal cursor-pointer">
                Prévisualisation du contrat
              </Label>
            </div>
            <p className="text-xs text-slate-500">
              Si activé, le client voit le bouton « Voir le contrat » avec le PDF généré à partir du produit lors de la souscription.
            </p>
            {!contractPreviewEnabled && (
              <div className="pl-1 pt-2 border-t border-slate-100 mt-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="importedContractPreviewEnabled"
                    checked={importedContractPreviewEnabled}
                    onCheckedChange={(checked) => setImportedContractPreviewEnabled(checked === true)}
                  />
                  <Label htmlFor="importedContractPreviewEnabled" className="font-normal cursor-pointer">
                    Afficher les contrats importés manuellement
                  </Label>
                </div>
                <p className="text-xs text-slate-500">
                  Si activé, le bloc « Prévisualisation du contrat » réapparaît sur la plateforme : les fichiers proviennent des documents CRM (type Contrat) liés au produit concerné.
                </p>
              </div>
            )}
            <div className="pt-2">
              <Button
                onClick={handleSaveContractPreviewEnabled}
                disabled={savingContractPreviewEnabled}
                size="sm"
              >
                {savingContractPreviewEnabled ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Banner Message Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Message de bannière
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Écrivez un message qui sera affiché comme une bannière en haut de la plateforme du client.
            </p>
            <RichTextEditor
              id="bannerMessage"
              label="Message de bannière"
              value={bannerMessage}
              onChange={(value) => setBannerMessage(value)}
              placeholder="Entrez le message à afficher sur la plateforme du client..."
              rows={5}
              onGenerateAI={generateAIBannerMessage}
              aiContextFocusFieldId="ai-banner-context"
              aiContextSlot={
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/90 p-3">
                  <Label htmlFor="ai-banner-context" className="text-sm font-medium">
                    Contexte pour la génération IA (optionnel)
                  </Label>
                  <Textarea
                    id="ai-banner-context"
                    value={aiBannerContext}
                    onChange={(e) => setAiBannerContext(e.target.value)}
                    placeholder="Ex. : information importante, maintenance, nouveau contact, rappel réglementaire…"
                    rows={3}
                    className="resize-y text-sm w-full"
                    maxLength={4000}
                  />
                  <p className="text-xs text-slate-500">
                    Renseignez ce bloc si besoin, puis cliquez de nouveau sur l’icône ✨ pour générer le texte.
                  </p>
                </div>
              }
            />
            <div className="pt-2">
              <Button
                onClick={handleSaveBannerMessage}
                disabled={savingBannerMessage}
                size="sm"
              >
                {savingBannerMessage ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Méthodes de paiement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Sélectionnez les méthodes de paiement disponibles pour le dépôt des fonds
            </p>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="virement"
                  checked={paymentMethods.includes('virement')}
                  onCheckedChange={(checked) => handlePaymentMethodChange('virement', checked === true)}
                />
                <Label htmlFor="virement" className="font-normal cursor-pointer">
                  Virement
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="carte_bancaire"
                  checked={paymentMethods.includes('carte_bancaire')}
                  onCheckedChange={(checked) => handlePaymentMethodChange('carte_bancaire', checked === true)}
                />
                <Label htmlFor="carte_bancaire" className="font-normal cursor-pointer">
                  Carte bancaire
                </Label>
              </div>
            </div>
            <div className="pt-2">
              <Button
                onClick={handleSavePaymentMethods}
                disabled={savingPaymentMethods}
                size="sm"
              >
                {savingPaymentMethods ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RIBs Section — un seul RIB catalogue affichable sur la plateforme client */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            RIB affiché sur la plateforme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Tous les RIB du catalogue sont listés ci-dessous. Choisissez celui que le client verra pour ses dépôts
            par virement (un seul à la fois), ou « Aucun » pour ne rien afficher.
          </p>
          {draftRibNorm &&
            !sortedCatalogueRibs.some((r: any) => normalizeClientRibId(r.id) === draftRibNorm) &&
            !orphanAssignedRibs.some((r: any) => normalizeClientRibId(r.id) === draftRibNorm) ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Le RIB actuellement prévu n&apos;est plus dans le catalogue. Sélectionnez un autre RIB ou « Aucun »,
              puis enregistrez.
            </p>
          ) : null}
          {sortedCatalogueRibs.length === 0 && orphanAssignedRibs.length === 0 ? (
            <p className="text-slate-500 text-center py-6">
              Aucun RIB dans le catalogue. Créez des RIB dans la section administration (RIB) pour les proposer ici.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-center p-2 font-medium text-slate-700 w-14">Choix</th>
                      <th className="text-left p-2 font-medium text-slate-700">Nom</th>
                      <th className="text-left p-2 font-medium text-slate-700">Titulaire</th>
                      <th className="text-left p-2 font-medium text-slate-700">Banque</th>
                      <th className="text-left p-2 font-medium text-slate-700">Guichet</th>
                      <th className="text-left p-2 font-medium text-slate-700">Compte</th>
                      <th className="text-left p-2 font-medium text-slate-700">Clé</th>
                      <th className="text-left p-2 font-medium text-slate-700">Domiciliation</th>
                      <th className="text-left p-2 font-medium text-slate-700">Défaut</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-b client-misc-rib-row">
                      <td className="p-2 align-middle text-center">
                        <input
                          type="radio"
                          id="rib-choice-none"
                          name={`client-rib-display-${clientId}`}
                          value="__none__"
                          checked={draftRibNorm === null}
                          onChange={() => setDraftDisplayedRibId(null)}
                          className="client-misc-rib-radio h-4 w-4 cursor-pointer align-middle accent-slate-800"
                          aria-label="Aucun RIB affiché au client"
                        />
                      </td>
                      <td className="p-2 align-middle" colSpan={8}>
                        <Label htmlFor="rib-choice-none" className="font-medium cursor-pointer">
                          Aucun RIB (le client ne verra pas de RIB catalogue sur la plateforme)
                        </Label>
                      </td>
                    </tr>
                    {orphanAssignedRibs.map((rib: any) => (
                      <tr
                        key={`orphan-${rib.id}`}
                        className="border-b client-misc-rib-row client-misc-rib-row--orphan bg-amber-50/30"
                      >
                        <td className="p-2 align-middle text-center">
                          <input
                            type="radio"
                            id={`rib-choice-orphan-${String(rib.id)}`}
                            name={`client-rib-display-${clientId}`}
                            value={String(rib.id)}
                            checked={draftRibNorm !== null && draftRibNorm === normalizeClientRibId(rib.id)}
                            onChange={() => setDraftDisplayedRibId(normalizeClientRibId(rib.id))}
                            className="client-misc-rib-radio h-4 w-4 cursor-pointer align-middle accent-amber-800"
                            aria-label={`Sélectionner le RIB ${rib.name}`}
                          />
                        </td>
                        <td className="p-2 align-middle">
                          <Label htmlFor={`rib-choice-orphan-${String(rib.id)}`} className="cursor-pointer">
                            {rib.name}
                            <span className="ml-2 text-xs font-normal text-amber-900">(hors catalogue)</span>
                          </Label>
                        </td>
                        <td className="p-2 align-middle text-slate-700">{rib.accountHolder || '—'}</td>
                        <td className="p-2 font-mono text-xs align-middle">{rib.bankCode || '—'}</td>
                        <td className="p-2 font-mono text-xs align-middle">{rib.branchCode || '—'}</td>
                        <td className="p-2 font-mono text-xs align-middle">{rib.accountNumber || '—'}</td>
                        <td className="p-2 font-mono text-xs align-middle">{rib.ribKey || '—'}</td>
                        <td className="p-2 align-middle text-slate-600 max-w-[140px] truncate" title={rib.domiciliation}>
                          {rib.domiciliation || '—'}
                        </td>
                        <td className="p-2 align-middle">—</td>
                      </tr>
                    ))}
                    {sortedCatalogueRibs.map((rib: any) => (
                      <tr key={String(rib.id)} className="border-b client-misc-rib-row">
                        <td className="p-2 align-middle text-center">
                          <input
                            type="radio"
                            id={`rib-choice-${String(rib.id)}`}
                            name={`client-rib-display-${clientId}`}
                            value={String(rib.id)}
                            checked={draftRibNorm !== null && draftRibNorm === normalizeClientRibId(rib.id)}
                            onChange={() => setDraftDisplayedRibId(normalizeClientRibId(rib.id))}
                            className="client-misc-rib-radio h-4 w-4 cursor-pointer align-middle accent-slate-800"
                            aria-label={`Sélectionner le RIB ${rib.name}`}
                          />
                        </td>
                        <td className="p-2 align-middle">
                          <Label htmlFor={`rib-choice-${String(rib.id)}`} className="cursor-pointer">
                            {rib.name}
                          </Label>
                        </td>
                        <td className="p-2 align-middle text-slate-700">{rib.accountHolder || '—'}</td>
                        <td className="p-2 font-mono text-xs align-middle">{rib.bankCode || '—'}</td>
                        <td className="p-2 font-mono text-xs align-middle">{rib.branchCode || '—'}</td>
                        <td className="p-2 font-mono text-xs align-middle">{rib.accountNumber || '—'}</td>
                        <td className="p-2 font-mono text-xs align-middle">{rib.ribKey || '—'}</td>
                        <td className="p-2 align-middle text-slate-600 max-w-[140px] truncate" title={rib.domiciliation}>
                          {rib.domiciliation || '—'}
                        </td>
                        <td className="p-2 align-middle text-xs">
                          {rib.default ? <span className="text-slate-600">Oui</span> : <span className="text-slate-400">Non</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button size="sm" onClick={handleSaveDisplayedRib} disabled={!ribSelectionDirty || savingRibDisplay}>
              {savingRibDisplay ? 'Enregistrement...' : 'Enregistrer le RIB affiché'}
            </Button>
            {(clientRibs?.length ?? 0) > 1 ? (
              <span className="text-xs text-amber-800">
                Plusieurs RIB étaient associés : enregistrez pour n&apos;en conserver qu&apos;un seul (celui sélectionné).
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Useful Links Section */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              Liens utiles
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setIsAddLinkDialogOpen(true)}
              disabled={availableLinksToAdd.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un lien
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {clientUsefulLinks.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Aucun lien utile assigné à ce client</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-slate-700">Image</th>
                    <th className="text-left p-2 font-medium text-slate-700">Titre</th>
                    <th className="text-left p-2 font-medium text-slate-700">URL</th>
                    <th className="text-left p-2 font-medium text-slate-700">Description</th>
                    <th className="text-right p-2 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientUsefulLinks.map((clientLink) => (
                    <tr key={clientLink.id} className="border-b hover:bg-slate-50">
                      <td className="p-2">
                        {clientLink.usefulLink.imageUrl ? (
                          <img src={clientLink.usefulLink.imageUrl} alt={clientLink.usefulLink.name} className="w-12 h-12 object-cover rounded" />
                        ) : (
                          <div className="w-12 h-12 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">
                            Pas d'image
                          </div>
                        )}
                      </td>
                      <td className="p-2 font-medium">{clientLink.usefulLink.name}</td>
                      <td className="p-2">
                        <a
                          href={clientLink.usefulLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {clientLink.usefulLink.button || clientLink.usefulLink.url}
                        </a>
                      </td>
                      <td className="p-2 text-slate-600">{clientLink.usefulLink.description}</td>
                      <td className="p-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveUsefulLink(clientLink.usefulLink.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Useful Link Dialog */}
      {isAddLinkDialogOpen && (
        <div className="modal-overlay" onClick={() => setIsAddLinkDialogOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">Ajouter un lien utile</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => setIsAddLinkDialogOpen(false)}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <div className="modal-form">
              <div className="modal-form-field">
                <Label>Sélectionner un lien utile</Label>
                <Select onValueChange={handleAddUsefulLink}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un lien utile" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLinksToAdd.map((link) => (
                      <SelectItem key={link.id} value={link.id}>
                        {link.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="modal-form-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddLinkDialogOpen(false)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

