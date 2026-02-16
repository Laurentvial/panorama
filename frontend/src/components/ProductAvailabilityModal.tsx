import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { DateInput } from './ui/date-input';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import '../styles/Modal.css';

interface ProductAvailabilityModalProps {
  clientId: string;
  clientProduct: {
    id: string;
    productId: string;
    product: {
      name: string;
      reference: string;
      availabilityStart?: string;
      availabilityEnd?: string;
    };
    availabilityStart?: string;
    availabilityEnd?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductAvailabilityModal({
  clientId,
  clientProduct,
  isOpen,
  onClose,
  onSuccess,
}: ProductAvailabilityModalProps) {
  const [availabilityStart, setAvailabilityStart] = useState<string>('');
  const [availabilityEnd, setAvailabilityEnd] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format date from YYYY-MM-DD to DD/MM/YYYY
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  useEffect(() => {
    if (isOpen) {
      setAvailabilityStart(clientProduct.availabilityStart || '');
      setAvailabilityEnd(clientProduct.availabilityEnd || '');
    }
  }, [isOpen, clientProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await apiCall(`/api/clients/${clientId}/products/${clientProduct.productId}/availability/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityStart: availabilityStart || null,
          availabilityEnd: availabilityEnd || null,
        }),
      });

      toast.success('Dates de disponibilité mises à jour avec succès');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating availability:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour des dates');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearDates = async () => {
    setIsSubmitting(true);

    try {
      await apiCall(`/api/clients/${clientId}/products/${clientProduct.productId}/availability/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityStart: null,
          availabilityEnd: null,
        }),
      });

      toast.success('Dates de disponibilité effacées');
      setAvailabilityStart('');
      setAvailabilityEnd('');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error clearing availability:', error);
      toast.error(error.message || 'Erreur lors de l\'effacement des dates');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Dates de disponibilité du produit</h2>
          <button onClick={onClose} className="modal-close-button">
            <X size={20} />
          </button>
        </div>

        <div className="modal-content">
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Produit: <span className="font-bold">{clientProduct.product.name}</span>
            </p>
            {clientProduct.product.reference && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Référence: {clientProduct.product.reference}
              </p>
            )}
          </div>

          {/* Show product default dates if they exist */}
          {(clientProduct.product.availabilityStart || clientProduct.product.availabilityEnd) && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                📅 Dates par défaut du produit:
              </p>
              {clientProduct.product.availabilityStart && (
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  • Début: {formatDate(clientProduct.product.availabilityStart)}
                </p>
              )}
              {clientProduct.product.availabilityEnd && (
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  • Fin: {formatDate(clientProduct.product.availabilityEnd)}
                </p>
              )}
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-2 italic">
                Les dates ci-dessous remplaceront ces dates par défaut pour ce client uniquement.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product-availability-start">
                  Début de disponibilité (pour ce client)
                  <span className="text-xs text-gray-500 ml-2">(Optionnel)</span>
                </Label>
                <DateInput
                  id="product-availability-start"
                  value={availabilityStart}
                  onChange={setAvailabilityStart}
                  placeholder="jj/mm/aaaa"
                />
                <p className="text-xs text-gray-500">
                  Si vide, utilise la date par défaut du produit (ou disponible dès maintenant)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-availability-end">
                  Fin de disponibilité (pour ce client)
                  <span className="text-xs text-gray-500 ml-2">(Optionnel)</span>
                </Label>
                <DateInput
                  id="product-availability-end"
                  value={availabilityEnd}
                  onChange={setAvailabilityEnd}
                  placeholder="jj/mm/aaaa"
                />
                <p className="text-xs text-gray-500">
                  Si vide, utilise la date par défaut du produit (ou disponible indéfiniment)
                </p>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <strong>Priorité:</strong> Les dates spécifiques au client sont prioritaires sur les dates par défaut du produit.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={handleClearDates}
                disabled={isSubmitting || (!availabilityStart && !availabilityEnd)}
                className="text-sm text-blue-600 hover:text-blue-800 underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed mb-4"
              >
                Effacer les dates
              </button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
