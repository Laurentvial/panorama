import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select';
import { Plus, Search, Trash2, Pencil, X } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import LoadingIndicator from './LoadingIndicator';
import '../styles/Modal.css';
import '../styles/PageHeader.css';

type CryptoOption = {
  symbol: string;
  name: string;
  logoUrl: string;
  networks: string[];
};

const CRYPTO_OPTIONS: CryptoOption[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    logoUrl: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
    networks: ['Bitcoin'],
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    logoUrl: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    networks: ['ERC20'],
  },
  {
    symbol: 'USDT',
    name: 'Tether USDt',
    logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    networks: ['ERC20', 'TRC20', 'BEP20'],
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    networks: ['ERC20', 'TRC20', 'BEP20'],
  },
  {
    symbol: 'BNB',
    name: 'BNB',
    logoUrl: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
    networks: ['BEP20'],
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    logoUrl: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
    networks: ['Solana'],
  },
  {
    symbol: 'XRP',
    name: 'XRP',
    logoUrl: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
    networks: ['XRP Ledger'],
  },
  {
    symbol: 'ADA',
    name: 'Cardano',
    logoUrl: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
    networks: ['Cardano'],
  },
];

const FALLBACK_NETWORKS = ['ERC20', 'TRC20', 'BEP20', 'Bitcoin', 'Solana', 'XRP Ledger', 'Cardano'];

