import React, { useState } from 'react';
import { Button } from './ui/button';
import { X, Loader2 } from 'lucide-react';
import { apiCall } from '../utils/api';
import { formatAmount } from '../utils/currency';
import { toast } from 'sonner';
import '../styles/Modal.css';

export type LivePricingOpenPayload = {
  rates: Array<{
    periodIndex: number;
    months: number;
    startDate: string | null;
    endDate: string | null;
    ratePct: string;
    baseRatePct: string;
    capitalBase: string;
    targetProfit: string;
  }>;
  editedRates: Record<number, string>;
  avoidLosses: boolean;
  positiveGainsOnly: boolean;
  positionsPerMonthMin: string;
  positionsPerMonthMax: string;
  generationHorizonDays: string;
};

export type LivePricingSuccessResult = {
  transaction?: any;
  live_pricing?: any;
};

interface LivePricingGenerationModalProps {
  isOpen: boolean;
  transaction: any;
  clientId: string;
  accountCurrency?: string;
  payload: LivePricingOpenPayload | null;
  onClose: () => void;
  onBack: () => void;
  onSuccess: (result?: LivePricingSuccessResult) => void;
  isWithdrawal?: boolean;
}

function buildActivateRequestBody(payload: LivePricingOpenPayload) {
  const rates_used: Record<number, number> = {};
  const period_summaries = payload.rates.map((rate) => {
    const edited = payload.editedRates[rate.periodIndex];
    const rateValue = edited !== undefined && edited !== '' && Number.isFinite(parseFloat(edited))
      ? parseFloat(edited)
      : parseFloat(rate.baseRatePct);
    rates_used[rate.periodIndex] = rateValue;
    return {
      periodIndex: rate.periodIndex,
      months: rate.months,
      startDate: rate.startDate,
      endDate: rate.endDate,
      ratePct: String(rateValue),
      baseRatePct: rate.baseRatePct,
      capitalBase: rate.capitalBase,
      targetProfit: rate.targetProfit,
    };
  });

  const body: Record<string, unknown> = {
    rates_used,
    period_summaries,
    avoid_losses: payload.avoidLosses,
    positive_gains_only: payload.positiveGainsOnly,
  };

  if (payload.positionsPerMonthMin.trim() !== '') {
    body.positions_per_month_min = parseInt(payload.positionsPerMonthMin.trim(), 10);
  }
  if (payload.positionsPerMonthMax.trim() !== '') {
    body.positions_per_month_max = parseInt(payload.positionsPerMonthMax.trim(), 10);
  }
  if (payload.generationHorizonDays.trim() !== '') {
    body.generation_horizon_days = parseInt(payload.generationHorizonDays.trim(), 10);
  }

  return body;
}

export function LivePricingGenerationModal({
  isOpen,
  transaction,
  clientId,
  accountCurrency: accountCurrencyProp = 'EUR',
  payload,
  onClose,
  onBack,
  onSuccess,
  isWithdrawal = false,
}: LivePricingGenerationModalProps) {
  const displayCurrency = (accountCurrencyProp || transaction?.amountCurrency || transaction?.amount_currency || 'EUR')
    .toString()
    .trim()
    .toUpperCase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !transaction || !payload) {
    return null;
  }

  const handleActivate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/activate-live-pricing/`,
        {
          method: 'POST',
          body: JSON.stringify(buildActivateRequestBody(payload)),
        }
      );

      if ((response as any).error) {
        const msg = (response as any).error;
        setError(msg);
        toast.error(msg);
        return;
      }

      toast.success('Génération Live Pricing activée');
      onSuccess({
        transaction: (response as any).transaction,
        live_pricing: (response as any).live_pricing,
      });
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors de l\'activation Live Pricing';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const previewPlan = payload.rates.slice(0, 5);

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-container">
        <div className="modal-content modal-content--wide modal-content--scrollable" style={{ maxWidth: '900px' }}>
          <div className="modal-header">
            <h2 className="modal-title">Génération Live Pricing</h2>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
              <X size={20} />
            </button>
          </div>

          <div style={{ padding: '0 4px 8px' }}>
            <p style={{ marginBottom: '16px', color: '#64748b', lineHeight: 1.5 }}>
              Les positions seront créées jour par jour à <strong>23:00 UTC</strong> à partir des cours
              intraday réels des actifs du produit. Les taux validés dans l&apos;étape précédente sont
              réutilisés pour calculer les objectifs journaliers.
            </p>

            {isWithdrawal && (
              <div style={{ padding: '12px', backgroundColor: '#fef3c7', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
                Le Live Pricing est prévu pour les investissements produit.
              </div>
            )}

            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', color: '#166534' }}>Paramètres retenus</div>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#166534', fontSize: '14px', lineHeight: 1.6 }}>
                <li>Exécution quotidienne : 23:00 UTC (tous actifs, y compris crypto)</li>
                <li>Périodes configurées : {payload.rates.length}</li>
                {(payload.positionsPerMonthMin || payload.positionsPerMonthMax) && (
                  <li>
                    Positions / mois : {payload.positionsPerMonthMin || '—'} – {payload.positionsPerMonthMax || '—'}
                  </li>
                )}
                {payload.avoidLosses && <li>Éviter les pertes : oui</li>}
                {payload.positiveGainsOnly && <li>Gains strictement positifs : oui</li>}
              </ul>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Aperçu des périodes (extrait)</div>
              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Période</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Dates</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Taux</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Profit cible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPlan.map((rate) => {
                      const edited = payload.editedRates[rate.periodIndex];
                      const rateDisplay = edited !== undefined && edited !== '' ? edited : rate.baseRatePct;
                      return (
                        <tr key={rate.periodIndex} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '8px' }}>#{rate.periodIndex + 1}</td>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#64748b' }}>
                            {rate.startDate || '—'} → {rate.endDate || '—'}
                          </td>
                          <td style={{ padding: '8px' }}>{rateDisplay} %</td>
                          <td style={{ padding: '8px' }}>{formatAmount(parseFloat(rate.targetProfit || '0'), displayCurrency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {payload.rates.length > previewPlan.length && (
                <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                  … et {payload.rates.length - previewPlan.length} période(s) supplémentaire(s)
                </p>
              )}
            </div>

            {error && (
              <div style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '16px', color: '#991b1b', fontSize: '14px' }}>
                {error}
              </div>
            )}

            <div className="modal-form-actions">
              <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
                Retour
              </Button>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Annuler
              </Button>
              <Button type="button" onClick={handleActivate} disabled={loading || isWithdrawal}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                    Activation…
                  </>
                ) : (
                  'Activer la génération Live Pricing'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
