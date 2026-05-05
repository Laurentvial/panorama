import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { CheckCircle, XCircle, Clock, FileText, Image as ImageIcon, Save, Power, PowerOff } from 'lucide-react';
import { apiCall } from '../utils/api';
import { toast } from 'sonner';

interface ClientVerificationTabProps {
  client: any;
  clientId?: string;
}

const SEX_LABELS: Record<string, string> = {
  male: 'Homme',
  female: 'Femme',
  other: 'Autre',
};

const TRADING_OBJECTIVE_LABELS: Record<string, string> = {
  short_term: 'Rendements à court terme',
  extra_income: 'Revenus supplémentaires',
  future_planning: "Planification de l'avenir (éducation des enfants, retraite, etc.)",
  save_house: 'Épargne pour une maison',
};

const COMPLIANCE_LABELS: Record<string, string> = {
  admin_or_shareholder_10pct: "Un administrateur ou un actionnaire à 10 % d'une société cotée en bourse.",
  brokerage_employee: 'Employé par une société de courtage ou une bourse de valeurs.',
  public_official: 'Un responsable public de haut niveau, actuel ou ancien, élu ou nommé.',
  none: "Aucune de ces options ne s'applique.",
};

const FUNDS_SOURCES_LABELS: Record<string, string> = {
  salary: 'Salaire',
  investments: 'Investissements',
  savings: 'Économies',
  retirement: 'Retraite',
  inheritance: 'Héritage',
  severance: 'Indemnité de départ',
  other: 'Autre',
};

const PREFERENCE_LABELS: Record<string, string> = {
  stocks: 'Actions',
  crypto: 'Cryptomonnaies',
  etf: 'ETF',
  currencies: 'Devises',
  commodities: 'Matières premières',
  indices: 'Indices',
};

const KYC_STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: 'En attente', icon: <Clock className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-800' },
  submitted: { label: 'Soumis', icon: <FileText className="w-4 h-4" />, color: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Approuvé', icon: <CheckCircle className="w-4 h-4" />, color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejeté', icon: <XCircle className="w-4 h-4" />, color: 'bg-red-100 text-red-800' },
};

const DEFAULT_KYC_DOCUMENTS: Record<string, boolean> = {
  identityDocument: true,
  identityDocumentVerso: true,
  proofOfAddress: true,
  selfiePhoto: true,
};

const KYC_DOCUMENT_LABELS: Record<string, string> = {
  identityDocument: "Pièce d'identité (recto)",
  identityDocumentVerso: "Pièce d'identité (verso)",
  proofOfAddress: 'Justificatif de domicile',
  selfiePhoto: "Selfie avec pièce d'identité",
};

const KYC_DOCUMENT_FILE_KEYS: Record<string, string[]> = {
  identityDocument: ['identityDocument', 'identity_document'],
  identityDocumentVerso: ['identityDocumentVerso', 'identity_document_verso'],
  proofOfAddress: ['proofOfAddress', 'proof_of_address'],
  selfiePhoto: ['selfiePhoto', 'selfie_photo'],
};

type KycDocumentReviewStatus = 'pending' | 'approved' | 'rejected';

const KYC_DOCUMENT_REVIEW_LABELS: Record<KycDocumentReviewStatus, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée',
};

const KYC_DOCUMENT_REVIEW_BADGE_CLASSES: Record<KycDocumentReviewStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const STEP_LABELS: Record<string, string> = {
  step_1: 'Question 1 : Identité',
  step_2: 'Question 2 : Adresse',
  step_3: 'Question 3 : Profil',
  step_4: 'Question 4 : Préférences',
  step_5: 'Question 5 : Objectifs',
  step_6: 'Question 6 : Conformité',
  step_7: 'Question 7 : Sources de revenus',
  step_8: 'Question 8 : Vérification KYC',
};

