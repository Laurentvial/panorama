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

const STEP_LABELS: Record<string, string> = {
  step_1: 'Étape 1 : Identité',
  step_2: 'Étape 2 : Adresse',
  step_3: 'Étape 3 : Profil',
  step_4: 'Étape 4 : Préférences',
  step_5: 'Étape 5 : Objectifs',
  step_6: 'Étape 6 : Conformité',
  step_7: 'Étape 7 : Sources de revenus',
  step_8: 'Étape 8 : Vérification KYC',
};

export function ClientVerificationTab({ client, clientId }: ClientVerificationTabProps) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stepsConfig, setStepsConfig] = useState<Record<string, { enabled: boolean; questions?: Record<string, boolean> }>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<any>(null);

  const actualClientId = clientId || client?.id;

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
      const steps: Record<string, { enabled: boolean }> = {};
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

      {/* Étape 1: Identité */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Étape 1 : Identité</CardTitle>
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

      {/* Étape 2: Adresse */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Étape 2 : Adresse</CardTitle>
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

      {/* Étape 3: Profil */}
      <Card className={!isStepEnabled(3) ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Étape 3 : Profil</CardTitle>
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

      {/* Étape 4: Préférences */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Étape 4 : Préférences</CardTitle>
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

      {/* Étape 5: Objectifs */}
      <Card className={!isStepEnabled(5) ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Étape 5 : Objectifs</CardTitle>
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

      {/* Étape 6: Conformité */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Étape 6 : Conformité</CardTitle>
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

      {/* Étape 7: Sources de fonds */}
      <Card className={!isStepEnabled(7) ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Étape 7 : Sources de revenus</CardTitle>
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

      {/* Étape 8: KYC */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Étape 8 : Vérification KYC</CardTitle>
            <div className="flex items-center gap-3">
              {client.kycStatus && (
                <Badge className={KYC_STATUS_LABELS[client.kycStatus]?.color || 'bg-gray-100 text-gray-800'}>
                  <span className="flex items-center gap-1">
                    {KYC_STATUS_LABELS[client.kycStatus]?.icon}
                    {KYC_STATUS_LABELS[client.kycStatus]?.label || client.kycStatus}
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
                <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600">Pièce d'identité (recto)</Label>
                  {client.identityDocument ? (
                    <div className="mt-2">
                      <a
                        href={client.identityDocument}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>Voir le document</span>
                      </a>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">Non fourni</p>
                  )}
                </div>
                <div>
                  <Label className="text-slate-600">Pièce d'identité (verso)</Label>
                  {client.identityDocumentVerso ? (
                    <div className="mt-2">
                      <a
                        href={client.identityDocumentVerso}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>Voir le document</span>
                      </a>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">Non fourni</p>
                  )}
                </div>
                <div>
                  <Label className="text-slate-600">Justificatif de domicile</Label>
                  {client.proofOfAddress || client.proof_of_address ? (
                    <div className="mt-2">
                      <a
                        href={client.proofOfAddress || client.proof_of_address}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>Voir le document</span>
                      </a>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">Non fourni</p>
                  )}
                </div>
                <div>
                  <Label className="text-slate-600">Selfie avec pièce d'identité</Label>
                  {client.selfiePhoto || client.selfie_photo ? (
                    <div className="mt-2">
                      <a
                        href={client.selfiePhoto || client.selfie_photo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>Voir la photo</span>
                      </a>
                    </div>
                  ) : (
                    <p className="mt-1 text-slate-500">Non fourni</p>
                  )}
                </div>
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
                  <p className="mt-1">{formatDateTime(client.kycReviewedAt || client.kyc_reviewed_at)}</p>
                </div>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
