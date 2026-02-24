import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Plus, Trash2, X, CreditCard, Link as LinkIcon, Wallet, MessageSquare, FileText } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import '../styles/Modal.css';

interface ClientMiscTabProps {
  clientId: string;
  client: any;
  clientRibs: any[];
  availableRibs: any[];
  clientUsefulLinks: any[];
  availableUsefulLinks: any[];
  onRefresh: () => void;
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
  const [isAddRibDialogOpen, setIsAddRibDialogOpen] = useState(false);
  const [isAddLinkDialogOpen, setIsAddLinkDialogOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [savingPaymentMethods, setSavingPaymentMethods] = useState(false);
  const [tradingEnabled, setTradingEnabled] = useState<boolean>(true);
  const [savingTradingEnabled, setSavingTradingEnabled] = useState(false);
  const [contractPreviewEnabled, setContractPreviewEnabled] = useState<boolean>(true);
  const [savingContractPreviewEnabled, setSavingContractPreviewEnabled] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string>('');
  const [savingBannerMessage, setSavingBannerMessage] = useState(false);

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
      setTradingEnabled(true); // Default to true
    }
  }, [client]);

  // Initialize contract preview enabled from client data
  useEffect(() => {
    if (client?.contractPreviewEnabled !== undefined) {
      setContractPreviewEnabled(client.contractPreviewEnabled);
    } else {
      setContractPreviewEnabled(true); // Default to true
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

  async function handleSaveContractPreviewEnabled() {
    setSavingContractPreviewEnabled(true);
    try {
      await apiCall(`/api/clients/${clientId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ contractPreviewEnabled: contractPreviewEnabled }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('Paramètre de prévisualisation du contrat mis à jour avec succès');
      onRefresh();
    } catch (error: any) {
      console.error('Error saving contract preview enabled:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour du paramètre');
      if (client?.contractPreviewEnabled !== undefined) {
        setContractPreviewEnabled(client.contractPreviewEnabled);
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

  async function handleAddRib(ribId: string) {
    try {
      await apiCall(`/api/clients/${clientId}/ribs/add/`, {
        method: 'POST',
        body: JSON.stringify({ ribId }),
        headers: { 'Content-Type': 'application/json' }
      });
      toast.success('RIB ajouté avec succès');
      setIsAddRibDialogOpen(false);
      onRefresh();
    } catch (error: any) {
      console.error('Error adding RIB:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout du RIB');
    }
  }

  async function handleRemoveRib(ribId: string) {
    if (!confirm('Retirer ce RIB du client ?')) return;
    
    try {
      await apiCall(`/api/clients/${clientId}/ribs/${ribId}/`, { method: 'DELETE' });
      toast.success('RIB retiré avec succès');
      onRefresh();
    } catch (error) {
      console.error('Error removing RIB:', error);
      toast.error('Erreur lors du retrait du RIB');
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

  // Filter available RIBs that are not already assigned
  const availableRibsToAdd = availableRibs.filter(
    (rib) => !clientRibs.some((cr) => cr.rib.id === rib.id)
  );

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
                onCheckedChange={(checked) => setContractPreviewEnabled(checked === true)}
              />
              <Label htmlFor="contractPreviewEnabled" className="font-normal cursor-pointer">
                Prévisualisation du contrat
              </Label>
            </div>
            <p className="text-xs text-slate-500">
              Si désactivé, le client ne verra pas le bouton "Voir le contrat" lors de la souscription à un produit.
            </p>
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
            <div className="space-y-2">
              <Label htmlFor="bannerMessage">Message de bannière</Label>
              <Textarea
                id="bannerMessage"
                value={bannerMessage}
                onChange={(e) => setBannerMessage(e.target.value)}
                placeholder="Entrez le message à afficher sur la plateforme du client..."
                rows={4}
                className="w-full"
              />
            </div>
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

      {/* RIBs Section */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              RIBs
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setIsAddRibDialogOpen(true)}
              disabled={availableRibsToAdd.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un RIB
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {clientRibs.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Aucun RIB assigné à ce client</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-slate-700">Nom</th>
                    <th className="text-left p-2 font-medium text-slate-700">Code banque</th>
                    <th className="text-left p-2 font-medium text-slate-700">Code guichet</th>
                    <th className="text-left p-2 font-medium text-slate-700">N° compte</th>
                    <th className="text-left p-2 font-medium text-slate-700">Clé RIB</th>
                    <th className="text-left p-2 font-medium text-slate-700">Domiciliation</th>
                    <th className="text-right p-2 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRibs.map((clientRib) => (
                    <tr key={clientRib.id} className="border-b hover:bg-slate-50">
                      <td className="p-2">{clientRib.rib.name}</td>
                      <td className="p-2 font-mono text-sm">{clientRib.rib.bankCode}</td>
                      <td className="p-2 font-mono text-sm">{clientRib.rib.branchCode}</td>
                      <td className="p-2 font-mono text-sm">{clientRib.rib.accountNumber}</td>
                      <td className="p-2 font-mono text-sm">{clientRib.rib.ribKey}</td>
                      <td className="p-2">{clientRib.rib.domiciliation}</td>
                      <td className="p-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRib(clientRib.rib.id)}
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

      {/* Add RIB Dialog */}
      {isAddRibDialogOpen && (
        <div className="modal-overlay" onClick={() => setIsAddRibDialogOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">Ajouter un RIB</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => setIsAddRibDialogOpen(false)}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <div className="modal-form">
              <div className="modal-form-field">
                <Label>Sélectionner un RIB</Label>
                <Select onValueChange={handleAddRib}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un RIB" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRibsToAdd.map((rib) => (
                      <SelectItem key={rib.id} value={rib.id}>
                        {rib.name} - {rib.bankCode} {rib.branchCode} {rib.accountNumber} {rib.ribKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="modal-form-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddRibDialogOpen(false)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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

