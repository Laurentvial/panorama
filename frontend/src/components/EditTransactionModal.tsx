import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { X, Trash2 } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { TRANSACTION_TYPES, STATUS_LABELS } from './transactionUtils';
import { PositionGenerationModal } from './PositionGenerationModal';
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
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<string | null>(null);
  const [isWithdrawalTransaction, setIsWithdrawalTransaction] = useState(false);

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
    
    // Check if this is a transfert transaction changing to "termine"
    // Only show modal if status is changing FROM something else TO "termine"
    // If status was already "termine", no need to regenerate positions
    const isTransfert = transactionForm.type === 'transfert';
    const wasAlreadyTermine = transaction.status === 'termine';
    const isChangingToTermine = transactionForm.status === 'termine' && 
                                 !wasAlreadyTermine;
    
    if (isTransfert && isChangingToTermine) {
      // Check multiple possible field names for transfer_to (as returned by serializer)
      const transferTo = transaction.transfer_to || 
                         transaction.to_field || 
                         transaction.to || 
                         transaction.transferTo ||
                         transaction.productId ||
                         transaction.product_id ||
                         null;
      
      // Also check subscription_details for productId
      const productIdFromSubscription = transaction.subscription_details?.productId || 
                                        transaction.subscriptionDetails?.productId ||
                                        null;
      
      const finalProductId = transferTo || productIdFromSubscription;
      
      // Check if this is an investment (transfert to product) or withdrawal (transfert from product to balance)
      const isInvestment = finalProductId && 
                           String(finalProductId) !== 'balance' &&
                           String(finalProductId) !== 'trading';
      
      // Check if this is a withdrawal (transfert from product to balance)
      const transferFrom = transaction.transfer_from || transaction.from_field || null;
      const isWithdrawal = (transferTo === 'balance' || transferFrom !== null) && !isInvestment;
      
      // Debug logging
      console.log('EditTransactionModal - Checking transfert:', {
        type: transactionForm.type,
        transferTo,
        transferFrom,
        productIdFromSubscription,
        finalProductId,
        isInvestment,
        isWithdrawal,
        currentStatus: transaction.status,
        newStatus: transactionForm.status,
        isChangingToTermine
      });
      
      if (isInvestment) {
        // Show position generation modal for investments
        console.log('EditTransactionModal - Showing position generation modal for investment');
        setIsWithdrawalTransaction(false);
        setPendingStatusUpdate(transactionForm.status);
        setShowPositionModal(true);
        return;
      } else if (isWithdrawal) {
        // Show modal for withdrawals too, but with different content
        console.log('EditTransactionModal - Showing position generation modal for withdrawal');
        setIsWithdrawalTransaction(true);
        setPendingStatusUpdate(transactionForm.status);
        setShowPositionModal(true);
        return;
      }
    }
    
    try {
      // Convert datetime-local format to ISO string
      const datetimeISO = new Date(transactionForm.datetime).toISOString();
      
      // Check if this is a withdrawal (transfert from product to balance)
      // Only recalculate if status is changing TO "termine" (not if it was already "termine")
      const transferTo = transaction.transfer_to || 
                         transaction.to_field || 
                         transaction.to || 
                         transaction.transferTo ||
                         null;
      const transferFrom = transaction.transfer_from || transaction.from_field || null;
      const wasAlreadyTermine = transaction.status === 'termine';
      const isWithdrawal = transactionForm.type === 'transfert' && 
                          transactionForm.status === 'termine' &&
                          !wasAlreadyTermine && // Only if status is changing TO "termine"
                          (transferTo === 'balance' || (transferFrom && transferFrom !== 'balance'));
      
      await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
        method: 'PUT',
        body: JSON.stringify({
          type: transactionForm.type,
          amount: parseFloat(transactionForm.amount),
          description: transactionForm.description,
          status: transactionForm.status,
          datetime: datetimeISO,
          skip_position_generation: wasAlreadyTermine // Skip if already "termine" (no regeneration needed)
        })
      });
      
      if (isWithdrawal) {
        toast.success('Transaction modifiée avec succès. Les positions des autres transactions d\'investissement sur ce produit seront recalculées automatiquement.');
      } else {
        toast.success('Transaction modifiée avec succès');
      }
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      toast.error(error.message || 'Erreur lors de la modification de la transaction');
    }
  }

  const handlePositionModalSuccess = async () => {
    // After positions are generated (or withdrawal confirmed), update transaction status to termine
    if (pendingStatusUpdate) {
      try {
        const datetimeISO = new Date(transactionForm.datetime).toISOString();
        
        await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/`, {
          method: 'PUT',
          body: JSON.stringify({
            type: transactionForm.type,
            amount: parseFloat(transactionForm.amount),
            description: transactionForm.description,
            status: pendingStatusUpdate,
            datetime: datetimeISO,
            skip_position_generation: !isWithdrawalTransaction // For withdrawals, allow signal to recalculate; for investments, skip since modal already generated
          })
        });
        
        // Show toast for both investments and withdrawals
        if (isWithdrawalTransaction) {
          toast.success('Transaction modifiée avec succès. Les positions des autres transactions d\'investissement sur ce produit seront recalculées automatiquement.');
        } else {
          toast.success('Transaction modifiée avec succès');
        }
        setShowPositionModal(false);
        setPendingStatusUpdate(null);
        setIsWithdrawalTransaction(false);
        handleClose();
        onSuccess();
      } catch (error: any) {
        console.error('Error updating transaction after position generation:', error);
        toast.error(error.message || 'Erreur lors de la mise à jour de la transaction');
      }
    }
  };

  const handlePositionModalClose = () => {
    setShowPositionModal(false);
    setPendingStatusUpdate(null);
  };

  const handleDelete = async () => {
    if (!transaction) return;
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette transaction ? Cette action est irréversible.')) {
      return;
    }

    try {
      await apiCall(`/api/clients/${clientId}/transactions/${transaction.id}/delete/`, {
        method: 'DELETE'
      });
      
      toast.success('Transaction supprimée avec succès');
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      toast.error(error.message || 'Erreur lors de la suppression de la transaction');
    }
  };

  if (!isOpen || !transaction) return null;

  return (
    <>
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
              {transaction.status !== 'termine' && (
                <Button 
                  type="button" 
                  variant="destructive" 
                  onClick={handleDelete}
                  style={{ marginRight: 'auto' }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </div>
      </div>
      
      {showPositionModal && (
        <PositionGenerationModal
          isOpen={showPositionModal}
          transaction={transaction}
          clientId={clientId}
          onClose={handlePositionModalClose}
          onSuccess={handlePositionModalSuccess}
          isWithdrawal={isWithdrawalTransaction}
        />
      )}
    </>
  );
}
