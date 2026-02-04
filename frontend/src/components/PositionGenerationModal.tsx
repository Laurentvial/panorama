import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { X, Loader2 } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';
import '../styles/Modal.css';

interface PeriodRate {
  periodIndex: number;
  months: number;
  startDate: string | null;
  endDate: string | null;
  ratePct: string;
  baseRatePct: string;
  capitalBase: string;
  targetProfit: string;
  // Note: months represents step_months, we may need profit_period_months for accurate proration
}

interface Position {
  id: string;
  client_id: string;
  product_id: string;
  transaction_id: string;
  asset_id: string | null;
  asset_name?: string;
  asset_reference?: string;
  asset_type?: string;
  opened_at: string;
  closed_at: string;
  invested_amount: string;
  fx_rate_eur_to_asset: string | null;
  invested_amount_asset_currency: string | null;
  profit_loss: string;
  period_index: number;
  period_date: string;
  status: string;
}

interface PositionGenerationModalProps {
  isOpen: boolean;
  transaction: any;
  clientId: string;
  onClose: () => void;
  onSuccess: () => void;
  isWithdrawal?: boolean; // If true, this is a withdrawal transaction
}

type Step = 'loading-rates' | 'review-rates' | 'loading-positions' | 'review-positions' | 'saving';

export function PositionGenerationModal({
  isOpen,
  transaction,
  clientId,
  onClose,
  onSuccess,
  isWithdrawal = false
}: PositionGenerationModalProps) {
  const [step, setStep] = useState<Step>('loading-rates');
  const [rates, setRates] = useState<PeriodRate[]>([]);
  const [editedRates, setEditedRates] = useState<Record<number, string>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [avoidLosses, setAvoidLosses] = useState<boolean>(false);
  const [positionsSaved, setPositionsSaved] = useState<boolean>(false);
  const [readyToConfirm, setReadyToConfirm] = useState<boolean>(false);
  const [deletedPositions, setDeletedPositions] = useState<{
    total_count: number;
    deleted_by_transaction: Record<string, number>;
    positions: Array<{
      id: string;
      transaction_id: string;
      asset_id: string | null;
      asset_name: string | null;
      invested_amount: string;
      profit_loss: string;
      opened_at: string | null;
      closed_at: string | null;
      period_index: number | null;
      period_date: string | null;
    }>;
    note: string | null;
  } | null>(null);

  useEffect(() => {
    if (isOpen && transaction) {
      // Reset state when modal opens
      setStep('loading-rates');
      setRates([]);
      setEditedRates({});
      setPositions([]);
      setError(null);
      setAvoidLosses(false);
      setPositionsSaved(false);
      setReadyToConfirm(false);
      setDeletedPositions(null);
      
      // For both investments and withdrawals, generate rates
      // For withdrawals, rates will be generated for the source product
      generateRates();
    }
  }, [isOpen, transaction, isWithdrawal]);

  const generateRates = async () => {
    if (!transaction) return;
    
    try {
      setStep('loading-rates');
      setError(null);
      
      console.log('PositionGenerationModal - Calling generate-rates API for transaction:', transaction.id);
      console.log('PositionGenerationModal - Transaction details:', {
        id: transaction.id,
        type: transaction.type,
        transfer_to: transaction.transfer_to,
        transfer_from: transaction.transfer_from,
        status: transaction.status,
        product: transaction.product
      });
      
      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/generate-rates/`,
        { method: 'POST' }
      );
      
      console.log('PositionGenerationModal - Response from generate-rates:', response);
      
      // Check if API returned an error
      if ((response as any).error) {
        const errorMsg = (response as any).error;
        console.error('PositionGenerationModal - API returned error:', errorMsg);
        setError(errorMsg);
        setStep('review-rates'); // Still show the review step so user can see the error
        toast.error(errorMsg);
        return;
      }
      
      const ratesData = (response as any).rates || [];
      console.log('PositionGenerationModal - Parsed rates data:', ratesData);
      
      if (!ratesData || ratesData.length === 0) {
        const errorMsg = 'Aucune période trouvée pour cette transaction. Vérifiez que :\n' +
          '- La transaction est un investissement (transfert vers un produit)\n' +
          '- Le produit a une durée configurée\n' +
          '- Le capital investi est supérieur à 0\n' +
          '- Il y a des jours de trading entre la date de début et la fin';
        console.error('PositionGenerationModal - No rates returned:', errorMsg);
        setError(errorMsg.replace(/\n/g, ' ')); // Replace newlines with spaces for display
        setStep('review-rates'); // Still show the review step so user can see the error
        toast.error('Aucune période trouvée pour cette transaction');
        return;
      }
      
      setRates(ratesData);
      
      // Initialize edited rates with original rates
      const initialEdited: Record<number, string> = {};
      ratesData.forEach((rate: PeriodRate) => {
        initialEdited[rate.periodIndex] = rate.baseRatePct;
      });
      setEditedRates(initialEdited);
      
      setStep('review-rates');
    } catch (err: any) {
      console.error('Error generating rates:', err);
      // Check if error has response with error message
      let errorMessage = 'Erreur lors de la génération des taux';
      if (err?.response?.error) {
        errorMessage = err.response.error;
      } else if (err?.response?.detail) {
        errorMessage = err.response.detail;
      } else if (err?.message) {
        errorMessage = err.message;
      } else if (err?.error) {
        errorMessage = err.error;
      }
      setError(errorMessage);
      setStep('review-rates'); // Show review step so user can see the error
      toast.error(errorMessage);
    }
  };

  const handleRateChange = (periodIndex: number, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setEditedRates({ ...editedRates, [periodIndex]: value });
    } else if (value === '') {
      setEditedRates({ ...editedRates, [periodIndex]: '' });
    }
  };

  const handleContinue = async () => {
    try {
      setStep('loading-positions');
      setError(null);
      
      // Validate rates - ensure all periods have valid rates
      const ratesToUse: Record<number, number> = {};
      
      // Process all rates from the rates array (which contains all periods)
      for (const rate of rates) {
        const periodIdx = rate.periodIndex;
        const rateStr = editedRates[periodIdx];
        
        // Use edited rate if available and valid, otherwise fall back to baseRatePct
        let rateValue: number;
        if (rateStr !== undefined && rateStr !== '' && !isNaN(parseFloat(rateStr))) {
          rateValue = parseFloat(rateStr);
        } else {
          // Fallback to original baseRatePct
          rateValue = parseFloat(rate.baseRatePct);
        }
        
        if (isNaN(rateValue) || rateValue < 0) {
          toast.error(`Le taux pour la période ${periodIdx + 1} est invalide`);
          setStep('review-rates');
          return;
        }
        ratesToUse[periodIdx] = rateValue;
      }
      
      console.log('Sending rates to backend:', ratesToUse); // Debug log
      console.log('Edited rates state:', editedRates); // Debug log
      
      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/generate-positions/`,
        {
          method: 'POST',
          body: JSON.stringify({ 
            rates: ratesToUse,
            avoid_losses: avoidLosses
          })
        }
      );
      
      const positionsData = (response as any).positions || [];
      setPositions(positionsData);
      
      // Store deleted positions info if available (for preview before validation)
      if ((response as any).deleted_positions) {
        console.log('Deleted positions preview received:', (response as any).deleted_positions);
        setDeletedPositions((response as any).deleted_positions);
      } else {
        console.log('No deleted positions preview in response');
        setDeletedPositions(null);
      }
      
      setStep('review-positions');
    } catch (err: any) {
      console.error('Error generating positions:', err);
      setError(err?.message || 'Erreur lors de la génération des positions');
      toast.error('Erreur lors de la génération des positions');
      setStep('review-rates');
    }
  };

  const handleValidate = async () => {
    // For withdrawals, just mark as ready to confirm (don't save yet)
    // The deleted positions info is already available from the generate_positions call
    if (isWithdrawal) {
      setReadyToConfirm(true); // Mark as ready to confirm, but don't save yet
      setPositionsSaved(false); // Not saved yet, waiting for confirmation
      // Stay on review-positions step to show the information
      setStep('review-positions');
      return;
    }
    
    // For investments, save immediately
    await handleConfirm();
  };

  const handleConfirm = async () => {
    try {
      setStep('saving');
      setError(null);
      
      // Prepare rates_used and period_summaries for history (for both investments and withdrawals)
      const ratesUsed: Record<string, string> = {};
      Object.entries(editedRates).forEach(([periodIdx, rate]) => {
        ratesUsed[periodIdx] = rate;
      });
      
      // Recalculate period_summaries with edited rates and recalculated target profits
      const recalculatedPeriodSummaries = rates.map(rate => {
        const editedRate = editedRates[rate.periodIndex];
        const rateValue = editedRate !== undefined && editedRate !== '' 
          ? parseFloat(editedRate) 
          : parseFloat(rate.baseRatePct);
        
        // Calculate proration factor
        const baseRateValue = parseFloat(rate.baseRatePct);
        const originalEffectiveRate = parseFloat(rate.ratePct);
        let proration = 1;
        if (baseRateValue > 0 && originalEffectiveRate > 0) {
          proration = originalEffectiveRate / baseRateValue;
          if (Math.abs(proration - 1) < 0.0001) {
            proration = 1;
          }
        }
        
        // Calculate target profit with edited rate
        const capitalBase = parseFloat(rate.capitalBase);
        const effectiveRate = rateValue * proration;
        const targetProfit = capitalBase * (effectiveRate / 100);
        const roundedProfit = Math.round(targetProfit * 100) / 100;
        
        // Debug: log the calculation
        console.log(`Period ${rate.periodIndex}: rateValue=${rateValue}, proration=${proration}, effectiveRate=${effectiveRate}, capitalBase=${capitalBase}, targetProfit=${roundedProfit}`);
        
        return {
          periodIndex: rate.periodIndex,
          months: rate.months,
          startDate: rate.startDate,
          endDate: rate.endDate,
          ratePct: (rateValue * proration).toFixed(4), // effective rate (with proration)
          baseRatePct: rateValue.toFixed(2), // base rate (edited, before proration) - this is what should be displayed
          capitalBase: rate.capitalBase,
          targetProfit: roundedProfit.toFixed(2), // recalculated with edited rate
        };
      });
      
      // For withdrawals, save only the history (no positions are created for the withdrawal itself)
      // For investments, save positions and history
      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/save-positions/`,
        {
          method: 'POST',
          body: JSON.stringify({ 
            positions,
            rates_used: ratesUsed,
            period_summaries: recalculatedPeriodSummaries
          })
        }
      );
      
      // Store deleted positions info for display (works for both investments and withdrawals)
      if ((response as any).deleted_positions) {
        console.log('Deleted positions info received:', (response as any).deleted_positions);
        setDeletedPositions((response as any).deleted_positions);
      } else {
        console.log('No deleted positions info in response');
      }
      
      // Mark positions as saved
      setPositionsSaved(true);
      
      if (isWithdrawal) {
        // For withdrawals, close after saving
        toast.success('Retrait confirmé et positions recalculées avec succès');
        handleClose();
        onSuccess();
      } else {
        toast.success('Positions générées avec succès');
        handleClose();
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error saving positions:', err);
      setError(err?.message || 'Erreur lors de l\'enregistrement des positions');
      toast.error('Erreur lors de l\'enregistrement des positions');
      setStep('review-positions');
    }
  };

  const handleClose = () => {
    setStep('loading-rates');
    setRates([]);
    setEditedRates({});
    setPositions([]);
    setError(null);
    onClose();
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR');
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const calculateTargetProfit = (rate: PeriodRate, editedRate: string | undefined): string => {
    // Use edited rate if available and valid, otherwise use baseRatePct
    const rateStr = editedRate !== undefined && editedRate !== '' ? editedRate : rate.baseRatePct;
    const rateValue = parseFloat(rateStr);
    
    if (isNaN(rateValue) || rateValue < 0) {
      return formatCurrency('0');
    }
    
    // Parse capital base
    const capitalBase = parseFloat(rate.capitalBase);
    if (isNaN(capitalBase) || capitalBase <= 0) {
      return formatCurrency('0');
    }
    
    // Calculate proration factor
    // The backend calculates: effective_rate = base_rate * proration
    // Where proration = step_months / profit_period_months
    // We can derive proration from: proration = effective_rate / base_rate
    const baseRateValue = parseFloat(rate.baseRatePct);
    const originalEffectiveRate = parseFloat(rate.ratePct);
    let proration = 1;
    
    if (baseRateValue > 0 && originalEffectiveRate > 0) {
      // Proration = effective_rate / base_rate
      proration = originalEffectiveRate / baseRateValue;
      // If proration is very close to 1 (within 0.0001), treat it as exactly 1
      // This avoids floating point precision issues that cause 1999.99 instead of 2000.00
      if (Math.abs(proration - 1) < 0.0001) {
        proration = 1;
      }
    }
    
    // Calculate target profit: capitalBase * (editedRate / 100) * proration
    // This matches the backend calculation: capital_base * effective_rate_pct / 100
    const effectiveRate = rateValue * proration;
    const targetProfit = capitalBase * (effectiveRate / 100);
    
    // Round to 2 decimal places to match backend quantization
    // Use Math.round for proper rounding (rounds half up)
    const roundedProfit = Math.round(targetProfit * 100) / 100;
    
    return formatCurrency(roundedProfit.toString());
  };

  if (!isOpen || !transaction) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            Génération des positions
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="modal-close"
            onClick={handleClose}
            disabled={step === 'saving'}
          >
            <X className="planning-icon-md" />
          </Button>
        </div>

        <div className="modal-form" style={{ padding: '20px' }}>
          {error && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#fee2e2', 
              color: '#991b1b', 
              borderRadius: '6px', 
              marginBottom: '20px' 
            }}>
              {error}
            </div>
          )}

          {step === 'loading-rates' && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader2 className="animate-spin" style={{ width: '48px', height: '48px', margin: '0 auto 20px', color: '#3b82f6' }} />
              <p style={{ fontSize: '16px', color: '#64748b' }}>Génération des taux de rentabilité...</p>
            </div>
          )}

          {step === 'review-rates' && (
            <div>
              {rates.length === 0 ? (
                <div style={{ 
                  padding: '20px', 
                  backgroundColor: '#fef3c7', 
                  border: '1px solid #fbbf24', 
                  borderRadius: '8px', 
                  marginBottom: '20px',
                  textAlign: 'center'
                }}>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: '#92400e', marginBottom: '12px' }}>
                    Aucune période trouvée
                  </p>
                  <div style={{ fontSize: '14px', color: '#78350f', textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
                    {error ? (
                      <p style={{ marginBottom: '8px' }}>{error}</p>
                    ) : (
                      <>
                        <p style={{ marginBottom: '8px', fontWeight: '500' }}>Impossible de générer les périodes pour cette transaction.</p>
                        <p style={{ marginBottom: '4px' }}>Vérifiez que :</p>
                        <ul style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '0' }}>
                          <li>La transaction est un investissement (transfert vers un produit)</li>
                          <li>Le produit a une durée configurée</li>
                          <li>Le capital investi est supérieur à 0</li>
                          <li>Il y a des jours de trading entre la date de début et la fin</li>
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ marginBottom: '20px', color: '#64748b' }}>
                    Veuillez vérifier et modifier si nécessaire les taux de rentabilité pour chaque période :
                  </p>
                  
                  <div style={{ marginBottom: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Période</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Durée</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Dates</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Capital de base</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Taux (%)</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Profit cible</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rates.map((rate) => (
                      <tr key={rate.periodIndex} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px' }}>{rate.periodIndex + 1}</td>
                        <td style={{ padding: '12px' }}>{rate.months} mois</td>
                        <td style={{ padding: '12px', fontSize: '14px' }}>
                          {formatDate(rate.startDate)} - {formatDate(rate.endDate)}
                        </td>
                        <td style={{ padding: '12px' }}>{formatCurrency(rate.capitalBase)}</td>
                        <td style={{ padding: '12px' }}>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editedRates[rate.periodIndex] || rate.baseRatePct}
                            onChange={(e) => handleRateChange(rate.periodIndex, e.target.value)}
                            style={{ width: '100px' }}
                          />
                        </td>
                        <td style={{ padding: '12px' }}>
                          {calculateTargetProfit(rate, editedRates[rate.periodIndex])}
                        </td>
                      </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={avoidLosses}
                        onChange={(e) => setAvoidLosses(e.target.checked)}
                        style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: '500' }}>Eviter les pertes</span>
                    </label>
                    <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', marginLeft: '24px' }}>
                      Si activé, toutes les positions générées seront gagnantes ou neutres (aucune perte)
                    </p>
                  </div>
                </>
              )}

              <div className="modal-form-actions">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Annuler
                </Button>
                {rates.length > 0 && (
                  <Button type="button" onClick={handleContinue}>
                    Continuer
                  </Button>
                )}
              </div>
            </div>
          )}

          {step === 'loading-positions' && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader2 className="animate-spin" style={{ width: '48px', height: '48px', margin: '0 auto 20px', color: '#3b82f6' }} />
              <p style={{ fontSize: '16px', color: '#64748b' }}>Génération des positions...</p>
            </div>
          )}

          {step === 'review-positions' && (
            <div>
              {deletedPositions && deletedPositions.total_count > 0 && (
                <div style={{ 
                  padding: '16px', 
                  backgroundColor: '#fef3c7', 
                  border: '1px solid #fbbf24', 
                  borderRadius: '8px', 
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#92400e', marginBottom: '12px' }}>
                    ⚠️ Positions qui seront supprimées
                  </div>
                  <div style={{ fontSize: '14px', color: '#78350f', marginBottom: '12px' }}>
                    <strong>{deletedPositions.total_count}</strong> position(s) en attente seront supprimées avant la génération des nouvelles positions.
                    {deletedPositions.note && (
                      <div style={{ marginTop: '8px', fontSize: '12px', fontStyle: 'italic' }}>
                        {deletedPositions.note}
                      </div>
                    )}
                  </div>
                  {Object.keys(deletedPositions.deleted_by_transaction).length > 0 && (
                    <div style={{ marginTop: '12px', fontSize: '13px' }}>
                      <strong>Répartition par transaction :</strong>
                      <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
                        {Object.entries(deletedPositions.deleted_by_transaction).map(([txnId, count]) => (
                          <li key={txnId}>
                            Transaction {txnId}: {count} position(s)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {deletedPositions.positions.length > 0 && (
                    <details style={{ marginTop: '12px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>
                        Voir les détails ({deletedPositions.positions.length} position(s) affichée(s))
                      </summary>
                      <div style={{ marginTop: '12px', maxHeight: '300px', overflowY: 'auto', fontSize: '12px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #d1d5db', backgroundColor: '#f9fafb' }}>
                              <th style={{ padding: '6px', textAlign: 'left' }}>ID</th>
                              <th style={{ padding: '6px', textAlign: 'left' }}>Transaction</th>
                              <th style={{ padding: '6px', textAlign: 'left' }}>Actif</th>
                              <th style={{ padding: '6px', textAlign: 'right' }}>Montant</th>
                              <th style={{ padding: '6px', textAlign: 'right' }}>Profit/Perte</th>
                              <th style={{ padding: '6px', textAlign: 'left' }}>Date ouverture</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deletedPositions.positions.map((pos) => (
                              <tr key={pos.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '6px', fontFamily: 'monospace', fontSize: '10px' }}>{pos.id}</td>
                                <td style={{ padding: '6px', fontFamily: 'monospace', fontSize: '10px' }}>{pos.transaction_id}</td>
                                <td style={{ padding: '6px' }}>{pos.asset_name || 'N/A'}</td>
                                <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(pos.invested_amount)}</td>
                                <td style={{ 
                                  padding: '6px', 
                                  textAlign: 'right',
                                  color: parseFloat(pos.profit_loss) >= 0 ? '#16a34a' : '#dc2626'
                                }}>
                                  {formatCurrency(pos.profit_loss)}
                                </td>
                                <td style={{ padding: '6px', fontSize: '10px' }}>
                                  {pos.opened_at ? formatDateTime(pos.opened_at) : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              )}
              
              <p style={{ marginBottom: '20px', color: '#64748b' }}>
                {positions.length} position(s) générée(s). Veuillez vérifier avant de valider :
              </p>
              
              <div style={{ marginBottom: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Actif</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Date ouverture</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Date fermeture</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Montant investi</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Profit/Perte</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Période</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>
                          {pos.asset_name ? (
                            <div>
                              <div style={{ fontWeight: '500' }}>{pos.asset_name}</div>
                              {pos.asset_reference && (
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{pos.asset_reference}</div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#64748b', fontStyle: 'italic' }}>Aucun actif</span>
                          )}
                        </td>
                        <td style={{ padding: '8px' }}>{formatDateTime(pos.opened_at)}</td>
                        <td style={{ padding: '8px' }}>{formatDateTime(pos.closed_at)}</td>
                        <td style={{ padding: '8px' }}>{formatCurrency(pos.invested_amount)}</td>
                        <td style={{ 
                          padding: '8px', 
                          color: parseFloat(pos.profit_loss) >= 0 ? '#16a34a' : '#dc2626',
                          fontWeight: '500'
                        }}>
                          {formatCurrency(pos.profit_loss)}
                        </td>
                        <td style={{ padding: '8px' }}>{pos.period_index}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ 
                padding: '12px', 
                backgroundColor: '#f0f9ff', 
                borderRadius: '6px', 
                marginBottom: '20px',
                fontSize: '14px'
              }}>
                <strong>Résumé :</strong>
                <div style={{ marginTop: '8px' }}>
                  Total investi : {formatCurrency(
                    positions.reduce((sum, p) => sum + parseFloat(p.invested_amount), 0).toString()
                  )}
                </div>
                <div>
                  Total profit/pertes : <span style={{ 
                    color: positions.reduce((sum, p) => sum + parseFloat(p.profit_loss), 0) >= 0 ? '#16a34a' : '#dc2626',
                    fontWeight: '600'
                  }}>
                    {formatCurrency(
                      positions.reduce((sum, p) => sum + parseFloat(p.profit_loss), 0).toString()
                    )}
                  </span>
                </div>
              </div>

              <div className="modal-form-actions">
                {isWithdrawal && readyToConfirm && !positionsSaved ? (
                  // For withdrawals after clicking "Valider", show confirm button to actually save
                  <>
                    <Button type="button" variant="outline" onClick={() => setStep('review-rates')}>
                      Retour
                    </Button>
                    <Button type="button" onClick={handleConfirm}>
                      Confirmer
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => setStep('review-rates')}>
                      Retour
                    </Button>
                    <Button type="button" onClick={handleValidate}>
                      Valider
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 'saving' && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader2 className="animate-spin" style={{ width: '48px', height: '48px', margin: '0 auto 20px', color: '#3b82f6' }} />
              <p style={{ fontSize: '16px', color: '#64748b' }}>
                {isWithdrawal ? 'Enregistrement de la transaction et recalcul des positions...' : 'Enregistrement des positions...'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
