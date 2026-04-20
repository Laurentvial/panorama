import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Trash2, X, FileText, Edit } from 'lucide-react';
import { apiCall } from '../utils/api';
import { formatAmount } from '../utils/currency';
import { toast } from 'sonner';
import '../styles/Modal.css';

interface ClientDocumentsTabProps {
  clientId: string;
  accountCurrency?: string;
  onRefresh: () => void;
}

interface Document {
  id: string;
  name: string;
  documentType: string;
  fileUrl: string;
  description: string;
  transactionId: string | null;
  productId?: string | null;
  productName?: string | null;
  uploadedBy: number | null;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
}

const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contrat' },
  { value: 'kyc', label: 'Document KYC' },
  { value: 'identity', label: 'Pièce d\'identité' },
  { value: 'address', label: 'Justificatif de domicile' },
  { value: 'financial', label: 'Document financier' },
  { value: 'other', label: 'Autre' },
];

export function ClientDocumentsTab({ clientId, accountCurrency = 'EUR', onRefresh }: ClientDocumentsTabProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  /** Catalogue complet : le contrat peut être rattaché à un produit même sans ClientProduct. */
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    documentType: 'other',
    description: '',
    transactionId: '',
    productId: '',
    createdAt: '',
    updatedAt: '',
    file: null as File | null,
  });

  const [editForm, setEditForm] = useState({
    name: '',
    documentType: 'other',
    description: '',
    transactionId: '',
    productId: '',
    createdAt: '',
    updatedAt: '',
    file: null as File | null, // optional replacement
  });

  const toDateDisplay = (value: string): string => {
    if (!value) return '';
    const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      // Avoid timezone shifts by formatting from the ISO date portion directly.
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return '';
      const da = String(d.getDate()).padStart(2, '0');
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      return `${da}/${mo}/${y}`;
    } catch {
      return '';
    }
  };

  // Parse DD/MM/YYYY -> {y,m,d} or null; validates real calendar dates
  const parseDate = (s: string): { y: number; m: number; d: number } | null => {
    const t = String(s || '').trim();
    const match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return { y: year, m: month, d: day };
  };

  const fromDateDisplayToISO = (value: string): string => {
    const parsed = parseDate(value);
    if (!parsed) return '';
    const mo = String(parsed.m).padStart(2, '0');
    const da = String(parsed.d).padStart(2, '0');
    return `${parsed.y}-${mo}-${da}T00:00:00`;
  };

  useEffect(() => {
    loadDocuments();
  }, [clientId]);

  useEffect(() => {
    async function loadTransferTransactions() {
      try {
        setLoadingTransactions(true);
        // Load all transactions by paginating through all pages to filter transfert type
        const allTransactions: any[] = [];
        let page = 1;
        const limit = 500; // Backend max limit
        let hasMore = true;

        while (hasMore) {
          const data = await apiCall(`/api/clients/${clientId}/transactions/?page=${page}&limit=${limit}`);
          const transactions = (data as any).transactions || [];
          allTransactions.push(...transactions);
          
          const pagination = (data as any).pagination;
          if (pagination && page >= pagination.total_pages) {
            hasMore = false;
          } else if (transactions.length < limit) {
            hasMore = false;
          } else {
            page++;
          }
        }
        
        // Filter only transfert transactions for contract linking
        setTransactions(allTransactions.filter((t: any) => t.type === 'transfert'));
      } catch (error) {
        console.error('Error loading transactions for documents:', error);
        setTransactions([]);
      } finally {
        setLoadingTransactions(false);
      }
    }
    loadTransferTransactions();
  }, [clientId]);

  useEffect(() => {
    async function loadCatalogProducts() {
      try {
        setLoadingProducts(true);
        const data = await apiCall('/api/products/');
        setCatalogProducts((data as any).products || []);
      } catch (error) {
        console.error('Error loading products for documents:', error);
        setCatalogProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    }
    loadCatalogProducts();
  }, []);

  async function loadDocuments() {
    try {
      setLoading(true);
      const data = await apiCall(`/api/clients/${clientId}/documents/`);
      setDocuments((data as any).documents || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast.error('Erreur lors du chargement des documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, file });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Le nom du document est requis');
      return;
    }
    
    if (!formData.file) {
      toast.error('Veuillez sélectionner un fichier');
      return;
    }
    if (formData.createdAt && !parseDate(formData.createdAt)) {
      toast.error('Format de date de création invalide. Utilisez JJ/MM/AAAA.');
      return;
    }
    if (formData.updatedAt && !parseDate(formData.updatedAt)) {
      toast.error('Format de date de mise à jour invalide. Utilisez JJ/MM/AAAA.');
      return;
    }

    setUploading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('documentType', formData.documentType);
      formDataToSend.append('description', formData.description);
      if (formData.transactionId) {
        formDataToSend.append('transactionId', formData.transactionId);
      }
      if (formData.productId) {
        formDataToSend.append('productId', formData.productId);
      }
      if (formData.createdAt) {
        formDataToSend.append('createdAt', fromDateDisplayToISO(formData.createdAt));
      }
      if (formData.updatedAt) {
        formDataToSend.append('updatedAt', fromDateDisplayToISO(formData.updatedAt));
      }
      formDataToSend.append('file', formData.file);

      const created = await apiCall(`/api/clients/${clientId}/documents/create/`, {
        method: 'POST',
        body: formDataToSend,
        // Don't set Content-Type header - browser will set it with boundary for FormData
      }) as any;

      toast.success('Document ajouté avec succès');
      setIsAddDialogOpen(false);
      setFormData({
        name: '',
        documentType: 'other',
        description: '',
        transactionId: '',
        productId: '',
        createdAt: '',
        updatedAt: '',
        file: null
      });
      // Instantly refresh list with the newly added document (optimistic update)
      const doc = (created as any)?.document ?? created;
      if (doc?.id) {
        setDocuments((prev) => [doc as Document, ...prev]);
      } else {
        loadDocuments();
      }
      onRefresh();
    } catch (error: any) {
      console.error('Error creating document:', error);
      toast.error(error?.message || 'Erreur lors de l\'ajout du document');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(documentId: string) {
    if (!confirm('Supprimer ce document ?')) return;

    // Optimistically remove from list for instant UI update
    setDocuments((prev) => prev.filter((d) => d.id !== documentId));

    try {
      await apiCall(`/api/clients/${clientId}/documents/${documentId}/delete/`, { method: 'DELETE' });
      toast.success('Document supprimé avec succès');
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error(error?.message || 'Erreur lors de la suppression du document');
      // Reload to restore correct state after error
      loadDocuments();
    }
  }

  function getDocumentTypeLabel(type: string): string {
    const docType = DOCUMENT_TYPES.find(dt => dt.value === type);
    return docType ? docType.label : 'Autre';
  }

  function formatDate(dateString: string): string {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  }

  function isImageFile(url: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return imageExtensions.some(ext => url.toLowerCase().includes(ext));
  }

  function isPdfFile(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('.pdf') || lowerUrl.endsWith('/pdf');
  }

  function renderDocumentFileLink(document: Document) {
    if (!document.fileUrl) {
      return <span className="text-slate-400">-</span>;
    }

    if (isImageFile(document.fileUrl)) {
      return (
        <a
          href={document.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          Voir l'image
        </a>
      );
    }

    if (isPdfFile(document.fileUrl)) {
      return (
        <a
          href={document.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline"
          onClick={async (e) => {
            e.preventDefault();
            if (document.fileUrl) {
              try {
                const newWindow = window.open(document.fileUrl, '_blank', 'noopener,noreferrer');
                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                  toast.error('Impossible d\'ouvrir le PDF. Veuillez vérifier les paramètres de votre navigateur.');
                }
              } catch (error) {
                console.error('Error opening PDF:', error);
                toast.error('Erreur lors de l\'ouverture du PDF');
              }
            }
          }}
        >
          Voir le contrat
        </a>
      );
    }

    return (
      <a
        href={document.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 hover:underline"
      >
        Télécharger
      </a>
    );
  }

  function formatTransactionLabel(transaction: any): string {
    if (!transaction) return '';
    const typeLabels: Record<string, string> = {
      'depot': 'Dépôt',
      'retrait': 'Retrait',
      'bonus': 'Bonus',
      'achat': 'Achat',
      'vente': 'Vente',
      'interets': 'Intérêts',
      'frais': 'Frais',
      'transfert': 'Transfert',
      'perte': 'Perte',
    };
    const typeLabel = typeLabels[transaction.type] || transaction.type;
    const date = new Date(transaction.datetime).toLocaleDateString('fr-FR');
    const curr = transaction.amountCurrency || accountCurrency;
    return `${typeLabel} - ${formatAmount(parseFloat(transaction.amount || 0), curr)} - ${date}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">Chargement des documents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Documents
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Aucun document</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-3">Nom</th>
                    <th className="text-left py-3 px-3">Type</th>
                    <th className="text-left py-3 px-3">Description</th>
                    <th className="text-left py-3 px-3">Transaction</th>
                    <th className="text-left py-3 px-3">Produit</th>
                    <th className="text-left py-3 px-3">Fichier</th>
                    <th className="text-left py-3 px-3">Ajouté le</th>
                    <th className="text-right py-3 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-3 font-medium text-slate-900">
                        {document.name}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded">
                          {getDocumentTypeLabel(document.documentType)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-md truncate" title={document.description || ''}>
                        {document.description || '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {document.transactionId || '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {document.productName || document.productId || '-'}
                      </td>
                      <td className="py-3 px-3">
                        {renderDocumentFileLink(document)}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {formatDate(document.createdAt)}
                        {document.uploadedByName ? ` par ${document.uploadedByName}` : ''}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingDocument(document);
                              setEditForm({
                                name: document.name || '',
                                documentType: document.documentType || 'other',
                                description: document.description || '',
                                transactionId: document.transactionId || '',
                                productId: document.productId || '',
                                createdAt: toDateDisplay(document.createdAt),
                                updatedAt: toDateDisplay(document.updatedAt),
                                file: null,
                              });
                              setIsEditDialogOpen(true);
                            }}
                            title="Modifier"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(document.id)}
                            className="text-red-600 hover:text-red-700"
                            title="Supprimer"
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

      {/* Add Document Dialog */}
      {isAddDialogOpen && (
        <div className="modal-overlay" onClick={() => setIsAddDialogOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">Ajouter un document</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setFormData({
                    name: '',
                    documentType: 'other',
                    description: '',
                    transactionId: '',
                    productId: '',
                    createdAt: '',
                    updatedAt: '',
                    file: null
                  });
                }}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-form-field">
                <Label htmlFor="document-name">Nom du document *</Label>
                <Input
                  id="document-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ex: Contrat d'ouverture de compte"
                />
              </div>
              
              <div className="modal-form-field">
                <Label htmlFor="document-type">Type de document *</Label>
                <Select
                  value={formData.documentType}
                  onValueChange={(value) => {
                    setFormData((prev) => ({
                      ...prev,
                      documentType: value,
                      ...(value !== 'contract' ? { transactionId: '', productId: '' } : {}),
                    }));
                  }}
                >
                  <SelectTrigger 
                    id="document-type"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent 
                    className="z-[1001]"
                    style={{ zIndex: 1001 }}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {formData.documentType === 'contract' && (
                <>
                  <div className="modal-form-field">
                    <Label htmlFor="document-transaction">Transaction (optionnel)</Label>
                    {(() => {
                      const transferTransactions = transactions.filter((t: any) => t.type === 'transfert');
                      return (
                        <Select
                          value={formData.transactionId || 'none'}
                          onValueChange={(value) => {
                            const tid = value === 'none' ? '' : value;
                            setFormData((prev) => ({
                              ...prev,
                              transactionId: tid,
                              ...(tid ? { productId: '' } : {}),
                            }));
                          }}
                        >
                          <SelectTrigger
                            id="document-transaction"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue placeholder="Sélectionner une transaction" />
                          </SelectTrigger>
                          <SelectContent className="z-[1001]" style={{ zIndex: 1001 }}>
                            <SelectItem value="none">Aucune</SelectItem>
                            {transferTransactions.map((transaction) => (
                              <SelectItem key={transaction.id} value={transaction.id}>
                                {formatTransactionLabel(transaction)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                    <p className="mt-1 text-xs text-slate-500">
                      Lié à une transaction de type « transfert », ou bien à un produit ci-dessous — pas les deux.
                    </p>
                  </div>
                  <div className="modal-form-field">
                    <Label htmlFor="document-product">Produit (optionnel)</Label>
                    <Select
                      value={formData.productId || 'none'}
                      onValueChange={(value) => {
                        const pid = value === 'none' ? '' : value;
                        setFormData((prev) => ({
                          ...prev,
                          productId: pid,
                          ...(pid ? { transactionId: '' } : {}),
                        }));
                      }}
                      disabled={loadingProducts}
                    >
                      <SelectTrigger id="document-product" onClick={(e) => e.stopPropagation()}>
                        <SelectValue
                          placeholder={
                            loadingProducts ? 'Chargement des produits…' : 'Sélectionner un produit'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="z-[1001]" style={{ zIndex: 1001 }}>
                        <SelectItem value="none">Aucun</SelectItem>
                        {catalogProducts
                          .filter((p: any) => p?.id)
                          .map((p: any) => {
                            const ref = p.reference ? ` (${p.reference})` : '';
                            return (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}
                                {ref}
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-slate-500">
                      Tout produit du catalogue peut être choisi (il n’a pas besoin d’être attribué au client).
                    </p>
                  </div>
                </>
              )}
              
              <div className="modal-form-field">
                <Label htmlFor="document-file">Fichier *</Label>
                <Input
                  id="document-file"
                  type="file"
                  onChange={handleFileChange}
                  required
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                />
                {formData.file && (
                  <p className="mt-1 text-sm text-slate-500">
                    Fichier sélectionné: {formData.file.name}
                  </p>
                )}
              </div>

              <div className="modal-form-field">
                <Label>Date de création (optionnel)</Label>
                <Input
                  type="text"
                  placeholder="JJ/MM/AAAA"
                  value={formData.createdAt}
                  onChange={(e) => setFormData({ ...formData, createdAt: e.target.value })}
                />
              </div>

              <div className="modal-form-field">
                <Label>Date de mise à jour (optionnel)</Label>
                <Input
                  type="text"
                  placeholder="JJ/MM/AAAA"
                  value={formData.updatedAt}
                  onChange={(e) => setFormData({ ...formData, updatedAt: e.target.value })}
                />
              </div>
              
              <div className="modal-form-field">
                <Label htmlFor="document-description">Description</Label>
                <Textarea
                  id="document-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description optionnelle du document"
                  rows={3}
                />
              </div>
              
              <div className="modal-form-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setFormData({
                      name: '',
                      documentType: 'other',
                      description: '',
                      transactionId: '',
                      productId: '',
                      createdAt: '',
                      updatedAt: '',
                      file: null
                    });
                  }}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? 'Ajout en cours...' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Document Dialog */}
      {isEditDialogOpen && editingDocument && (
        <div className="modal-overlay" onClick={() => {
          setIsEditDialogOpen(false);
          setEditingDocument(null);
          setSavingEdit(false);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem' }}>
            <div className="modal-header">
              <h2 className="modal-title">Modifier le document</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="modal-close"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingDocument(null);
                  setSavingEdit(false);
                }}
              >
                <X className="planning-icon-md" />
              </Button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editingDocument) return;
                if (savingEdit) return;
                if (!editForm.name.trim()) {
                  toast.error('Le nom du document est requis');
                  return;
                }
                if (!editForm.createdAt.trim() || !editForm.updatedAt.trim()) {
                  toast.error('Les dates (création et mise à jour) sont requises');
                  return;
                }
                if (!parseDate(editForm.createdAt) || !parseDate(editForm.updatedAt)) {
                  toast.error('Format de date invalide. Utilisez JJ/MM/AAAA.');
                  return;
                }
                setSavingEdit(true);
                try {
                  // Optional file replacement first
                  if (editForm.file) {
                    const fd = new FormData();
                    fd.append('file', editForm.file);
                    await apiCall(`/api/clients/${clientId}/documents/${editingDocument.id}/replace/`, {
                      method: 'POST',
                      body: fd,
                    });
                  }

                  const payload: any = {
                    name: editForm.name.trim(),
                    documentType: editForm.documentType,
                    description: editForm.description || '',
                    transactionId: editForm.transactionId || null,
                    productId: editForm.productId || null,
                    createdAt: fromDateDisplayToISO(editForm.createdAt),
                    updatedAt: fromDateDisplayToISO(editForm.updatedAt),
                  };

                  const updated = await apiCall(`/api/clients/${clientId}/documents/${editingDocument.id}/update/`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  }) as any;

                  const doc = (updated as any)?.document ?? updated;
                  if (doc?.id) {
                    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? (doc as Document) : d)));
                  } else {
                    await loadDocuments();
                  }
                  toast.success('Document modifié avec succès');
                  setIsEditDialogOpen(false);
                  setEditingDocument(null);
                  onRefresh();
                } catch (error: any) {
                  console.error('Error updating document:', error);
                  toast.error(error?.message || 'Erreur lors de la modification du document');
                } finally {
                  setSavingEdit(false);
                }
              }}
              className="modal-form"
            >
              <div className="modal-form-field">
                <Label>Nom du document *</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>

              <div className="modal-form-field">
                <Label>Type de document *</Label>
                <Select
                  value={editForm.documentType}
                  onValueChange={(value) => {
                    setEditForm((prev) => ({
                      ...prev,
                      documentType: value,
                      ...(value !== 'contract' ? { transactionId: '', productId: '' } : {}),
                    }));
                  }}
                >
                  <SelectTrigger onClick={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[1001]" style={{ zIndex: 1001 }}>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editForm.documentType === 'contract' && (
                <>
                  <div className="modal-form-field">
                    <Label>Transaction (optionnel)</Label>
                    <Select
                      value={editForm.transactionId || 'none'}
                      onValueChange={(value) => {
                        const tid = value === 'none' ? '' : value;
                        setEditForm((prev) => ({
                          ...prev,
                          transactionId: tid,
                          ...(tid ? { productId: '' } : {}),
                        }));
                      }}
                    >
                      <SelectTrigger onClick={(e) => e.stopPropagation()}>
                        <SelectValue placeholder="Sélectionner une transaction" />
                      </SelectTrigger>
                      <SelectContent className="z-[1001]" style={{ zIndex: 1001 }}>
                        <SelectItem value="none">Aucune</SelectItem>
                        {transactions
                          .filter((t: any) => t.type === 'transfert')
                          .map((t: any) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {formatTransactionLabel(t)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-slate-500">
                      Lié à une transaction de type « transfert », ou bien à un produit ci-dessous — pas les deux.
                    </p>
                  </div>

                  <div className="modal-form-field">
                    <Label>Produit (optionnel)</Label>
                    <Select
                      value={editForm.productId || 'none'}
                      onValueChange={(value) => {
                        const pid = value === 'none' ? '' : value;
                        setEditForm((prev) => ({
                          ...prev,
                          productId: pid,
                          ...(pid ? { transactionId: '' } : {}),
                        }));
                      }}
                      disabled={loadingProducts}
                    >
                      <SelectTrigger onClick={(e) => e.stopPropagation()}>
                        <SelectValue placeholder={loadingProducts ? 'Chargement des produits…' : 'Sélectionner un produit'} />
                      </SelectTrigger>
                      <SelectContent className="z-[1001]" style={{ zIndex: 1001 }}>
                        <SelectItem value="none">Aucun</SelectItem>
                        {catalogProducts
                          .filter((p: any) => p?.id)
                          .map((p: any) => {
                            const ref = p.reference ? ` (${p.reference})` : '';
                            return (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}
                                {ref}
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="modal-form-field">
                <Label>Remplacer le fichier (optionnel)</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setEditForm((p) => ({ ...p, file }));
                  }}
                />
                {editForm.file && (
                  <p className="mt-1 text-sm text-slate-500">
                    Fichier sélectionné: {editForm.file.name}
                  </p>
                )}
              </div>

              <div className="modal-form-field">
                <Label>Date de création *</Label>
                <Input
                  type="text"
                  value={editForm.createdAt}
                  onChange={(e) => setEditForm((p) => ({ ...p, createdAt: e.target.value }))}
                  placeholder="JJ/MM/AAAA"
                  required
                />
              </div>

              <div className="modal-form-field">
                <Label>Date de mise à jour *</Label>
                <Input
                  type="text"
                  value={editForm.updatedAt}
                  onChange={(e) => setEditForm((p) => ({ ...p, updatedAt: e.target.value }))}
                  placeholder="JJ/MM/AAAA"
                  required
                />
              </div>

              <div className="modal-form-field">
                <Label>Description</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="modal-form-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingDocument(null);
                    setSavingEdit(false);
                  }}
                  disabled={savingEdit}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
