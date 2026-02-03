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
}

type Step = 'loading-rates' | 'review-rates' | 'loading-positions' | 'review-positions' | 'saving';

export function PositionGenerationModal({
  isOpen,
  transaction,
  clientId,
  onClose,
  onSuccess
}: PositionGenerationModalProps) {
  const [step, setStep] = useState<Step>('loading-rates');
  const [rates, setRates] = useState<PeriodRate[]>([]);
  const [editedRates, setEditedRates] = useState<Record<number, string>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && transaction) {
      // Reset state when modal opens
      setStep('loading-rates');
      setRates([]);
      setEditedRates({});
      setPositions([]);
      setError(null);
      
      // Start generating rates
      generateRates();
    }
  }, [isOpen, transaction]);

  const generateRates = async () => {
    if (!transaction) return;
    
    try {
      setStep('loading-rates');
      setError(null);
      
      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/generate-rates/`,
        { method: 'POST' }
      );
      
      const ratesData = (response as any).rates || [];
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
      setError(err?.message || 'Erreur lors de la génération des taux');
      toast.error('Erreur lors de la génération des taux');
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
      
      // Validate rates
      const ratesToUse: Record<number, number> = {};
      for (const [periodIdx, rateStr] of Object.entries(editedRates)) {
        const rate = parseFloat(rateStr);
        if (isNaN(rate) || rate < 0) {
          toast.error(`Le taux pour la période ${parseInt(periodIdx) + 1} est invalide`);
          setStep('review-rates');
          return;
        }
        ratesToUse[parseInt(periodIdx)] = rate;
      }
      
      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/generate-positions/`,
        {
          method: 'POST',
          body: JSON.stringify({ rates: ratesToUse })
        }
      );
      
      const positionsData = (response as any).positions || [];
      setPositions(positionsData);
      setStep('review-positions');
    } catch (err: any) {
      console.error('Error generating positions:', err);
      setError(err?.message || 'Erreur lors de la génération des positions');
      toast.error('Erreur lors de la génération des positions');
      setStep('review-rates');
    }
  };

  const handleValidate = async () => {
    try {
      setStep('saving');
      setError(null);
      
      // Prepare rates_used and period_summaries for history
      const ratesUsed: Record<string, string> = {};
      Object.entries(editedRates).forEach(([periodIdx, rate]) => {
        ratesUsed[periodIdx] = rate;
      });
      
      await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/save-positions/`,
        {
          method: 'POST',
          body: JSON.stringify({ 
            positions,
            rates_used: ratesUsed,
            period_summaries: rates.map(rate => ({
              periodIndex: rate.periodIndex,
              months: rate.months,
              startDate: rate.startDate,
              endDate: rate.endDate,
              ratePct: editedRates[rate.periodIndex] || rate.baseRatePct,
              capitalBase: rate.capitalBase,
              targetProfit: rate.targetProfit,
            }))
          })
        }
      );
      
      toast.success('Positions générées avec succès');
      handleClose();
      onSuccess();
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

  if (!isOpen || !transaction) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Génération des positions</h2>
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
                        <td style={{ padding: '12px' }}>{formatCurrency(rate.targetProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="modal-form-actions">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Annuler
                </Button>
                <Button type="button" onClick={handleContinue}>
                  Continuer
                </Button>
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
                <Button type="button" variant="outline" onClick={() => setStep('review-rates')}>
                  Retour
                </Button>
                <Button type="button" onClick={handleValidate}>
                  Valider
                </Button>
              </div>
            </div>
          )}

          {step === 'saving' && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader2 className="animate-spin" style={{ width: '48px', height: '48px', margin: '0 auto 20px', color: '#3b82f6' }} />
              <p style={{ fontSize: '16px', color: '#64748b' }}>Enregistrement des positions...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