export function ManageWallets() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    assetSymbol: '',
    network: '',
    walletAddress: '',
    memoOrTag: '',
    default: false,
  });

  useEffect(() => {
    loadWallets();
  }, []);

  async function loadWallets() {
    try {
      setLoading(true);
      const data = await apiCall('/api/wallets/');
      setWallets((data as any).wallets || []);
    } catch (error) {
      console.error('Error loading wallets:', error);
      toast.error('Erreur lors du chargement des wallets');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenDialog(wallet?: any) {
    if (wallet) {
      setEditingWallet(wallet);
      setFormData({
        name: wallet.name || '',
        assetSymbol: wallet.assetSymbol || '',
        network: wallet.network || '',
        walletAddress: wallet.walletAddress || '',
        memoOrTag: wallet.memoOrTag || '',
        default: wallet.default || false,
      });
    } else {
      setEditingWallet(null);
      setFormData({
        name: '',
        assetSymbol: '',
        network: '',
        walletAddress: '',
        memoOrTag: '',
        default: false,
      });
    }
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
    setEditingWallet(null);
    setFormData({
      name: '',
      assetSymbol: '',
      network: '',
      walletAddress: '',
      memoOrTag: '',
      default: false,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.assetSymbol || !formData.network) {
      toast.error('Veuillez selectionner le symbole crypto et le reseau');
      return;
    }
    const payload = {
      ...formData,
      assetSymbol: (formData.assetSymbol || '').trim().toUpperCase(),
      network: (formData.network || '').trim(),
      walletAddress: (formData.walletAddress || '').trim(),
      memoOrTag: (formData.memoOrTag || '').trim(),
    };
    try {
      if (editingWallet) {
        await apiCall(`/api/wallets/${editingWallet.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
        toast.success('Wallet modifié avec succès');
      } else {
        await apiCall('/api/wallets/create/', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
        toast.success('Wallet créé avec succès');
      }
      handleCloseDialog();
      loadWallets();
    } catch (error: any) {
      console.error('Error saving wallet:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(walletId: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce wallet ?')) return;

    try {
      await apiCall(`/api/wallets/${walletId}/delete/`, { method: 'DELETE' });
      toast.success('Wallet supprimé avec succès');
      loadWallets();
    } catch (error) {
      console.error('Error deleting wallet:', error);
      toast.error('Erreur lors de la suppression');
    }
  }

  const filteredWallets = wallets.filter((wallet) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      wallet.name?.toLowerCase().includes(searchLower) ||
      wallet.assetSymbol?.toLowerCase().includes(searchLower) ||
      wallet.network?.toLowerCase().includes(searchLower) ||
      wallet.walletAddress?.toLowerCase().includes(searchLower) ||
      wallet.memoOrTag?.toLowerCase().includes(searchLower)
    );
  });

  const selectedCrypto = CRYPTO_OPTIONS.find((c) => c.symbol === formData.assetSymbol) || null;
  const networkOptions = selectedCrypto?.networks?.length ? selectedCrypto.networks : FALLBACK_NETWORKS;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingIndicator />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-title-section">
          <h1 className="page-title">Gestion des wallets</h1>
          <p className="page-subtitle">Gerer les wallets crypto disponibles pour les clients</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un wallet
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              className="pl-10"
              placeholder="Rechercher par nom, symbole, reseau ou adresse..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liste des wallets ({filteredWallets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredWallets.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Aucun wallet trouve</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-slate-700">Nom</th>
                    <th className="text-left p-2 font-medium text-slate-700">Symbole</th>
                    <th className="text-left p-2 font-medium text-slate-700">Reseau</th>
                    <th className="text-left p-2 font-medium text-slate-700">Adresse wallet</th>
                    <th className="text-left p-2 font-medium text-slate-700">Memo / Tag</th>
                    <th className="text-left p-2 font-medium text-slate-700">Par defaut</th>
                    <th className="text-right p-2 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWallets.map((wallet) => (
                    <tr key={wallet.id} className="border-b hover:bg-slate-50">
                      <td className="p-2">{wallet.name}</td>
                      <td className="p-2 font-mono text-sm">{wallet.assetSymbol || '-'}</td>
                      <td className="p-2">{wallet.network || '-'}</td>
                      <td className="p-2 font-mono text-sm break-all max-w-[220px]">{wallet.walletAddress || '-'}</td>
                      <td className="p-2 font-mono text-sm">{wallet.memoOrTag || '-'}</td>
                      <td className="p-2">
                        {wallet.default ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Oui</span>
                        ) : (
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-sm">Non</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(wallet)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(wallet.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isDialogOpen && (
        <div className="modal-overlay" onClick={handleCloseDialog}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">{editingWallet ? 'Modifier le wallet' : 'Creer un nouveau wallet'}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={handleCloseDialog}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-form-field">
                <Label htmlFor="name">Nom *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="modal-form-field">
                <Label htmlFor="assetSymbol">Symbole crypto *</Label>
                <Select
                  value={formData.assetSymbol}
                  onValueChange={(value) => {
                    const picked = CRYPTO_OPTIONS.find((c) => c.symbol === value);
                    setFormData((prev) => ({
                      ...prev,
                      assetSymbol: value,
                      network:
                        picked && picked.networks.includes(prev.network)
                          ? prev.network
                          : (picked?.networks?.[0] || ''),
                    }));
                  }}
                >
                  <SelectTrigger id="assetSymbol">
                    {selectedCrypto ? (
                      <span className="flex items-center gap-2">
                        <img
                          src={selectedCrypto.logoUrl}
                          alt={`${selectedCrypto.symbol} logo`}
                          className="w-4 h-4 rounded-full object-cover"
                        />
                        <span>{selectedCrypto.symbol} - {selectedCrypto.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">Selectionner un symbole</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {CRYPTO_OPTIONS.map((crypto) => (
                      <SelectItem key={crypto.symbol} value={crypto.symbol}>
                        <span className="flex items-center gap-2">
                          <img
                            src={crypto.logoUrl}
                            alt={`${crypto.symbol} logo`}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                          <span>{crypto.symbol} - {crypto.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="modal-form-field">
                <Label htmlFor="network">Reseau *</Label>
                <Select
                  value={formData.network}
                  onValueChange={(value) => setFormData({ ...formData, network: value })}
                >
                  <SelectTrigger id="network">
                    {formData.network ? (
                      <span>{formData.network}</span>
                    ) : (
                      <span className="text-slate-500">Selectionner un reseau</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {networkOptions.map((network) => (
                      <SelectItem key={network} value={network}>
                        {network}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="modal-form-field">
                <Label htmlFor="walletAddress">Adresse wallet *</Label>
                <Input
                  id="walletAddress"
                  value={formData.walletAddress}
                  onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                  placeholder="0x... ou adresse reseau"
                  required
                />
              </div>
              <div className="modal-form-field">
                <Label htmlFor="memoOrTag">Memo / Tag</Label>
                <Input
                  id="memoOrTag"
                  value={formData.memoOrTag}
                  onChange={(e) => setFormData({ ...formData, memoOrTag: e.target.value })}
                  placeholder="Optionnel selon le reseau"
                />
              </div>
              <div className="modal-form-field">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="default"
                    checked={formData.default}
                    onChange={(e) => setFormData({ ...formData, default: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="default">Disponible par defaut pour tous les clients</Label>
                </div>
              </div>
              <div className="modal-form-actions">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Annuler
                </Button>
                <Button type="submit">{editingWallet ? 'Modifier' : 'Creer'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
