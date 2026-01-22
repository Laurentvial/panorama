import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { TRANSACTION_TYPES, STATUS_LABELS } from './transactionUtils';
import '../styles/Modal.css';

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: any;
  clientId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditTransactionModal({
  isOpen,
  transaction,
  clientId,
  onClose,
  onSuccess
}: EditTransactionModalProps) {
  const [transactionForm, setTransactionForm] = useState({
    type: 'depot',
    amount: '',
    description: '',
    status: 'en_attente_paiement',
    datetime: ''
  });

  // Initialize form when transaction changes
  useEffect(() => {
    if (isOpen && transaction) {
      const transactionDate = new Date(transaction.datetime || transaction.createdAt);
      const year = transactionDate.getFullYear();
      const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
      const day = String(transactionDate.getDate()).padStart(2, '0');
      const hours = String(transactionDate.getHours()).padStart(2, '0');
      const minutes = String(transactionDate.getMinutes()).padStart(2, '0');
      const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
      
      setTransactionForm({
        type: transaction.type,
        amount: transaction.amount?.toString() || '',
        description: transaction.description || '',
        status: transaction.status || 'en_cours',
        datetime: datetimeLocal
      });
    }
  }, [isOpen, transaction]);

  // Update status when type changes
  useEffect(() => {
    if (isOpen && transactionForm.type) {
      const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
      if (typeConfig && !typeConfig.statuses.includes(transactionForm.status)) {
        setTransactionForm(prev => ({ ...prev, status: typeConfig.statuses[0] }));
      }
    }
  }, [transactionForm.type, transactionForm.status, isOpen]);

  const getAvailableStatuses = () => {
    const typeConfig = TRANSACTION_TYPES[transactionForm.type as keyof typeof TRANSACTION_TYPES];
    return typeConfig ? typeConfig.statuses : [];
  };

  const handleClose = () => {
    setTransactionForm({
      type: 'depot',
      amount: '',
      description: '',
      status: 'en_attente_paiement',
      datetime: ''
    });
    onClose();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!transaction) return;
    
    if (!transactionForm.datetime) {
      toast.error('La date et l\'heure sont requises');
      return;
    }

    if (!transactionForm.amount || parseFloat(transactionForm.amount) <= 0) {
      toast.error('Le montant doit être supérieur à 0');
      return;
    }
    
    try {
      // Convert datetime-local format to ISO string
      const datetimeISO = new Date(transactionForm.datetime).toISOString();
      
      await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
        method: 'PUT',
        body: JSON.stringify({
          type: transactionForm.type,
          amount: parseFloat(transactionForm.amount),
          description: transactionForm.description,
          status: transactionForm.status,
          datetime: datetimeISO
        })
      });
      
      toast.success('Transaction modifiée avec succès');
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      toast.error(error.message || 'Erreur lors de la modification de la transaction');
    }
  }

  if (!isOpen || !transaction) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Modifier la transaction</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="modal-close"
            onClick={handleClose}
          >
            <X className="planning-icon-md" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-form-field">
            <Label>Type</Label>
            <Select value={transactionForm.type} onValueChange={(value) => setTransactionForm({ ...transactionForm, type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRANSACTION_TYPES).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="modal-form-field">
            <Label>Date et heure</Label>
            <Input
              type="datetime-local"
              value={transactionForm.datetime}
              onChange={(e) => setTransactionForm({ ...transactionForm, datetime: e.target.value })}
              required
            />
          </div>
          <div className="modal-form-field">
            <Label>Montant (€)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={transactionForm.amount}
              onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
              required
            />
          </div>
          <div className="modal-form-field">
            <Label>Description</Label>
            <Textarea
              value={transactionForm.description}
              onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
              placeholder="Description de la transaction"
            />
          </div>
          <div className="modal-form-field">
            <Label>Statut</Label>
            <Select value={transactionForm.status} onValueChange={(value) => setTransactionForm({ ...transactionForm, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getAvailableStatuses().map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="modal-form-actions">
            <Button type="button" variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