export function ClientVerificationTab({ client, clientId }: ClientVerificationTabProps) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewSavingByDocument, setReviewSavingByDocument] = useState<Record<string, boolean>>({});
  const [stepsConfig, setStepsConfig] = useState<Record<string, { enabled: boolean; questions?: Record<string, boolean> }>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<any>(null);
  const [kycStatus, setKycStatus] = useState<string>((client?.kycStatus || client?.kyc_status || 'pending') as string);
  const [kycReviewedAt, setKycReviewedAt] = useState<string | null>((client?.kycReviewedAt || client?.kyc_reviewed_at || null) as string | null);
  const [kycDocumentsReview, setKycDocumentsReview] = useState<Record<string, KycDocumentReviewStatus>>(
    (client?.kycDocumentsReview || client?.kyc_documents_review || {}) as Record<string, KycDocumentReviewStatus>,
  );

  const actualClientId = clientId || client?.id;

  useEffect(() => {
    setKycStatus((client?.kycStatus || client?.kyc_status || 'pending') as string);
    setKycReviewedAt((client?.kycReviewedAt || client?.kyc_reviewed_at || null) as string | null);
    setKycDocumentsReview(
      (client?.kycDocumentsReview || client?.kyc_documents_review || {}) as Record<string, KycDocumentReviewStatus>,
    );
  }, [client]);

  useEffect(() => {
    if (actualClientId) {
      loadConfig();
    }
  }, [actualClientId]);

  const loadConfig = async () => {
    if (!actualClientId) return;
    try {
      setLoading(true);
      const data = await apiCall(`/api/clients/${actualClientId}/verification-config/?_t=${Date.now()}`);
      setConfig(data);
      // Initialiser stepsConfig : 1–5 et 8 actifs par défaut si absents ; 6–7 inactifs par défaut.
      const steps: Record<string, { enabled: boolean; questions?: Record<string, boolean> }> = {};
      const loadedStepsConfig = data?.stepsConfig || {};
      console.log('Loaded config from server:', data);
      console.log('Loaded stepsConfig:', loadedStepsConfig);
      console.log('Step 3 in loaded config:', loadedStepsConfig.step_3);
      for (let i = 1; i <= 8; i++) {
        const stepKey = `step_${i}`;
        const defaultEnabled = i === 6 || i === 7 ? false : true;
        if (loadedStepsConfig[stepKey] !== undefined) {
          steps[stepKey] = loadedStepsConfig[stepKey];
          console.log(`Step ${i} (${stepKey}):`, loadedStepsConfig[stepKey], 'enabled:', loadedStepsConfig[stepKey]?.enabled);
        } else {
          steps[stepKey] = { enabled: defaultEnabled };
          console.log(`Step ${i} (${stepKey}): not found in config, defaulting to enabled:`, defaultEnabled);
        }
      }
      const step8 = steps.step_8 && typeof steps.step_8 === 'object' ? steps.step_8 : { enabled: true };
      const existingQuestions = step8.questions && typeof step8.questions === 'object' ? step8.questions : {};
      steps.step_8 = {
        ...step8,
        questions: {
          ...DEFAULT_KYC_DOCUMENTS,
          ...existingQuestions,
        },
      };
      setStepsConfig(steps);
      setOriginalConfig(JSON.stringify(steps)); // Sauvegarder l'état original pour comparer
      setHasUnsavedChanges(false);
    } catch (error: any) {
      console.error('Error loading verification config:', error);
      // Initialiser avec des valeurs par défaut si erreur (6–7 désactivées)
      const steps: Record<string, { enabled: boolean; questions?: Record<string, boolean> }> = {};
      for (let i = 1; i <= 8; i++) {
        steps[`step_${i}`] = { enabled: !(i === 6 || i === 7) };
      }
      steps.step_8 = {
        ...steps.step_8,
        questions: { ...DEFAULT_KYC_DOCUMENTS },
      };
      setStepsConfig(steps);
      setOriginalConfig(JSON.stringify(steps));
      setHasUnsavedChanges(false);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!actualClientId) return;
    try {
      setSaving(true);
      await apiCall(`/api/clients/${actualClientId}/verification-config/`, {
        method: 'PUT',
        body: JSON.stringify({
          stepsConfig: stepsConfig,
        }),
      });
      toast.success('Configuration sauvegardée avec succès');
      await loadConfig();
    } catch (error: any) {
      console.error('Error saving verification config:', error);
      toast.error('Erreur lors de la sauvegarde de la configuration');
    } finally {
      setSaving(false);
    }
  };

  const toggleStep = async (stepKey: string) => {
    if (!actualClientId) return;
    
    const previousConfig = { ...stepsConfig }; // Sauvegarder l'état précédent
    const newEnabled = !stepsConfig[stepKey]?.enabled;
    const updatedConfig = {
      ...stepsConfig,
      [stepKey]: {
        ...stepsConfig[stepKey],
        enabled: newEnabled,
      },
    };
    
    // Mettre à jour l'état local immédiatement
    setStepsConfig(updatedConfig);
    
    // Sauvegarder automatiquement
    try {
      console.log('Saving verification config:', updatedConfig, `Step ${stepKey} enabled:`, newEnabled);
      const response = await apiCall(`/api/clients/${actualClientId}/verification-config/`, {
        method: 'PUT',
        body: JSON.stringify({
          stepsConfig: updatedConfig,
        }),
      });
      
      // Verify the response matches what we sent
      const savedConfig = (response as any)?.stepsConfig || {};
      console.log('Config saved successfully. Response:', savedConfig);
      console.log(`Step ${stepKey} in saved config:`, savedConfig[stepKey]);
      
      // Verify step 3 specifically if that's what we're saving
      if (stepKey === 'step_3') {
        console.log('Step 3 enabled in saved config?', savedConfig.step_3?.enabled !== false);
        if (savedConfig.step_3?.enabled === newEnabled) {
          console.log('✓ Step 3 config saved correctly');
        } else {
          console.error('✗ Step 3 config mismatch! Expected enabled:', newEnabled, 'Got:', savedConfig.step_3?.enabled);
        }
      }
      
      // Mettre à jour la config originale pour éviter l'indicateur de changements non sauvegardés
      setOriginalConfig(JSON.stringify(updatedConfig));
      setHasUnsavedChanges(false);
      
      // Feedback visuel
      toast.success(
        newEnabled 
          ? `${STEP_LABELS[stepKey]} activée` 
          : `${STEP_LABELS[stepKey]} désactivée`,
        { duration: 1500 }
      );
    } catch (error: any) {
      console.error('Error saving verification config:', error);
      console.error('Error details:', error?.response || error?.message);
      toast.error('Erreur lors de la sauvegarde');
      // Revenir à l'état précédent en cas d'erreur
      setStepsConfig(previousConfig);
    }
  };

  // Vérifier s'il y a des changements non sauvegardés
  useEffect(() => {
    if (originalConfig) {
      const currentConfig = JSON.stringify(stepsConfig);
      setHasUnsavedChanges(currentConfig !== originalConfig);
    }
  }, [stepsConfig, originalConfig]);

  const isStepEnabled = (stepNumber: number): boolean => {
    const stepKey = `step_${stepNumber}`;
    const v = stepsConfig[stepKey]?.enabled;
    if (v === true || v === false) {
      return v;
    }
    return !(stepNumber === 6 || stepNumber === 7);
  };

  const isKycDocumentRequested = (documentKey: string): boolean => {
    const value = stepsConfig.step_8?.questions?.[documentKey];
    return value !== false;
  };

  const toggleKycDocument = async (documentKey: string) => {
    if (!actualClientId) return;

    const previousConfig = { ...stepsConfig };
    const step8 = stepsConfig.step_8 || { enabled: true };
    const currentQuestions =
      step8.questions && typeof step8.questions === 'object'
        ? { ...DEFAULT_KYC_DOCUMENTS, ...step8.questions }
        : { ...DEFAULT_KYC_DOCUMENTS };
    const newValue = !isKycDocumentRequested(documentKey);

    const updatedConfig = {
      ...stepsConfig,
      step_8: {
        ...step8,
        questions: {
          ...currentQuestions,
          [documentKey]: newValue,
        },
      },
    };

    setStepsConfig(updatedConfig);

    try {
      await apiCall(`/api/clients/${actualClientId}/verification-config/`, {
        method: 'PUT',
        body: JSON.stringify({
          stepsConfig: updatedConfig,
        }),
      });

      setOriginalConfig(JSON.stringify(updatedConfig));
      setHasUnsavedChanges(false);
      toast.success(
        newValue
          ? `${KYC_DOCUMENT_LABELS[documentKey]} demandé`
          : `${KYC_DOCUMENT_LABELS[documentKey]} non demandé`,
        { duration: 1500 }
      );
    } catch (error: any) {
      console.error('Error saving KYC documents config:', error);
      toast.error('Erreur lors de la sauvegarde');
      setStepsConfig(previousConfig);
    }
  };

  const renderStepToggleButton = (stepNumber: number) => {
    const stepKey = `step_${stepNumber}`;
    const enabled = isStepEnabled(stepNumber);
    return (
      <Button
        size="sm"
        variant={enabled ? "destructive" : "outline"}
        onClick={() => toggleStep(stepKey)}
        style={!enabled ? {
          backgroundColor: '#16a34a',
          color: '#ffffff',
          borderColor: '#16a34a',
          opacity: 1
        } : {}}
        className={!enabled ? "hover:bg-green-700 hover:text-white hover:border-green-700" : ""}
      >
        {enabled ? (
          <>
            <PowerOff className="w-4 h-4 mr-2" />
            Désactiver
          </>
        ) : (
          <>
            <Power className="w-4 h-4 mr-2" />
            Activer
          </>
        )}
      </Button>
    );
  };

  const renderKycDocumentToggleButton = (documentKey: string) => {
    const requested = isKycDocumentRequested(documentKey);
    return (
      <Button
        size="sm"
        variant={requested ? "destructive" : "outline"}
        onClick={() => toggleKycDocument(documentKey)}
        style={!requested ? {
          backgroundColor: '#16a34a',
          color: '#ffffff',
          borderColor: '#16a34a',
          opacity: 1
        } : {}}
        className={!requested ? "hover:bg-green-700 hover:text-white hover:border-green-700" : ""}
      >
        {requested ? (
          <>
            <PowerOff className="w-4 h-4 mr-2" />
            Désactiver
          </>
        ) : (
          <>
            <Power className="w-4 h-4 mr-2" />
            Activer
          </>
        )}
      </Button>
    );
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return date;
    }
  };

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return date;
    }
  };

  const getKycDocumentUrl = (documentKey: string): string => {
    const possibleKeys = KYC_DOCUMENT_FILE_KEYS[documentKey] || [];
    for (const key of possibleKeys) {
      const value = client?.[key];
      if (typeof value === 'string' && value.trim() !== '') {
        return value;
      }
    }
    return '';
  };

  const getKycDocumentReviewStatus = (documentKey: string): KycDocumentReviewStatus => {
    const statusValue = (kycDocumentsReview?.[documentKey] || 'pending') as string;
    if (statusValue === 'approved' || statusValue === 'rejected') {
      return statusValue;
    }
    return 'pending';
  };

  const handleKycDocumentReviewStatusChange = async (
    documentKey: string,
    nextStatus: KycDocumentReviewStatus,
  ) => {
    if (!actualClientId) return;

    const nextDocumentsReview = {
      ...kycDocumentsReview,
      [documentKey]: nextStatus,
    };

    const uploadedDocumentKeys = Object.keys(KYC_DOCUMENT_LABELS).filter((key) => Boolean(getKycDocumentUrl(key)));
    const uploadedStatuses = uploadedDocumentKeys.map((key) => nextDocumentsReview[key] || 'pending');
    const anyRejected = uploadedStatuses.some((status) => status === 'rejected');
    const allApproved = uploadedStatuses.length > 0 && uploadedStatuses.every((status) => status === 'approved');
    const nextGlobalKycStatus = anyRejected ? 'rejected' : allApproved ? 'approved' : 'submitted';
    const nextReviewedAt = new Date().toISOString();

    setReviewSavingByDocument((prev) => ({ ...prev, [documentKey]: true }));
    try {
      await apiCall(`/api/clients/${actualClientId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          kycDocumentsReview: nextDocumentsReview,
          kycStatus: nextGlobalKycStatus,
          kycReviewedAt: nextReviewedAt,
        }),
      });
      setKycDocumentsReview(nextDocumentsReview);
      setKycStatus(nextGlobalKycStatus);
      setKycReviewedAt(nextReviewedAt);
      toast.success('Statut de la pièce justificative mis à jour.');
    } catch (error: any) {
      console.error('Error updating KYC document review status:', error);
      toast.error(error?.message || 'Erreur lors de la mise à jour du statut du document.');
    } finally {
      setReviewSavingByDocument((prev) => ({ ...prev, [documentKey]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-600">Chargement de la configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Indicateur de changements et bouton de sauvegarde */}
      {hasUnsavedChanges && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800 font-medium">
                  Vous avez des modifications non sauvegardées
                </span>
              </div>
              <Button 
                onClick={saveConfig} 
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Sauvegarde...' : 'Sauvegarder la configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4 rounded-lg border border-slate-200 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Étape 1 : Informations personnelles (Questions 1 à 2)</h2>
        </div>

        {/* Question 1: Identité */}
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Question 1 : Identité</CardTitle>
            <div className="flex items-center gap-3">
              {renderStepToggleButton(1)}
            </div>
          </div>
        </CardHeader>
        {isStepEnabled(1) && (
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Informations d'identité</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600">Prénom</Label>
                  <p className="mt-1">{client.firstName || client.fname || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Deuxième prénom</Label>
                  <p className="mt-1">{client.middleName || client.middle_name || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Nom de famille</Label>
                  <p className="mt-1">{client.lastName || client.lname || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Sexe</Label>
                  <p className="mt-1">{client.sex ? SEX_LABELS[client.sex] || client.sex : '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Date de naissance</Label>
                  <p className="mt-1">{formatDate(client.birthDate || client.birth_date)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        </Card>

        {/* Question 2: Adresse */}
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Question 2 : Adresse</CardTitle>
            <div className="flex items-center gap-3">
              {renderStepToggleButton(2)}
            </div>
          </div>
        </CardHeader>
        {isStepEnabled(2) && (
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Adresse de résidence</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-slate-600">Adresse</Label>
                  <p className="mt-1">{client.address || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Code postal</Label>
                  <p className="mt-1">{client.postalCode || client.postal_code || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Ville</Label>
                  <p className="mt-1">{client.city || '-'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        </Card>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Étape 2 : Profil investisseur (Questions 3 à 7)</h2>
        </div>

        {/* Question 3: Profil */}
        <Card className={!isStepEnabled(3) ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Question 3 : Profil</CardTitle>
            <div className="flex items-center gap-3">
              {renderStepToggleButton(3)}
            </div>
          </div>
        </CardHeader>
        {isStepEnabled(3) && (
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Informations professionnelles et financières</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600">Profession principale</Label>
                  <p className="mt-1">{client.primaryProfession || client.primary_profession || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Nom de l'employeur</Label>
                  <p className="mt-1">{client.employerName || client.employer_name || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Revenu annuel net</Label>
                  <p className="mt-1">{client.annualNetIncome || client.annual_net_income || '-'}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Solde</Label>
                  <p className="mt-1">{client.totalLiquidities || client.total_liquidities || '-'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        </Card>

        {/* Question 4: Préférences */}
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Question 4 : Préférences</CardTitle>
            <div className="flex items-center gap-3">
              {renderStepToggleButton(4)}
            </div>
          </div>
        </CardHeader>
        {isStepEnabled(4) && (
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Préférences d'investissement</h3>
              <div>
                <Label className="text-slate-600">Préférences de trading</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {client.preferences && Array.isArray(client.preferences) && client.preferences.length > 0 ? (
                    client.preferences.map((pref: string) => (
                      <Badge key={pref} variant="outline">
                        {PREFERENCE_LABELS[pref] || pref}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-slate-500">Aucune préférence sélectionnée</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        )}
        </Card>

        {/* Question 5: Objectifs */}
        <Card className={!isStepEnabled(5) ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Question 5 : Objectifs</CardTitle>
            <div className="flex items-center gap-3">
              {renderStepToggleButton(5)}
            </div>
          </div>
        </CardHeader>
        {isStepEnabled(5) && (
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Objectifs d'investissement</h3>
              <div>
                <Label className="text-slate-600">Objectif principal de trading</Label>
                <p className="mt-1">
                  {client.tradingObjective
                    ? TRADING_OBJECTIVE_LABELS[client.tradingObjective] || client.tradingObjective
                    : '-'}
                </p>
              </div>
              <div>
                <Label className="text-slate-600">Montant prévu d'investissement (12 mois)</Label>
                <p className="mt-1">{client.plannedInvestment12m || client.planned_investment_12m || '-'}</p>
              </div>
            </div>
          </CardContent>
        )}
        </Card>

        {/* Question 6: Conformité */}
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Question 6 : Conformité</CardTitle>
            <div className="flex items-center gap-3">
              {renderStepToggleButton(6)}
            </div>
          </div>
        </CardHeader>
        {isStepEnabled(6) && (
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Déclarations de conformité</h3>
              <div>
                <Label className="text-slate-600">Réponses de conformité</Label>
                <div className="mt-2 space-y-2">
                  {client.complianceFamilyFlags &&
                  Array.isArray(client.complianceFamilyFlags) &&
                  client.complianceFamilyFlags.length > 0 ? (
                    client.complianceFamilyFlags.map((flag: string) => (
                      <div key={flag} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                        <p className="text-sm">{COMPLIANCE_LABELS[flag] || flag}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500">Aucune réponse fournie</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        )}
        </Card>

        {/* Question 7: Sources de fonds */}
        <Card className={!isStepEnabled(7) ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Question 7 : Sources de revenus</CardTitle>
            <div className="flex items-center gap-3">
              {renderStepToggleButton(7)}
            </div>
          </div>
        </CardHeader>
        {isStepEnabled(7) && (
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Sources de revenus</h3>
              <div>
                <Label className="text-slate-600">Sources de fonds</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {client.fundsSources && Array.isArray(client.fundsSources) && client.fundsSources.length > 0 ? (
                    client.fundsSources.map((source: string) => (
                      <Badge key={source} variant="outline">
                        {FUNDS_SOURCES_LABELS[source] || source}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-slate-500">Aucune source sélectionnée</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        )}
        </Card>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Étape 3 : Vérification documentaire (Question 8)</h2>
        </div>

        {/* Question 8: KYC */}
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Question 8 : Vérification KYC</CardTitle>
            <div className="flex items-center gap-3">
              {kycStatus && (
                <Badge className={KYC_STATUS_LABELS[kycStatus]?.color || 'bg-gray-100 text-gray-800'}>
                  <span className="flex items-center gap-1">
                    {KYC_STATUS_LABELS[kycStatus]?.icon}
                    {KYC_STATUS_LABELS[kycStatus]?.label || kycStatus}
                  </span>
                </Badge>
              )}
              {renderStepToggleButton(8)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Documents demandés</h3>
            <div className="text-sm text-slate-600">
              Activez ou désactivez les documents que le client devra fournir pendant la vérification KYC.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(KYC_DOCUMENT_LABELS).map(([documentKey, documentLabel]) => {
                const requested = isKycDocumentRequested(documentKey);
                return (
                  <div key={documentKey} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-700">{documentLabel}</span>
                      <Badge className={requested ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}>
                        {requested ? 'Demandé' : 'Non demandé'}
                      </Badge>
                    </div>
                    {renderKycDocumentToggleButton(documentKey)}
                  </div>
                );
              })}
            </div>
            {!isStepEnabled(8) && (
              <div className="text-sm text-slate-500">
                Étape 8 désactivée : ces documents ne seront pas demandés côté client, mais vous pouvez préparer la configuration ici.
              </div>
            )}
          </div>

          {isStepEnabled(8) && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Documents KYC</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(KYC_DOCUMENT_LABELS).map(([documentKey, documentLabel]) => {
                    const documentUrl = getKycDocumentUrl(documentKey);
                    const reviewStatus = getKycDocumentReviewStatus(documentKey);
                    const isSavingDocumentReview = !!reviewSavingByDocument[documentKey];

                    return (
                      <div key={documentKey} className="rounded-md border border-slate-200 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-slate-600">{documentLabel}</Label>
                          <Badge className={KYC_DOCUMENT_REVIEW_BADGE_CLASSES[reviewStatus]}>
                            {KYC_DOCUMENT_REVIEW_LABELS[reviewStatus]}
                          </Badge>
                        </div>

                        {documentUrl ? (
                          <a
                            href={documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                          >
                            <ImageIcon className="w-4 h-4" />
                            <span>Voir le document</span>
                          </a>
                        ) : (
                          <p className="text-slate-500">Non fourni</p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          {reviewStatus !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleKycDocumentReviewStatusChange(documentKey, 'approved')}
                              disabled={!documentUrl || isSavingDocumentReview}
                              className="rounded-sm px-1 underline underline-offset-2 decoration-1 transition-all text-blue-700 hover:bg-green-50 hover:text-green-700 hover:decoration-2 hover:decoration-green-700 hover:underline-offset-4 disabled:text-slate-400 disabled:no-underline"
                            >
                              Valider
                            </button>
                          )}
                          {reviewStatus !== 'rejected' && (
                            <button
                              type="button"
                              onClick={() => handleKycDocumentReviewStatusChange(documentKey, 'rejected')}
                              disabled={!documentUrl || isSavingDocumentReview}
                              className="underline underline-offset-2 decoration-1 transition-all text-blue-700 hover:text-red-700 hover:decoration-2 hover:underline-offset-4 disabled:text-slate-400 disabled:no-underline"
                            >
                              Rejeter
                            </button>
                          )}
                          {reviewStatus !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleKycDocumentReviewStatusChange(documentKey, 'pending')}
                              disabled={!documentUrl || isSavingDocumentReview}
                              className="underline underline-offset-2 decoration-1 transition-all text-blue-700 hover:text-amber-700 hover:decoration-2 hover:underline-offset-4 disabled:text-slate-400 disabled:no-underline"
                            >
                              En attente
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
            </div>
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b pb-2">Informations de traitement</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600">Date de soumission</Label>
                  <p className="mt-1">{formatDateTime(client.kycSubmittedAt || client.kyc_submitted_at)}</p>
                </div>
                <div>
                  <Label className="text-slate-600">Date de révision</Label>
                  <p className="mt-1">{formatDateTime(kycReviewedAt)}</p>
                </div>
              </div>
            </div>
            </>
          )}
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
