import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Trash2, X, FileText } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import '../styles/Modal.css';

interface ClientDocumentsTabProps {
  clientId: string;
  onRefresh: () => void;
}

interface Document {
  id: string;
  name: string;
  documentType: string;
  fileUrl: string;
  description: string;
  transactionId: string | null;
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

export function ClientDocumentsTab({ clientId, onRefresh }: ClientDocumentsTabProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    documentType: 'other',
    description: '',
    transactionId: '',
    file: null as File | null,
  });

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

    // Validate: contracts must be linked to a transaction
    if (formData.documentType === 'contract' && !formData.transactionId) {
      toast.error('Un contrat doit être lié à une transaction');
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
      formDataToSend.append('file', formData.file);

      await apiCall(`/api/clients/${clientId}/documents/create/`, {
        method: 'POST',
        body: formDataToSend,
        // Don't set Content-Type header - browser will set it with boundary for FormData
      });

      toast.success('Document ajouté avec succès');
      setIsAddDialogOpen(false);
      setFormData({ name: '', documentType: 'other', description: '', transactionId: '', file: null });
      loadDocuments();
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
    
    try {
      await apiCall(`/api/clients/${clientId}/documents/${documentId}/delete/`, { method: 'DELETE' });
      toast.success('Document supprimé avec succès');
      loadDocuments();
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error(error?.message || 'Erreur lors de la suppression du document');
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
    return `${typeLabel} - ${transaction.amount}€ - ${date}`;
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
                      <td className="py-3 px-3">
                        {renderDocumentFileLink(document)}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {formatDate(document.createdAt)}
                        {document.uploadedByName ? ` par ${document.uploadedByName}` : ''}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(document.id)}
                          className="text-red-600 hover:text-red-700"
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
                  setFormData({ name: '', documentType: 'other', description: '', file: null });
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
                    setFormData({ ...formData, documentType: value });
                    // Clear transaction if not a contract
                    if (value !== 'contract') {
                      setFormData(prev => ({ ...prev, transactionId: '' }));
                    }
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
                <div className="modal-form-field">
                  <Label htmlFor="document-transaction">Transaction *</Label>
                  {(() => {
                    const transferTransactions = transactions.filter((t: any) => t.type === 'transfert');
                    if (transferTransactions.length === 0) {
                      return (
                        <div>
                          <p className="text-sm text-slate-500 mb-2">
                            Aucune transaction de type "transfert" disponible pour ce client.
                          </p>
                          <p className="text-xs text-slate-400">
                            Les contrats doivent être liés à une transaction de type "transfert".
                          </p>
                        </div>
                      );
                    }
                    return (
                      <Select
                        value={formData.transactionId}
                        onValueChange={(value) => setFormData({ ...formData, transactionId: value })}
                      >
                        <SelectTrigger 
                          id="document-transaction"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue placeholder="Sélectionner une transaction" />
                        </SelectTrigger>
                        <SelectContent 
                          className="z-[1001]"
                          style={{ zIndex: 1001 }}
                        >
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
                    Les contrats doivent être liés à une transaction de type "transfert"
                  </p>
                </div>
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
                    setFormData({ name: '', documentType: 'other', description: '', transactionId: '', file: null });
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
    </div>
  );
}
