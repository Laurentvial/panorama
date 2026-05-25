import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { DateInput } from './ui/date-input';
import { Textarea } from './ui/textarea';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import '../styles/Modal.css';

interface ProductAvailabilityModalProps {
  clientId: string;
  clientProduct: {
    id: string;
    productId?: string;
    isCustomized?: boolean;
    overrides?: Record<string, unknown> | null;
    baseProduct?: {
      name?: string;
      reference?: string;
      minEntryValue?: number | null;
      maxEntryValue?: number | null;
      profitability?: number | null;
      noProfitability?: boolean;
      isVariableProfitability?: string;
      variableProfitability?: number | string | null;
      profitabilityPeriod?: string;
      description?: string;
      cgv?: string;
      availabilityStart?: string;
      availabilityEnd?: string;
    } | null;
    product: {
      id?: string;
      name: string;
      reference?: string;
      minEntryValue?: number | null;
      maxEntryValue?: number | null;
      profitability?: number | null;
      noProfitability?: boolean;
      isVariableProfitability?: string;
      variableProfitability?: number | string | null;
      profitabilityPeriod?: string;
      description?: string;
      cgv?: string;
      availabilityStart?: string;
      availabilityEnd?: string;
    };
    availabilityStart?: string;
    availabilityEnd?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedClientProduct?: any) => void;
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
  const [minEntryOverride, setMinEntryOverride] = useState<string>('');
  const [maxEntryOverride, setMaxEntryOverride] = useState<string>('');
  const [profitabilityOverride, setProfitabilityOverride] = useState<string>('');
  const [variableProfitabilityOverride, setVariableProfitabilityOverride] = useState<string>('');
  const [nameOverride, setNameOverride] = useState<string>('');
  const [descriptionOverride, setDescriptionOverride] = useState<string>('');
  const [cgvOverride, setCgvOverride] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedProductId = clientProduct.productId || (clientProduct.product as { id?: string })?.id || '';

  const base = clientProduct.baseProduct || clientProduct.product;
  const currentProduct = clientProduct.product || {};
  const currentOverrides = (clientProduct.overrides || {}) as Record<string, unknown>;
  const isCatalogVariableProfitability = String(base?.isVariableProfitability || '').toLowerCase() === 'oui';
  const isCurrentProductVariableProfitability =
    String(currentProduct?.isVariableProfitability || '').toLowerCase() === 'oui';
  const hasVariableOverride =
    currentOverrides.variableProfitability != null &&
    String(currentOverrides.variableProfitability).trim() !== '';
  const hasCurrentProductVariableRate =
    currentProduct?.variableProfitability != null &&
    String(currentProduct.variableProfitability).trim() !== '';
  const usesVariableProfitability =
    isCatalogVariableProfitability ||
    isCurrentProductVariableProfitability ||
    hasCurrentProductVariableRate ||
    hasVariableOverride;

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

