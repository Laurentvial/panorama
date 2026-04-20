import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { X, Loader2 } from 'lucide-react';
import { apiCall } from '../utils/api';
import { formatAmount } from '../utils/currency';
import { toast } from 'sonner';
import '../styles/Modal.css';

const API_TIMEOUT_MS = 120_000; // 2 minutes

const GENERATION_HORIZON_MIN = 30;
const GENERATION_HORIZON_MAX = 3650;

/**
 * Align with backend `_product_has_explicit_contract_duration`:
 * any positive integer found in the duration string counts as an explicit duration.
 */
function stringHasExplicitPositiveIntegerDuration(duration: unknown): boolean {
  if (duration == null) return false;
  const s = String(duration).trim();
  if (!s) return false;
  const m = s.match(/(\d+)/);
  if (!m) return false;
  const v = parseInt(m[1], 10);
  return Number.isFinite(v) && v > 0;
}

function transactionHasExplicitContractDuration(txn: any): boolean {
  const candidates: unknown[] = [
    txn?.product?.duration,
    txn?.subscription_details?.duration,
    txn?.subscription_duration,
  ];
  return candidates.some((d) => stringHasExplicitPositiveIntegerDuration(d));
}

function getTransactionTransferTo(txn: any): string | null {
  const v =
    txn?.transfer_to ??
    txn?.to_field ??
    txn?.to ??
    txn?.transferTo ??
    txn?.subscription_details?.productId ??
    txn?.subscription_details?.product_id ??
    null;
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function getTransactionTransferFrom(txn: any): string | null {
  const v =
    txn?.transfer_from ??
    txn?.from_field ??
    txn?.from ??
    txn?.transferFrom ??
    null;
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function isInvestmentTransferTransaction(txn: any): boolean {
  if (!txn) return false;
  if (String(txn.type || '').trim().toLowerCase() !== 'transfert') return false;

  const transferTo = getTransactionTransferTo(txn);
  if (!transferTo) return false;
  if (transferTo === 'solde' || transferTo === 'trading') return false;
  return true;
}

/** Proration = effective_rate / base_rate when base ≠ 0 (aligns with backend; works for negative rates). */
function deriveRateProrationFromPeriod(baseRatePct: string, effectiveRatePct: string): number {
  const baseRateValue = parseFloat(baseRatePct);
  const originalEffectiveRate = parseFloat(effectiveRatePct);
  if (!Number.isFinite(baseRateValue) || !Number.isFinite(originalEffectiveRate) || baseRateValue === 0) {
    return 1;
  }
  let proration = originalEffectiveRate / baseRateValue;
  if (Math.abs(proration - 1) < 0.0001) {
    proration = 1;
  }
  return proration;
}

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

interface RecalculationExecutionSummary {
  withdrawal_transaction_id: string;
  product_id: string | null;
  strict_mode: boolean;
  deleted_total: number;
  deleted_by_transaction: Record<string, number>;
  regenerated_total: number;
  final_pending_total: number;
  transaction_count: number;
  per_transaction: Array<{
    transaction_id: string;
    before_pending: number;
    created: number;
    after_pending: number;
    status: string;
    error?: string;
  }>;
  errors: string[];
  status: string;
}

interface RecalculationExecutionPreview {
  deleted_total_expected: number;
  regenerated_total_expected: number;
  per_transaction_expected: Array<{
    transaction_id: string;
    before_pending: number;
    created: number;
    after_pending: number;
    status: string;
    error?: string;
  }>;
  status: string;
  errors: string[];
  generated_positions_preview_note?: string | null;
  source: string;
}

interface WithdrawalRecalculationMetadata {
  product_id: string | null;
  withdrawal_amount: string;
  principal_before_withdrawal: string;
  accrued_gains_before_withdrawal: string;
  paid_interests_before_withdrawal: string;
  unpaid_gains_before_withdrawal: string;
  total_value_before_withdrawal: string;
  total_value_after_withdrawal: string;
  withdrawal_ratio: string;
  capital_scale_factor: string;
  cutoff_datetime: string;
}

interface AdditionRecalculationMetadata {
  product_id: string | null;
  addition_amount: string;
  principal_before_addition: string;
  principal_after_addition: string;
  accrued_gains_before_addition: string;
  paid_interests_before_addition: string;
  unpaid_gains_before_addition: string;
  total_value_before_addition: string;
  total_value_after_addition: string;
  capital_scale_factor: string;
  cutoff_datetime: string;
}

interface PositionGenerationModalProps {
  isOpen: boolean;
  transaction: any;
  clientId: string;
  accountCurrency?: string;
  onClose: () => void;
  onSuccess: () => void;
  isWithdrawal?: boolean; // If true, this is a withdrawal transaction
}

type Step = 'loading-rates' | 'review-rates' | 'loading-positions' | 'review-positions' | 'saving';

export function PositionGenerationModal({
  isOpen,
  transaction,
  clientId,
  accountCurrency: accountCurrencyProp = 'EUR',
  onClose,
  onSuccess,
  isWithdrawal = false
}: PositionGenerationModalProps) {
  const displayCurrency = (accountCurrencyProp || transaction?.amountCurrency || transaction?.amount_currency || 'EUR').toString().trim().toUpperCase();
  const [step, setStep] = useState<Step>('loading-rates');
  const [rates, setRates] = useState<PeriodRate[]>([]);
  const [editedRates, setEditedRates] = useState<Record<number, string>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [avoidLosses, setAvoidLosses] = useState<boolean>(false);
  const [positiveGainsOnly, setPositiveGainsOnly] = useState<boolean>(false);
  const [positionsSaved, setPositionsSaved] = useState<boolean>(false);
  const [readyToConfirm, setReadyToConfirm] = useState<boolean>(false);
  const [positionsPerMonthMin, setPositionsPerMonthMin] = useState<string>('');
  const [positionsPerMonthMax, setPositionsPerMonthMax] = useState<string>('');
  const [positionsRangeError, setPositionsRangeError] = useState<string | null>(null);
  const [withdrawalRecalculation, setWithdrawalRecalculation] = useState<WithdrawalRecalculationMetadata | null>(null);
  const [additionRecalculation, setAdditionRecalculation] = useState<AdditionRecalculationMetadata | null>(null);
  const [isRecalculationSaved, setIsRecalculationSaved] = useState<boolean>(false);
  const [recalculationPreview, setRecalculationPreview] = useState<RecalculationExecutionPreview | null>(null);
  const [recalculationExecution, setRecalculationExecution] = useState<RecalculationExecutionSummary | null>(null);
  const [generationHorizonDays, setGenerationHorizonDays] = useState<string>('30');
  const generationHorizonDaysRef = useRef<string>('30');

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

  const abortControllerRef = useRef<AbortController | null>(null);
  const isUserCancelRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && transaction) {
      // Reset state when modal opens
      setStep('loading-rates');
      setRates([]);
      setEditedRates({});
      setPositions([]);
      setError(null);
      setAvoidLosses(false);
      setPositiveGainsOnly(false);
      setPositionsSaved(false);
      setReadyToConfirm(false);
      setDeletedPositions(null);
      setPositionsPerMonthMin('');
      setPositionsPerMonthMax('');
      setPositionsRangeError(null);
      setWithdrawalRecalculation(null);
      setAdditionRecalculation(null);
      setIsRecalculationSaved(false);
      setRecalculationPreview(null);
      setRecalculationExecution(null);
      generationHorizonDaysRef.current = '30';
      setGenerationHorizonDays('30');

      // For both investments and withdrawals, generate rates
      // For withdrawals, rates will be generated for the source product
      generateRates();
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [isOpen, transaction, isWithdrawal]);

  const generateRates = async () => {
    if (!transaction) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    isUserCancelRef.current = false;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, API_TIMEOUT_MS);

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

      const product = transaction?.product;
      const isInvestment = isInvestmentTransferTransaction(transaction);
      // Important: some callers provide a transaction object without `product` populated.
      // In that case we still want to offer (and send) the horizon for indefinite products.
      const useHorizon =
        Boolean(isInvestment) && !transactionHasExplicitContractDuration(transaction);
      let parsedHorizon = parseInt(generationHorizonDaysRef.current.trim(), 10);
      if (!Number.isFinite(parsedHorizon)) parsedHorizon = GENERATION_HORIZON_MIN;
      parsedHorizon = Math.min(
        GENERATION_HORIZON_MAX,
        Math.max(GENERATION_HORIZON_MIN, parsedHorizon)
      );
      const ratesRequestBody = useHorizon
        ? { generation_horizon_days: parsedHorizon }
        : {};

      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/generate-rates/`,
        {
          method: 'POST',
          body: JSON.stringify(ratesRequestBody),
          signal: controller.signal,
        }
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
      if ((response as any).withdrawal_recalculation) {
        setWithdrawalRecalculation((response as any).withdrawal_recalculation);
      }
      if ((response as any).addition_recalculation) {
        setAdditionRecalculation((response as any).addition_recalculation);
      }
      if ((response as any).recalculation_execution) {
        setRecalculationExecution((response as any).recalculation_execution);
      }
      console.log('PositionGenerationModal - Parsed rates data:', ratesData);
      
      if (!ratesData || ratesData.length === 0) {
        const errorMsg =
          'Aucune période trouvée pour cette transaction. Vérifiez que :\n' +
          '- La transaction est un investissement (transfert vers un produit)\n' +
          '- Pour un produit sans durée, l’horizon de génération (jours) est suffisant\n' +
          '- Le capital investi est supérieur à 0\n' +
          '- Il y a des jours de trading entre la date de début et la fin';
        console.error('PositionGenerationModal - No rates returned:', errorMsg);
        setError(errorMsg.replace(/\n/g, ' ')); // Replace newlines with spaces for display
        setStep('review-rates'); // Still show the review step so user can see the error
        toast.error('Aucune période trouvée pour cette transaction');
        return;
      }
      
      setRates(ratesData);

      // Keep the horizon input in sync with what was actually sent to the API (clamped),
      // otherwise the UI can show "30" while the generated schedule reflects a different horizon.
      if (useHorizon) {
        generationHorizonDaysRef.current = String(parsedHorizon);
        setGenerationHorizonDays(String(parsedHorizon));
      }
      
      // Initialize edited rates with original rates
      const initialEdited: Record<number, string> = {};
      ratesData.forEach((rate: PeriodRate) => {
        initialEdited[rate.periodIndex] = rate.baseRatePct;
      });
      setEditedRates(initialEdited);

      setStep('review-rates');
    } catch (err: any) {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;

      if (err?.name === 'AbortError') {
        if (isUserCancelRef.current) return;
        setError(
          'La requête a expiré. La génération peut prendre du temps pour les produits avec beaucoup de transactions. Réessayez ou contactez l\'administrateur.'
        );
        setStep('review-rates');
        toast.error('La requête a expiré. Réessayez.');
        return;
      }

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
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleCancelLoading = () => {
    isUserCancelRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (step === 'loading-positions') {
      setStep('review-rates');
    } else if (step === 'loading-rates') {
      onClose();
    }
  };

  const handleRateChange = (periodIndex: number, value: string) => {
    const trimmed = value.trim();
    if (trimmed === '') {
      setEditedRates({ ...editedRates, [periodIndex]: '' });
    } else if (/^-?\d*\.?\d*$/.test(trimmed)) {
      setEditedRates({ ...editedRates, [periodIndex]: trimmed });
    }
  };

  const handleContinue = async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    isUserCancelRef.current = false;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, API_TIMEOUT_MS);

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
        if (rateStr !== undefined && rateStr !== '' && Number.isFinite(parseFloat(rateStr))) {
          rateValue = parseFloat(rateStr);
        } else {
          // Fallback to original baseRatePct
          rateValue = parseFloat(rate.baseRatePct);
        }
        
        if (!Number.isFinite(rateValue)) {
          clearTimeout(timeoutId);
          toast.error(`Le taux pour la période ${periodIdx + 1} est invalide`);
          setStep('review-rates');
          return;
        }
        ratesToUse[periodIdx] = rateValue;
      }
      
      console.log('Sending rates to backend:', ratesToUse); // Debug log
      console.log('Edited rates state:', editedRates); // Debug log
      
      // Prepare request body with optional positions per month override
      const requestBody: any = {
        rates: ratesToUse,
        avoid_losses: avoidLosses,
        positive_only: positiveGainsOnly,
        manual_regeneration: true,
      };

      const productForHorizon = transaction?.product;
      const isInvestmentForPositions = isInvestmentTransferTransaction(transaction);
      const useHorizonForPositions =
        Boolean(isInvestmentForPositions) && !transactionHasExplicitContractDuration(transaction);
      if (useHorizonForPositions) {
        let hz = parseInt(generationHorizonDaysRef.current.trim(), 10);
        if (!Number.isFinite(hz)) hz = GENERATION_HORIZON_MIN;
        hz = Math.min(GENERATION_HORIZON_MAX, Math.max(GENERATION_HORIZON_MIN, hz));
        requestBody.generation_horizon_days = hz;
      }
      
      // Add positions per month override if provided
      if (positionsPerMonthMin.trim() !== '' || positionsPerMonthMax.trim() !== '') {
        const minVal = positionsPerMonthMin.trim() !== '' ? parseInt(positionsPerMonthMin.trim(), 10) : null;
        const maxVal = positionsPerMonthMax.trim() !== '' ? parseInt(positionsPerMonthMax.trim(), 10) : null;
        
        if (minVal !== null && (isNaN(minVal) || minVal < 0)) {
          clearTimeout(timeoutId);
          setPositionsRangeError('Le minimum doit être un nombre entier >= 0');
          setStep('review-rates');
          return;
        }

        if (maxVal !== null && (isNaN(maxVal) || maxVal < 0)) {
          clearTimeout(timeoutId);
          setPositionsRangeError('Le maximum doit être un nombre entier >= 0');
          setStep('review-rates');
          return;
        }

        if (minVal !== null && maxVal !== null && minVal > maxVal) {
          clearTimeout(timeoutId);
          setPositionsRangeError('Le minimum doit être <= au maximum');
          setStep('review-rates');
          return;
        }
        
        if (minVal !== null) {
          requestBody.positions_per_month_min = minVal;
        }
        if (maxVal !== null) {
          requestBody.positions_per_month_max = maxVal;
        }
      }
      
      setPositionsRangeError(null);
      
      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/generate-positions/`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      );
      
      const positionsData = (response as any).positions || [];
      setPositions(positionsData);
      if ((response as any).recalculation_execution_preview) {
        setRecalculationPreview((response as any).recalculation_execution_preview);
      }
      if ((response as any).withdrawal_recalculation) {
        setWithdrawalRecalculation((response as any).withdrawal_recalculation);
      }
      if ((response as any).addition_recalculation) {
        setAdditionRecalculation((response as any).addition_recalculation);
      }
      
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
      clearTimeout(timeoutId);
      abortControllerRef.current = null;

      if (err?.name === 'AbortError') {
        if (isUserCancelRef.current) return;
        setError(
          'La requête a expiré. La génération peut prendre du temps pour les produits avec beaucoup de transactions. Réessayez ou contactez l\'administrateur.'
        );
        setPositionsRangeError(null);
        setStep('review-rates');
        toast.error('La requête a expiré. Réessayez.');
        return;
      }

      console.error('Error generating positions:', err);

      // Check if it's a positions range error
      if (err?.error_type === 'positions_range_too_high' || err?.message?.includes('fourchette') || err?.message?.includes('positions/mois')) {
        setPositionsRangeError(err?.message || 'La fourchette demandée est trop élevée pour cette durée');
        setError(null); // Clear general error to show specific range error
      } else {
        setError(err?.message || 'Erreur lors de la génération des positions');
        setPositionsRangeError(null);
      }

      toast.error(err?.message || 'Erreur lors de la génération des positions');
      setStep('review-rates');
    } finally {
      clearTimeout(timeoutId);
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
        ratesUsed[periodIdx] = String(rate ?? '');
      });
      
      // Recalculate period_summaries with edited rates and recalculated target profits
      const recalculatedPeriodSummaries = rates.map(rate => {
        const editedRate = editedRates[rate.periodIndex];
        const rateValue = editedRate !== undefined && editedRate !== '' 
          ? parseFloat(editedRate) 
          : parseFloat(rate.baseRatePct);
        
        const proration = deriveRateProrationFromPeriod(rate.baseRatePct, rate.ratePct);
        
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
      const isAdditionRecalc = !!additionRecalculation;
      const shouldSendPositionsMonthRange =
        (isWithdrawal || isAdditionRecalc) &&
        positionsPerMonthMin.trim() !== '' &&
        positionsPerMonthMax.trim() !== '';

      const response = await apiCall(
        `/api/clients/${clientId}/transactions/${transaction.id}/save-positions/`,
        {
          method: 'POST',
          body: JSON.stringify({ 
            positions,
            rates_used: ratesUsed,
            period_summaries: recalculatedPeriodSummaries,
            manual_regeneration: true,
            ...(shouldSendPositionsMonthRange
              ? {
                  positions_per_month_min: parseInt(positionsPerMonthMin.trim(), 10),
                  positions_per_month_max: parseInt(positionsPerMonthMax.trim(), 10),
                }
              : {}),
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
      if ((response as any).withdrawal_recalculation) {
        setWithdrawalRecalculation((response as any).withdrawal_recalculation);
      }
      if ((response as any).addition_recalculation) {
        setAdditionRecalculation((response as any).addition_recalculation);
      }
      if ((response as any).recalculation_execution) {
        setRecalculationExecution((response as any).recalculation_execution);
      }
      
      // Mark positions as saved
      setPositionsSaved(true);
      
      // Detect if this is an addition requiring recalculation
      const isAdditionRecalcAfterSave = !!additionRecalculation || !!(response as any).addition_recalculation;
      
      const isRecalculationAfterSave = isWithdrawal || isAdditionRecalcAfterSave;
      setIsRecalculationSaved(isRecalculationAfterSave);

      if (isRecalculationAfterSave) {
        // For recalculations, keep modal open to show real execution summary.
        toast.success(
          isWithdrawal
            ? 'Retrait confirmé et recalcul exécuté avec succès'
            : 'Ajout confirmé et recalcul exécuté avec succès'
        );
        setReadyToConfirm(false);
        setStep('review-positions');
      } else {
        toast.success('Positions générées avec succès');
        handleClose();
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error saving positions:', err);
      const errorMessage =
        err?.response?.error ||
        err?.error ||
        err?.message ||
        'Erreur lors de l\'enregistrement des positions';
      setError(errorMessage);
      toast.error(errorMessage);
      setStep('review-positions');
    }
  };

  const handleClose = () => {
    // For successful withdrawal/addition execution, closing should finalize via onSuccess flow.
    // This avoids parent "cancel/keep en_cours" handlers overriding the successful state.
    const isAdditionRecalc = !!additionRecalculation;
    if ((isWithdrawal || isAdditionRecalc || isRecalculationSaved) && positionsSaved) {
      onSuccess();
      return;
    }
    setStep('loading-rates');
    setRates([]);
    setEditedRates({});
    setPositions([]);
    setError(null);
    setWithdrawalRecalculation(null);
    setAdditionRecalculation(null);
    setIsRecalculationSaved(false);
    setRecalculationPreview(null);
    setRecalculationExecution(null);
    generationHorizonDaysRef.current = '30';
    setGenerationHorizonDays('30');
    onClose();
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    return formatAmount(num, displayCurrency);
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

  const selectedInterestPeriod = (() => {
    const details = transaction?.subscription_details || {};
    return (
      details?.interestPeriod ||
      details?.interest_period ||
      transaction?.subscription_interest_period ||
      ''
    );
  })();

  const cumulativeInterestEnabled = String(selectedInterestPeriod || '')
    .toLowerCase()
    .includes('fin');

  const cumulativeInterestTakenIntoAccount = Boolean(selectedInterestPeriod);

  const isInvestmentUi = isInvestmentTransferTransaction(transaction);
  const useHorizonForProduct = Boolean(
    isInvestmentUi && !transactionHasExplicitContractDuration(transaction)
  );

  const calculateTargetProfit = (rate: PeriodRate, editedRate: string | undefined): string => {
    // Use edited rate if available and valid, otherwise use baseRatePct
    const rateStr = editedRate !== undefined && editedRate !== '' ? editedRate : rate.baseRatePct;
    const rateValue = parseFloat(rateStr);
    
    if (!Number.isFinite(rateValue)) {
      return formatCurrency('0');
    }
    
    // Parse capital base
    const capitalBase = parseFloat(rate.capitalBase);
    if (isNaN(capitalBase) || capitalBase <= 0) {
      return formatCurrency('0');
    }
    
    const proration = deriveRateProrationFromPeriod(rate.baseRatePct, rate.ratePct);
    
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
          {Number(transaction?.positionsCount ?? 0) > 0 && (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#78350f',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>Positions déjà présentes</div>
              <div style={{ lineHeight: 1.5 }}>
                L’enregistrement remplace les positions <strong>en attente</strong> sur ce produit pour ce client. Les
                positions ouvertes ou déjà réalisées ne sont pas supprimées par ce flux.
              </div>
            </div>
          )}

          <div
            style={{
              padding: '12px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '14px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px', color: '#0f172a' }}>
              Vérification cumul des intérêts
            </div>
            <div style={{ color: '#334155' }}>
              Période d&apos;intérêt de la transaction :{' '}
              <strong>{selectedInterestPeriod || 'Non renseignée'}</strong>
            </div>
            <div style={{ color: '#334155' }}>
              Cumul des intérêts (équivalent métier) :{' '}
              <strong>{cumulativeInterestEnabled ? 'Oui (Fin de contrat)' : 'Non'}</strong>
            </div>
            <div style={{ color: cumulativeInterestTakenIntoAccount ? '#166534' : '#b45309' }}>
              Pris en compte pour la génération :{' '}
              <strong>{cumulativeInterestTakenIntoAccount ? 'Oui' : 'Non (période manquante)'}</strong>
            </div>
          </div>

          {isWithdrawal && withdrawalRecalculation && (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px', color: '#0f172a' }}>
                Audit retrait et recalcul
              </div>
              <div style={{ color: '#334155' }}>
                Capital principal avant retrait : <strong>{formatCurrency(withdrawalRecalculation.principal_before_withdrawal)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Gains cumulés observés : <strong>{formatCurrency(withdrawalRecalculation.accrued_gains_before_withdrawal)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Intérêts déjà versés (transactions intérêts) : <strong>{formatCurrency(withdrawalRecalculation.paid_interests_before_withdrawal)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Gains encore dans le produit : <strong>{formatCurrency(withdrawalRecalculation.unpaid_gains_before_withdrawal)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Valeur avant retrait : <strong>{formatCurrency(withdrawalRecalculation.total_value_before_withdrawal)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Valeur après retrait : <strong>{formatCurrency(withdrawalRecalculation.total_value_after_withdrawal)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Facteur appliqué à la régénération : <strong>{withdrawalRecalculation.capital_scale_factor}</strong>
              </div>
            </div>
          )}

          {additionRecalculation && (
            <div
              style={{
                padding: '14px',
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px', color: '#0f172a' }}>
                Audit ajout et recalcul
              </div>
              <div style={{ color: '#334155' }}>
                Capital principal avant ajout : <strong>{formatCurrency(additionRecalculation.principal_before_addition)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Montant de l'ajout : <strong>{formatCurrency(additionRecalculation.addition_amount)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Capital principal après ajout : <strong>{formatCurrency(additionRecalculation.principal_after_addition)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Gains cumulés observés : <strong>{formatCurrency(additionRecalculation.accrued_gains_before_addition)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Intérêts déjà versés (transactions intérêts) : <strong>{formatCurrency(additionRecalculation.paid_interests_before_addition)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Gains encore dans le produit : <strong>{formatCurrency(additionRecalculation.unpaid_gains_before_addition)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Valeur avant ajout : <strong>{formatCurrency(additionRecalculation.total_value_before_addition)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Valeur après ajout : <strong>{formatCurrency(additionRecalculation.total_value_after_addition)}</strong>
              </div>
              <div style={{ color: '#334155' }}>
                Facteur appliqué à la régénération : <strong>{additionRecalculation.capital_scale_factor}</strong>
              </div>
            </div>
          )}

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
              <Button type="button" variant="outline" onClick={handleCancelLoading} style={{ marginTop: '20px' }}>
                Annuler
              </Button>
            </div>
          )}

          {step === 'review-rates' && (
            <div>
              {useHorizonForProduct && (
                <div
                  style={{
                    padding: '14px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '14px',
                  }}
                >
                  <Label htmlFor="generation-horizon-days" style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Horizon de génération (jours)
                  </Label>
                  <Input
                    id="generation-horizon-days"
                    type="number"
                    min={GENERATION_HORIZON_MIN}
                    max={GENERATION_HORIZON_MAX}
                    value={generationHorizonDays}
                    onChange={(e) => {
                      const v = e.target.value;
                      generationHorizonDaysRef.current = v;
                      setGenerationHorizonDays(v);
                    }}
                    style={{ maxWidth: '200px', marginBottom: '8px' }}
                  />
                  <p style={{ color: '#166534', marginBottom: '12px', lineHeight: 1.5 }}>
                    Ce produit n’a pas de durée contractuelle fixe. Indiquez sur combien de jours générer les
                    périodes (ex. 270 jours pour environ neuf « mois » de 30 jours, utile avec une rentabilité
                    trimestrielle). Plage autorisée : {GENERATION_HORIZON_MIN} à {GENERATION_HORIZON_MAX} jours.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      let hz = parseInt(generationHorizonDaysRef.current.trim(), 10);
                      if (!Number.isFinite(hz)) hz = GENERATION_HORIZON_MIN;
                      hz = Math.min(GENERATION_HORIZON_MAX, Math.max(GENERATION_HORIZON_MIN, hz));
                      generationHorizonDaysRef.current = String(hz);
                      setGenerationHorizonDays(String(hz));
                      generateRates();
                    }}
                  >
                    Régénérer les taux avec cet horizon
                  </Button>
                </div>
              )}
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
                          <li>
                            {useHorizonForProduct
                              ? 'L’horizon de génération (jours) est cohérent avec la rentabilité du produit'
                              : 'Le produit a une durée configurée (ou un horizon de génération suffisant)'}
                          </li>
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
                        onChange={(e) => {
                          const v = e.target.checked;
                          setAvoidLosses(v);
                          if (!v) setPositiveGainsOnly(false);
                        }}
                        style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: '500' }}>Eviter les pertes</span>
                    </label>
                    <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', marginLeft: '24px' }}>
                      Si activé, toutes les positions générées seront gagnantes ou neutres (aucune perte)
                    </p>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', marginTop: '12px' }}>
                      <input
                        type="checkbox"
                        checked={positiveGainsOnly}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setPositiveGainsOnly(v);
                          if (v) setAvoidLosses(true);
                        }}
                        style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: '500' }}>Gains uniquement sur chaque trade</span>
                    </label>
                    <p style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', marginLeft: '24px' }}>
                      Chaque position a un gain strictement positif (aucun trade à 0 €). Exige un profit de période suffisant par rapport au nombre de trades ; sinon la génération renverra une erreur explicite.
                    </p>
                  </div>

                  <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#0c4a6e' }}>
                      Fourchette de positions par mois (optionnel)
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                      Par défaut, le nombre de positions est calculé automatiquement selon le montant investi. 
                      Vous pouvez spécifier une fourchette pour contrôler la densité des positions.
                    </p>
                    
                    {positionsRangeError && (
                      <div style={{ 
                        padding: '10px', 
                        backgroundColor: '#fee2e2', 
                        color: '#991b1b', 
                        borderRadius: '4px', 
                        marginBottom: '12px',
                        fontSize: '13px'
                      }}>
                        {positionsRangeError}
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1', minWidth: '150px' }}>
                        <Label htmlFor="positions-per-month-min" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                          Minimum (positions/mois)
                        </Label>
                        <Input
                          id="positions-per-month-min"
                          type="number"
                          min="0"
                          step="1"
                          value={positionsPerMonthMin}
                          onChange={(e) => {
                            setPositionsPerMonthMin(e.target.value);
                            setPositionsRangeError(null);
                          }}
                          placeholder="Ex: 5"
                          style={{ width: '100%' }}
                        />
                      </div>
                      
                      <div style={{ flex: '1', minWidth: '150px' }}>
                        <Label htmlFor="positions-per-month-max" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                          Maximum (positions/mois)
                        </Label>
                        <Input
                          id="positions-per-month-max"
                          type="number"
                          min="0"
                          step="1"
                          value={positionsPerMonthMax}
                          onChange={(e) => {
                            setPositionsPerMonthMax(e.target.value);
                            setPositionsRangeError(null);
                          }}
                          placeholder="Ex: 20"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    
                    <p style={{ marginTop: '10px', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                      Note: Le système limite à 3 positions maximum par jour de bourse. 
                      Si votre fourchette est trop élevée, elle sera automatiquement ajustée ou une erreur sera affichée.
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
              <Button type="button" variant="outline" onClick={handleCancelLoading} style={{ marginTop: '20px' }}>
                Annuler
              </Button>
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
                    ⚠️ {isWithdrawal ? 'Prévisualisation (dry-run): positions qui seront supprimées' : 'Positions qui seront supprimées'}
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
                                <td style={{ padding: '6px' }}>{pos.asset_name || 'Aucun'}</td>
                                <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(pos.invested_amount)}</td>
                                <td style={{ 
                                  padding: '6px', 
                                  textAlign: 'right',
                                  color: parseFloat(pos.profit_loss) >= 0 ? '#16a34a' : '#dc2626'
                                }}>
                                  {formatCurrency(pos.profit_loss)}
                                </td>
                                <td style={{ padding: '6px', fontSize: '10px' }}>
                                  {pos.opened_at ? formatDateTime(pos.opened_at) : 'Aucun'}
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

              {isWithdrawal && !positionsSaved && recalculationPreview && (
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#1e3a8a' }}>
                    Prévisualisation (dry-run)
                  </div>
                  <div style={{ fontSize: '14px', color: '#334155' }}>
                    Statut : <strong>{recalculationPreview.status}</strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#334155' }}>
                    Suppressions attendues : <strong>{recalculationPreview.deleted_total_expected}</strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#334155' }}>
                    Régénérations attendues : <strong>{recalculationPreview.regenerated_total_expected}</strong>
                  </div>
                  {recalculationPreview.generated_positions_preview_note && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: '#475569' }}>
                      {recalculationPreview.generated_positions_preview_note}
                    </div>
                  )}
                  {recalculationPreview.per_transaction_expected?.length > 0 && (
                    <details style={{ marginTop: '10px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}>
                        Voir le détail par transaction ({recalculationPreview.per_transaction_expected.length})
                      </summary>
                      <ul style={{ marginTop: '8px', marginLeft: '18px', fontSize: '13px', color: '#334155' }}>
                        {recalculationPreview.per_transaction_expected.map((item) => (
                          <li key={item.transaction_id}>
                            {item.transaction_id}: supprimées={item.before_pending}, régénérées={item.created}, statut={item.status}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {recalculationPreview.errors?.length > 0 && (
                    <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '13px' }}>
                      <strong>Erreurs preview :</strong>
                      <ul style={{ marginTop: '6px', marginLeft: '18px' }}>
                        {recalculationPreview.errors.map((errMsg, idx) => (
                          <li key={`${idx}-${errMsg}`}>{errMsg}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {isWithdrawal && recalculationExecution && (
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: recalculationExecution.status === 'ok' ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${recalculationExecution.status === 'ok' ? '#86efac' : '#fecaca'}`,
                    borderRadius: '8px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#0f172a' }}>
                    Exécution réelle du recalcul
                  </div>
                  <div style={{ fontSize: '14px', color: '#334155' }}>
                    Statut : <strong>{recalculationExecution.status === 'ok' ? 'Succès' : 'Échec'}</strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#334155' }}>
                    Positions supprimées : <strong>{recalculationExecution.deleted_total}</strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#334155' }}>
                    Positions régénérées : <strong>{recalculationExecution.regenerated_total}</strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#334155' }}>
                    Pending final en base : <strong>{recalculationExecution.final_pending_total}</strong>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
                    Note: &quot;Positions régénérées&quot; est le total créé. L&apos;onglet &quot;À venir&quot; peut être plus bas si certaines
                    positions passent immédiatement en &quot;Ouvertes&quot; ou &quot;Fermées&quot; selon l&apos;heure d&apos;ouverture/fermeture.
                  </div>
                  {recalculationExecution.errors?.length > 0 && (
                    <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '13px' }}>
                      <strong>Erreurs :</strong>
                      <ul style={{ marginTop: '6px', marginLeft: '18px' }}>
                        {recalculationExecution.errors.map((errMsg, idx) => (
                          <li key={`${idx}-${errMsg}`}>{errMsg}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              <p style={{ marginBottom: '20px', color: '#64748b' }}>
                {isWithdrawal
                  ? `${recalculationPreview?.regenerated_total_expected ?? 0} position(s) attendue(s) après exécution.`
                  : `${positions.length} position(s) générée(s). Veuillez vérifier avant de valider :`}
              </p>

              {( !isWithdrawal || (isWithdrawal && positions.length > 0) ) && (
              <>
              {isWithdrawal && (
                <div style={{ marginBottom: '10px', fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>
                  Liste des positions attendues (prévisualisation dry-run)
                </div>
              )}
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
              </>
              )}

              {!isWithdrawal && (
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
              )}

              <div className="modal-form-actions">
                {(() => {
                  const isAdditionRecalc = !!additionRecalculation || isRecalculationSaved;
                  return isWithdrawal && readyToConfirm && !positionsSaved ? (
                  // For withdrawals after clicking "Valider", show confirm button to actually save
                  <>
                    <Button type="button" variant="outline" onClick={() => setStep('review-rates')}>
                      Retour
                    </Button>
                    <Button type="button" onClick={handleConfirm}>
                      Confirmer
                    </Button>
                  </>
                ) : (isWithdrawal || isAdditionRecalc) && positionsSaved ? (
                  <>
                    <Button type="button" onClick={handleClose}>
                      Fermer
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
                );
                })()}
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