  const formatCatalogAmount = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined || value === '') return 'Non renseigné';
    const amount = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(amount)) return 'Non renseigné';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatCatalogRate = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined || value === '') return 'Non renseigné';
    const rate = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(rate) || rate === 0) return 'Non renseigné';
    return `${rate.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  };

  const formatCatalogProfitability = (): string => {
    if (base?.noProfitability === true) return 'Sans rentabilité';

    const minRate = formatCatalogRate(base?.profitability);
    const period = base?.profitabilityPeriod ? ` ${base.profitabilityPeriod}` : '';

    if (isCatalogVariableProfitability) {
      const maxRate = formatCatalogRate(base?.variableProfitability);
      if (minRate === 'Non renseigné' && maxRate === 'Non renseigné') return 'Non renseigné';
      return `${minRate} à ${maxRate}${period}`;
    }

    return minRate === 'Non renseigné' ? minRate : `${minRate}${period}`;
  };

  const catalogCgvPreview = base?.cgv?.trim()
    ? base.cgv.trim().slice(0, 140)
    : 'Non renseigné';
  const catalogDescriptionPreview = base?.description?.trim()
    ? base.description.trim().slice(0, 140)
    : 'Non renseigné';

  useEffect(() => {
    if (isOpen) {
      setAvailabilityStart(clientProduct.availabilityStart || '');
      setAvailabilityEnd(clientProduct.availabilityEnd || '');
      const cur = (clientProduct.overrides || {}) as Record<string, any>;
      setMinEntryOverride(cur.minEntryValue != null && cur.minEntryValue !== '' ? String(cur.minEntryValue) : '');
      setMaxEntryOverride(cur.maxEntryValue != null && cur.maxEntryValue !== '' ? String(cur.maxEntryValue) : '');
      setProfitabilityOverride(cur.profitability != null && cur.profitability !== '' ? String(cur.profitability) : '');
      setVariableProfitabilityOverride(cur.variableProfitability != null && cur.variableProfitability !== '' ? String(cur.variableProfitability) : '');
      setNameOverride(typeof cur.name === 'string' ? cur.name : '');
      setDescriptionOverride(typeof cur.description === 'string' ? cur.description : '');
      setCgvOverride(typeof cur.cgv === 'string' ? cur.cgv : '');
    }
  }, [isOpen, clientProduct]);

  const buildOverridesPayload = (): Record<string, unknown> => {
    const next: Record<string, unknown> = { ...((clientProduct.overrides || {}) as Record<string, unknown>) };
    const trim = (s: string) => s.trim();

    if (trim(minEntryOverride) !== '') {
      const n = parseFloat(minEntryOverride.replace(',', '.'));
      if (!Number.isNaN(n)) next.minEntryValue = n;
      else delete next.minEntryValue;
    } else {
      delete next.minEntryValue;
    }

    if (trim(maxEntryOverride) !== '') {
      const n = parseFloat(maxEntryOverride.replace(',', '.'));
      if (!Number.isNaN(n)) next.maxEntryValue = n;
      else delete next.maxEntryValue;
    } else {
      delete next.maxEntryValue;
    }

    if (trim(profitabilityOverride) !== '') {
      const n = parseFloat(profitabilityOverride.replace(',', '.'));
      if (!Number.isNaN(n)) next.profitability = n;
      else delete next.profitability;
    } else {
      delete next.profitability;
    }

    if (usesVariableProfitability && trim(variableProfitabilityOverride) !== '') {
      const n = parseFloat(variableProfitabilityOverride.replace(',', '.'));
      if (!Number.isNaN(n)) {
        next.variableProfitability = n;
        next.isVariableProfitability = 'Oui';
      } else {
        delete next.variableProfitability;
      }
    } else {
      delete next.variableProfitability;
      delete next.isVariableProfitability;
    }

    if (trim(nameOverride) !== '') {
      next.name = nameOverride;
    } else {
      delete next.name;
    }

    if (trim(descriptionOverride) !== '') {
      next.description = descriptionOverride;
    } else {
      delete next.description;
    }

    if (trim(cgvOverride) !== '') {
      next.cgv = cgvOverride;
    } else {
      delete next.cgv;
    }

    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedProductId) {
      toast.error('Identifiant produit manquant');
      return;
    }
    setIsSubmitting(true);

    try {
      const overrides = buildOverridesPayload();
      const response = await apiCall(`/api/clients/${clientId}/products/${resolvedProductId}/availability/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityStart: availabilityStart || null,
          availabilityEnd: availabilityEnd || null,
          overrides,
        }),
      });

      toast.success('Produit client mis à jour');
      onSuccess(response);
      onClose();
    } catch (error: any) {
      console.error('Error updating product client record:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearDates = async () => {
    if (!resolvedProductId) return;
    setIsSubmitting(true);
    const overrides = buildOverridesPayload();
    try {
      const response = await apiCall(`/api/clients/${clientId}/products/${resolvedProductId}/availability/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityStart: null,
          availabilityEnd: null,
          overrides,
        }),
      });
      toast.success('Dates de disponibilité effacées');
      setAvailabilityStart('');
      setAvailabilityEnd('');
      onSuccess(response);
      onClose();
    } catch (error: any) {
      console.error('Error clearing availability:', error);
      toast.error(error.message || "Erreur lors de l'effacement des dates");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetToCatalog = async () => {
    if (!resolvedProductId) return;
    if (!confirm('Supprimer toute la personnalisation (rentabilité, CGV, montants) pour ce client ?')) return;
    setIsSubmitting(true);
    try {
      setMinEntryOverride('');
      setMaxEntryOverride('');
      setProfitabilityOverride('');
      setVariableProfitabilityOverride('');
      setNameOverride('');
      setDescriptionOverride('');
      setCgvOverride('');
      const response = await apiCall(`/api/clients/${clientId}/products/${resolvedProductId}/availability/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availabilityStart: availabilityStart || null,
          availabilityEnd: availabilityEnd || null,
          overrides: {},
        }),
      });
      toast.success('Personnalisation réinitialisée (valeurs catalogue)');
      onSuccess(response);
      onClose();
    } catch (error: any) {
      console.error('Error resetting overrides:', error);
      toast.error(error.message || 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content modal-content--wide modal-content--scrollable">
          <div className="modal-header">
            <h2 className="modal-title">Produit client — disponibilité et personnalisation</h2>
            <button onClick={onClose} className="modal-close-button">
              <X size={20} />
            </button>
          </div>

          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Produit: <span className="text-base font-bold">{clientProduct.product.name}</span>
              {clientProduct.isCustomized ? (
                <Badge variant="secondary" className="ml-2">
                  Personnalisé
                </Badge>
              ) : null}
            </p>
            {clientProduct.product.reference && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Référence: {clientProduct.product.reference}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-1">
              Les champs vides en section personnalisation conservent les valeurs du catalogue pour ce client.
            </p>
          </div>

          {(base?.availabilityStart || base?.availabilityEnd) && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">Dates par défaut du produit (catalogue)</p>
              {base?.availabilityStart && (
                <p className="text-sm text-blue-800 dark:text-blue-300">• Début: {formatDate(base.availabilityStart)}</p>
              )}
              {base?.availabilityEnd && (
                <p className="text-sm text-blue-800 dark:text-blue-300">• Fin: {formatDate(base.availabilityEnd)}</p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="product-availability-modal-grid">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Disponibilité pour ce client</h3>
                <div className="product-availability-modal-fields">
                  <div className="product-availability-modal-field">
                    <Label htmlFor="product-availability-start">
                      Début (client)
                      <span className="text-sm text-gray-500 ml-2">(Optionnel)</span>
                    </Label>
                    <DateInput
                      id="product-availability-start"
                      value={availabilityStart}
                      onChange={setAvailabilityStart}
                      placeholder="jj/mm/aaaa"
                    />
                  </div>

                  <div className="product-availability-modal-field">
                    <Label htmlFor="product-availability-end">
                      Fin (client)
                      <span className="text-sm text-gray-500 ml-2">(Optionnel)</span>
                    </Label>
                    <DateInput
                      id="product-availability-end"
                      value={availabilityEnd}
                      onChange={setAvailabilityEnd}
                      placeholder="jj/mm/aaaa"
                    />
                  </div>
                </div>
              </div>

              <div className="product-availability-modal-customization">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Personnalisation (surcharge catalogue)</h3>
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold mb-2">Valeurs catalogue du produit</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <p><span className="font-medium">Nom:</span> {base?.name || clientProduct.product.name || 'Non renseigné'}</p>
                    <p><span className="font-medium">Montant min.:</span> {formatCatalogAmount(base?.minEntryValue)}</p>
                    <p><span className="font-medium">Montant max.:</span> {formatCatalogAmount(base?.maxEntryValue)}</p>
                    <p><span className="font-medium">Rentabilité:</span> {formatCatalogProfitability()}</p>
                  </div>
                  <p className="mt-2 line-clamp-2">
                    <span className="font-medium">Description:</span> {catalogDescriptionPreview}{base?.description && base.description.trim().length > 140 ? '...' : ''}
                  </p>
                  <p className="mt-2 line-clamp-2">
                    <span className="font-medium">CGV:</span> {catalogCgvPreview}{base?.cgv && base.cgv.trim().length > 140 ? '...' : ''}
                  </p>
                  <p className="mt-2 text-amber-800">
                    Les champs laissés vides gardent ces valeurs pour ce client.
                  </p>
                </div>
                <div className="product-availability-modal-fields">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="product-availability-modal-field">
                      <Label htmlFor="ov-min">Montant min. (surcharge)</Label>
                      <Input
                        id="ov-min"
                        type="text"
                        className="text-sm"
                        value={minEntryOverride}
                        onChange={(e) => setMinEntryOverride(e.target.value)}
                        placeholder="ex. 5000"
                      />
                    </div>
                    <div className="product-availability-modal-field">
                      <Label htmlFor="ov-max">Montant max. (surcharge)</Label>
                      <Input
                        id="ov-max"
                        type="text"
                        className="text-sm"
                        value={maxEntryOverride}
                        onChange={(e) => setMaxEntryOverride(e.target.value)}
                        placeholder="ex. 100000"
                      />
                    </div>
                  </div>

                  {usesVariableProfitability ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="product-availability-modal-field">
                        <Label htmlFor="ov-profit">Taux min. (surcharge)</Label>
                        <Input
                          id="ov-profit"
                          type="text"
                          className="text-sm"
                          value={profitabilityOverride}
                          onChange={(e) => setProfitabilityOverride(e.target.value)}
                          placeholder="ex. 0.5"
                        />
                      </div>
                      <div className="product-availability-modal-field">
                        <Label htmlFor="ov-variable-profit">Taux max. (surcharge)</Label>
                        <Input
                          id="ov-variable-profit"
                          type="text"
                          className="text-sm"
                          value={variableProfitabilityOverride}
                          onChange={(e) => setVariableProfitabilityOverride(e.target.value)}
                          placeholder="ex. 1.5"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="product-availability-modal-field">
                      <Label htmlFor="ov-profit">Taux / rentabilité (surcharge)</Label>
                      <Input
                        id="ov-profit"
                        type="text"
                        className="text-sm"
                        value={profitabilityOverride}
                        onChange={(e) => setProfitabilityOverride(e.target.value)}
                        placeholder="ex. 3.5"
                      />
                    </div>
                  )}

                  <div className="product-availability-modal-field">
                    <Label htmlFor="ov-name">Nom affiché (surcharge)</Label>
                    <Input
                      id="ov-name"
                      type="text"
                      className="text-sm"
                      value={nameOverride}
                      onChange={(e) => setNameOverride(e.target.value)}
                      placeholder="Optionnel"
                    />
                  </div>

                  <div className="product-availability-modal-field">
                    <Label htmlFor="ov-description">Description (texte, surcharge)</Label>
                    <Textarea
                      id="ov-description"
                      value={descriptionOverride}
                      onChange={(e) => setDescriptionOverride(e.target.value)}
                      rows={4}
                      placeholder="Description spécifique à ce client (optionnel)"
                      className="text-sm"
                    />
                  </div>

                  <div className="product-availability-modal-field">
                    <Label htmlFor="ov-cgv">CGV (texte, surcharge)</Label>
                    <Textarea
                      id="ov-cgv"
                      value={cgvOverride}
                      onChange={(e) => setCgvOverride(e.target.value)}
                      rows={4}
                      placeholder="Conditions spécifiques à ce client (optionnel)"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer mt-8 border-t border-slate-200 pt-4">
              <div className="product-availability-modal-secondary-actions">
                <button
                  type="button"
                  onClick={handleResetToCatalog}
                  disabled={isSubmitting || !clientProduct.isCustomized}
                  className="text-sm text-amber-700 hover:text-amber-900 underline disabled:opacity-40 disabled:no-underline"
                >
                  Rétablir le catalogue
                </button>
                <button
                  type="button"
                  onClick={handleClearDates}
                  disabled={isSubmitting || (!availabilityStart && !availabilityEnd)}
                  className="text-sm text-blue-600 hover:text-blue-800 underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                >
                  Effacer les dates client
                </button>
              </div>
              <div className="flex justify-end gap-2">
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
