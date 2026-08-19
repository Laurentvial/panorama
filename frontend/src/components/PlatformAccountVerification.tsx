import React, { useEffect, useMemo, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';

import { useUser } from '../contexts/UserContext';

import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN } from '../utils/constants';
import { apiCall } from '../utils/api';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

import { useIsMobile } from './ui/use-mobile';

import { cn } from './ui/utils';

import { Card, CardContent, CardHeader } from './ui/card';
import { Badge } from './ui/badge';

import { Button } from './ui/button';

import { Input } from './ui/input';

import { Label } from './ui/label';

import { DateInput } from './ui/date-input';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import { Checkbox } from './ui/checkbox';

import {
  Plus,

  Check,

  TrendingUp,

  Coins,

  Layers,

  DollarSign,

  Package,

  BarChart3,

  Briefcase,

  PiggyBank,

  Landmark,

  Gift,

  LifeBuoy,

  BadgePercent,

  Home,

  Wallet,

  Shield,

  Scale,

  CheckCircle2,

} from 'lucide-react';

import '../styles/PlatformPortfolio.css';

type SexValue = '' | 'male' | 'female' | 'other';

type Step = 1 | 2 | 3;
type KycDocumentField = 'identityDocument' | 'identityDocumentVerso' | 'proofOfAddress' | 'selfiePhoto';
type KycReviewStatus = 'pending' | 'approved' | 'rejected';



type PreferenceId =

  | 'stocks'

  | 'crypto'

  | 'etf'

  | 'currencies'

  | 'commodities'

  | 'indices';



const PREFERENCE_OPTIONS: Array<{

  id: PreferenceId;

  label: string;

  Icon: React.ComponentType<{ size?: number; className?: string }>;

}> = [

  { id: 'stocks', label: 'Actions', Icon: TrendingUp },

  { id: 'crypto', label: 'Cryptomonnaies', Icon: Coins },

  { id: 'etf', label: 'ETF', Icon: Layers },

  { id: 'currencies', label: 'Devises', Icon: DollarSign },

  { id: 'commodities', label: 'Matières premières', Icon: Package },

  { id: 'indices', label: 'Indices', Icon: BarChart3 },

];



const verificationCircleToggleBaseStyle: React.CSSProperties = {

  width: 34,

  height: 34,

  borderRadius: '999px',

  display: 'flex',

  alignItems: 'center',

  justifyContent: 'center',

  boxSizing: 'border-box',

  padding: 0,

  marginTop: 10,

  marginBottom: 10,

  cursor: 'pointer',

};



function verificationCircleToggleStyle(selected: boolean): React.CSSProperties {

  return {

    ...verificationCircleToggleBaseStyle,

    border: selected ? 'none' : '1px solid #cbd5e1',

    backgroundColor: selected ? '#16a34a' : 'transparent',

    color: selected ? '#fff' : '#0f172a',

  };

}



export function PlatformAccountVerification() {

  const { currentUser, refreshUser } = useUser();

  const navigate = useNavigate();

  const isMobile = useIsMobile();



  const [step, setStep] = useState<Step | null>(null); // null = step selection view
  const [subStep, setSubStep] = useState<number>(1); // 1.1, 1.2 for step 1; 2.1-2.5 for step 2

  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({

    firstName: '',

    middleName: '',

    lastName: '',

    sex: '' as SexValue,

    birthDate: '',

    address: '',

    postalCode: '',

    city: '',

  });

  const [preferences, setPreferences] = useState<PreferenceId[]>([]);

  const [tradingObjective, setTradingObjective] = useState('');

  const [plannedInvestment12m, setPlannedInvestment12m] = useState('');

  const [complianceFamilyFlags, setComplianceFamilyFlags] = useState<string[]>([]);

  const [fundsSources, setFundsSources] = useState<string[]>([]);

  const [primaryProfession, setPrimaryProfession] = useState('');

  const [employerName, setEmployerName] = useState('');

  const [annualNetIncome, setAnnualNetIncome] = useState('');

  const [totalLiquidities, setTotalLiquidities] = useState('');

  const [identityDocument, setIdentityDocument] = useState<File | null>(null);
  const [identityDocumentVerso, setIdentityDocumentVerso] = useState<File | null>(null);

  const [proofOfAddress, setProofOfAddress] = useState<File | null>(null);

  const [selfiePhoto, setSelfiePhoto] = useState<File | null>(null);
  
  const [verificationConfig, setVerificationConfig] = useState<
    Record<string, { enabled?: boolean; questions?: Record<string, boolean> }>
  >({});
  const [verificationConfigLoaded, setVerificationConfigLoaded] = useState(false);

  const kycDocumentsConfig = useMemo(() => {
    const defaultDocs = {
      identityDocument: true,
      identityDocumentVerso: true,
      proofOfAddress: true,
      selfiePhoto: true,
    };

    const step8 = verificationConfig?.step_8;
    const questions = step8 && typeof step8 === 'object' ? step8.questions : undefined;
    return {
      ...defaultDocs,
      ...(questions && typeof questions === 'object' ? questions : {}),
    };
  }, [verificationConfig]);

  const isKycDocumentRequested = (documentKey: keyof typeof kycDocumentsConfig): boolean => {
    return kycDocumentsConfig[documentKey] !== false;
  };

  const kycDocumentsReview = useMemo(() => {
    const review = (currentUser?.kycDocumentsReview || currentUser?.kyc_documents_review || {}) as Record<string, string>;
    return review && typeof review === 'object' ? review : {};
  }, [currentUser]);

  const getExistingKycDocumentUrl = (documentKey: KycDocumentField): string => {
    if (documentKey === 'identityDocument') return (currentUser?.identityDocument || currentUser?.identity_document || '').toString();
    if (documentKey === 'identityDocumentVerso') return (currentUser?.identityDocumentVerso || currentUser?.identity_document_verso || '').toString();
    if (documentKey === 'proofOfAddress') return (currentUser?.proofOfAddress || currentUser?.proof_of_address || '').toString();
    return (currentUser?.selfiePhoto || currentUser?.selfie_photo || '').toString();
  };

  const hasKycReviewEntry = (documentKey: KycDocumentField): boolean => {
    return Object.prototype.hasOwnProperty.call(kycDocumentsReview, documentKey);
  };

  const getKycReviewStatus = (documentKey: KycDocumentField): KycReviewStatus => {
    const hasReviewEntry = hasKycReviewEntry(documentKey);
    const status = (kycDocumentsReview[documentKey] || '').toString().toLowerCase();
    if (hasReviewEntry && (status === 'approved' || status === 'rejected' || status === 'pending')) return status;
    if (hasReviewEntry) return 'pending';
    const hasUploadedFile = Boolean(getExistingKycDocumentUrl(documentKey));
    if (hasUploadedFile) return 'pending';
    return 'pending';
  };

  const isKycDocumentUploadLocked = (documentKey: KycDocumentField): boolean => {
    const hasUploadedFile = Boolean(getExistingKycDocumentUrl(documentKey));
    const hasReviewEntry = hasKycReviewEntry(documentKey);
    if (!hasUploadedFile && !hasReviewEntry) return false;
    const status = getKycReviewStatus(documentKey);
    return status === 'pending' || status === 'approved';
  };

  const getKycDocumentLockedLabel = (documentKey: KycDocumentField): string => {
    const status = getKycReviewStatus(documentKey);
    if (status === 'approved') return 'Déjà validé';
    return 'Déjà envoyé — en revue';
  };

  const getKycDocumentLockedButtonLabel = (documentKey: KycDocumentField): string => {
    const status = getKycReviewStatus(documentKey);
    if (status === 'approved') return 'Déjà validé';
    return 'En revue';
  };




  // Use platform button variant (same as Login "Se connecter")



  const getClientAuth = (): { token: string; storage: Storage } | null => {

    const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);

    const sessionUserType = sessionStorage.getItem('userType');

    if (sessionToken && (sessionUserType === 'client' || sessionToken.startsWith('client_'))) {

      return { token: sessionToken, storage: sessionStorage };

    }



    const localToken = localStorage.getItem(CLIENT_ACCESS_TOKEN);

    if (localToken) {

      return { token: localToken, storage: localStorage };

    }



    return null;

  };



  const patchClientIdentity = async (payload: Record<string, any>, files?: Record<string, File>) => {

    const auth = getClientAuth();

    if (!auth) {

      toast.error('Veuillez vous reconnecter.');

      navigate('/login');

      throw new Error('Missing client auth');

    }



    const apiUrl = getApiBaseUrl();

    

    // If files are provided, use FormData; otherwise use JSON

    const formData = new FormData();

    let useFormData = false;

    

    if (files) {

      useFormData = true;

      if (files.identityDocument) {

        formData.append('identityDocument', files.identityDocument);

      }

      if (files.identityDocumentVerso) {

        formData.append('identityDocumentVerso', files.identityDocumentVerso);

      }

      if (files.proofOfAddress) {

        formData.append('proofOfAddress', files.proofOfAddress);

      }

      if (files.selfiePhoto) {

        formData.append('selfiePhoto', files.selfiePhoto);

      }

    }

    

    // Add other payload fields

    Object.keys(payload).forEach((key) => {

      if (payload[key] !== undefined && payload[key] !== null) {

        if (useFormData) {

          if (Array.isArray(payload[key])) {

            formData.append(key, JSON.stringify(payload[key]));

          } else {

            formData.append(key, String(payload[key]));

          }

        }

      }

    });

    

    const headers: HeadersInit = {

      Authorization: `Bearer ${auth.token}`,

    };

    

    if (!useFormData) {

      headers['Content-Type'] = 'application/json';

    }

    

    const res = await fetch(`${apiUrl}/api/client/identity/`, {

      method: 'PATCH',

      headers,

      body: useFormData ? formData : JSON.stringify(payload),

    });



    const data = await res.json().catch(() => null);

    if (!res.ok) {

      const message = data?.error || data?.detail || "Erreur lors de l\'enregistrement.";

      throw new Error(message);

    }



    if (data?.client) {

      auth.storage.setItem('clientData', JSON.stringify(data.client));

      // Avoid writing "userType=client" into localStorage (would overwrite admin).

      if (auth.storage === sessionStorage) {

        auth.storage.setItem('userType', 'client');

      }

    }



    return data;

  };



  useEffect(() => {

    if (!currentUser) return;

    const firstName = (currentUser.firstName || currentUser.fname || '').toString();

    const lastName = (currentUser.lastName || currentUser.lname || '').toString();

    const middleName = (currentUser.middleName || currentUser.middle_name || '').toString();

    const sex = ((currentUser.sex || '') as SexValue) || ('' as SexValue);

    const birthDate = (currentUser.birthDate || currentUser.birth_date || '').toString();

    const address = (currentUser.address || '').toString();

    const postalCode = (currentUser.postalCode || currentUser.postal_code || '').toString();

    const city = (currentUser.city || '').toString();

    const prefs = (currentUser.preferences || []) as any;

    const objective = (currentUser.tradingObjective || '').toString();

    const invest12m = (currentUser.plannedInvestment12m || '').toString();

    const compliance = (currentUser.complianceFamilyFlags || []) as any;

    const sources = (currentUser.fundsSources || []) as any;

    const profession = (currentUser.primaryProfession || '').toString();

    const employer = (currentUser.employerName || currentUser.employer_name || '').toString();

    const income = (currentUser.annualNetIncome || '').toString();

    const liquidities = (currentUser.totalLiquidities || '').toString();



    setForm((prev) => ({

      ...prev,

      firstName,

      lastName,

      middleName,

      sex: prev.sex || sex,

      birthDate: prev.birthDate || birthDate,

      address: prev.address || address,

      postalCode: prev.postalCode || postalCode,

      city: prev.city || city,

    }));



    if (Array.isArray(prefs) && preferences.length === 0) {

      setPreferences(prefs as PreferenceId[]);

    }

    if (!tradingObjective && objective) setTradingObjective(objective);

    if (!plannedInvestment12m && invest12m) setPlannedInvestment12m(invest12m);

    if (Array.isArray(compliance) && complianceFamilyFlags.length === 0) setComplianceFamilyFlags(compliance as string[]);

    if (Array.isArray(sources) && fundsSources.length === 0) setFundsSources(sources as string[]);

    if (!primaryProfession && profession) setPrimaryProfession(profession);

    if (!employerName && employer) setEmployerName(employer);

    if (!annualNetIncome && income) setAnnualNetIncome(income);

    if (!totalLiquidities && liquidities) setTotalLiquidities(liquidities);

  }, [currentUser]);

  // Scroll to top when step or subStep changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, subStep]);

  // Load verification config
  useEffect(() => {
    if (!currentUser?.id) return;
    setVerificationConfigLoaded(false);
    const loadVerificationConfig = async () => {
      try {
        // Add cache-busting timestamp to ensure fresh data
        const config = await apiCall(`/api/clients/${currentUser.id}/verification-config/?_t=${Date.now()}`).catch(() => ({ stepsConfig: {} }));
        const stepsConfig = (config as any)?.stepsConfig || {};
        setVerificationConfig(stepsConfig);
        setVerificationConfigLoaded(true);
        console.log('Loaded verification config for verification page:', stepsConfig, 'Step 3 enabled?', stepsConfig?.step_3?.enabled !== false);
        console.log('Step 3 config object:', stepsConfig?.step_3);
      } catch (error) {
        console.error('Error loading verification config:', error);
        setVerificationConfig({});
        setVerificationConfigLoaded(true);
      }
    };
    loadVerificationConfig();
  }, [currentUser?.id]);

  // Helper function to map UI step numbers to config step numbers
  // UI Step 1 = Config Steps 1-2 (Identity + Address)
  // UI Step 2 = Config Steps 3-7 (Profile, Preferences, Objectives, Compliance, Funds Sources)
  // UI Step 3 = Config Step 8 (KYC)
  const getConfigStepNumber = (uiStepNumber: number): number => {
    if (uiStepNumber === 3) return 8; // KYC step
    return uiStepNumber; // Steps 1 and 2 map directly
  };

  // Helper function to check if a config step is enabled
  const isConfigStepEnabled = (configStepNumber: number): boolean => {
    const stepKey = `step_${configStepNumber}`;
    const disabledByDefaultIfMissing = [6, 7];
    if (!verificationConfig || verificationConfig[stepKey] === undefined) {
      if (disabledByDefaultIfMissing.includes(configStepNumber)) {
        return false;
      }
      return true;
    }
    const stepConfig = verificationConfig[stepKey];
    if (stepConfig && typeof stepConfig === 'object' && stepConfig.enabled === false) {
      return false;
    }
    return true;
  };

  // Helper function to check if a UI step is enabled
  const isStepEnabled = (stepNumber: number): boolean => {
    // Special handling for UI Step 2: check if ANY of config steps 3-7 are enabled
    if (stepNumber === 2) {
      const hasAnyEnabled = [3, 4, 5, 6, 7].some(step => isConfigStepEnabled(step));
      console.log(`[Verification] UI Step 2 (Config Steps 3-7) - at least one enabled:`, hasAnyEnabled);
      return hasAnyEnabled;
    }
    
    // For other steps, map UI step number to config step number
    const configStepNumber = getConfigStepNumber(stepNumber);
    const stepKey = `step_${configStepNumber}`;
    // Si la config existe pour cette étape, vérifier la valeur enabled
    if (verificationConfig && verificationConfig[stepKey] !== undefined) {
      const stepConfig = verificationConfig[stepKey];
      // Si enabled est explicitement false, l'étape est désactivée
      if (stepConfig && typeof stepConfig === 'object' && stepConfig.enabled === false) {
        console.log(`[Verification] UI Step ${stepNumber} (Config Step ${configStepNumber}) is DISABLED in config:`, stepConfig);
        console.log(`[Verification] Full verificationConfig:`, verificationConfig);
        return false;
      }
      // Si enabled est true ou non défini dans l'objet step, l'étape est activée
      console.log(`[Verification] UI Step ${stepNumber} (Config Step ${configStepNumber}) is ENABLED in config:`, stepConfig);
      return true;
    }
    // Si la config n'existe pas du tout pour cette étape, par défaut l'étape est activée (pour rétrocompatibilité)
    console.log(`[Verification] UI Step ${stepNumber} (Config Step ${configStepNumber}) config not found, defaulting to ENABLED`);
    console.log(`[Verification] Full verificationConfig:`, verificationConfig);
    return true;
  };

  // Redirect to step selection if current step is disabled
  useEffect(() => {
    if (step !== null && !isStepEnabled(step)) {
      setStep(null);
    }
  }, [step, verificationConfig]);

  // Helper functions to check if specific config steps are completed
  const isConfigStepCompletedForUser = (user: typeof currentUser, configStepNumber: number): boolean => {
    if (!user) return false;

    const hasValue = (...keys: string[]): boolean =>
      keys.some((key) => {
        const value = (user as any)?.[key];
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        return true;
      });

    const hasArrayValues = (...keys: string[]): boolean =>
      keys.some((key) => Array.isArray((user as any)?.[key]) && ((user as any)[key] as unknown[]).length > 0);
    
    switch (configStepNumber) {
      case 1: // Identity
        return hasValue('firstName', 'fname') &&
               hasValue('lastName', 'lname') &&
               hasValue('sex') &&
               hasValue('birthDate', 'birth_date');
      
      case 2: // Address
        return hasValue('address') &&
               hasValue('postalCode', 'postal_code') &&
               hasValue('city');
      
      case 3: // Profile
        return hasValue('primaryProfession', 'primary_profession') &&
               hasValue('annualNetIncome', 'annual_net_income') &&
               hasValue('totalLiquidities', 'total_liquidities');
      
      case 4: // Preferences
        return hasArrayValues('preferences');
      
      case 5: // Objectives
        return hasValue('tradingObjective', 'trading_objective') &&
               hasValue('plannedInvestment12m', 'planned_investment_12m');
      
      case 6: // Compliance
        return hasArrayValues('complianceFamilyFlags', 'compliance_family_flags');
      
      case 7: // Funds Sources
        return hasArrayValues('fundsSources', 'funds_sources');
      
      case 8: // KYC
        return ['approved', 'submitted'].includes((user.kycStatus || user.kyc_status || '').toString());
      
      default:
        return false;
    }
  };

  const isConfigStepCompleted = (configStepNumber: number): boolean =>
    isConfigStepCompletedForUser(currentUser, configStepNumber);

  // Check which steps are completed
  const isStep1Completed = useMemo(() => {
    if (!currentUser) return false;
    // Step 1 requires Config Step 1 (Identity) - always required
    const hasIdentity = isConfigStepCompleted(1);
    // Only check address if Config Step 2 (Address) is enabled
    if (isConfigStepEnabled(2)) {
      const hasAddress = isConfigStepCompleted(2);
      return hasIdentity && hasAddress;
    }
    // If Config Step 2 (Address) is disabled, Step 1 is complete with just identity
    return hasIdentity;
  }, [currentUser, verificationConfig]);

  const isStep2Completed = useMemo(() => {
    if (!currentUser) return false;
    // UI Step 2 consists of Config Steps 3-7
    // Check each enabled config step - Step 2 is complete if ALL enabled steps are completed
    const configSteps = [3, 4, 5, 6, 7];
    const enabledSteps = configSteps.filter(step => isConfigStepEnabled(step));
    
    // If no steps are enabled, consider Step 2 as complete (nothing to fill)
    if (enabledSteps.length === 0) return true;
    
    // Check if all enabled steps are completed
    return enabledSteps.every(step => isConfigStepCompleted(step));
  }, [currentUser, verificationConfig]);

  const isStep3Completed = useMemo(() => {
    if (!currentUser) return false;
    // Step 3 in the UI corresponds to Config Step 8 (KYC) in the config
    // Only check completion if Config Step 8 is enabled
    if (!isConfigStepEnabled(8)) return false;
    return isConfigStepCompleted(8);
  }, [currentUser, verificationConfig]);

  const getNextIncompleteStep2SubStepForUser = (user: typeof currentUser): number => {
    // Step 2 substeps map to Config steps 3-7
    const map: Record<number, number> = { 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
    for (const configStep of [3, 4, 5, 6, 7]) {
      if (!isConfigStepEnabled(configStep)) continue;
      if (!isConfigStepCompletedForUser(user, configStep)) return map[configStep];
    }
    // Fallback: first substep (even if already complete)
    return 1;
  };

  const getNextIncompleteStep2SubStep = (): number =>
    getNextIncompleteStep2SubStepForUser(currentUser);

  const getNextIncompleteStep1SubStep = (): number => {
    // Step 1 UI includes Config steps 1 (identity) and 2 (address, optional)
    if (!isConfigStepCompleted(1)) return 1;
    if (isConfigStepEnabled(2) && !isConfigStepCompleted(2)) return 2;
    return 1;
  };

  const advanceAfterMainStepComplete = (completedStep: 1 | 2) => {
    toast.success(`Étape ${completedStep} complétée avec succès !`);

    if (completedStep === 1) {
      if (isStepEnabled(2)) {
        setStep(2);
        setSubStep(getNextIncompleteStep2SubStep());
      } else if (isStepEnabled(3)) {
        setStep(3);
        setSubStep(1);
      } else {
        setTimeout(() => navigate('/platform'), 1500);
      }
      return;
    }

    if (isStepEnabled(3)) {
      setStep(3);
      setSubStep(1);
    } else {
      setTimeout(() => navigate('/platform'), 1500);
    }
  };

  const mergePatchClientUser = (patchResponse: Awaited<ReturnType<typeof patchClientIdentity>>) =>
    patchResponse?.client ? { ...currentUser, ...patchResponse.client } : currentUser;

  const advanceStep2AfterSubmit = (updatedUser?: typeof currentUser) => {
    const user = updatedUser ?? currentUser;
    const enabledConfigSteps = [3, 4, 5, 6, 7].filter(isConfigStepEnabled);
    const allEnabledComplete = enabledConfigSteps.every((configStep) =>
      isConfigStepCompletedForUser(user, configStep),
    );

    if (allEnabledComplete) {
      advanceAfterMainStepComplete(2);
    } else {
      setSubStep(getNextIncompleteStep2SubStepForUser(user));
    }
  };

  // Auto-open next incomplete enabled step (skip manual selection screen)
  useEffect(() => {
    if (step !== null) return;
    if (!currentUser?.id) return;
    if (!verificationConfigLoaded) return;

    if (isStepEnabled(1) && !isStep1Completed) {
      setStep(1);
      setSubStep(getNextIncompleteStep1SubStep());
      return;
    }

    if (isStepEnabled(2) && !isStep2Completed) {
      setStep(2);
      setSubStep(getNextIncompleteStep2SubStep());
      return;
    }

    if (isStepEnabled(3) && !isStep3Completed) {
      setStep(3);
      setSubStep(1);
      return;
    }

    // Nothing left to do (or everything disabled) -> return to platform
    navigate('/platform');
  }, [
    step,
    currentUser?.id,
    verificationConfigLoaded,
    verificationConfig,
    isStep1Completed,
    isStep2Completed,
    isStep3Completed,
  ]);

  const handleIdentitySubmit = async (e: React.FormEvent) => {

    e.preventDefault();



    const firstName = (currentUser?.firstName || currentUser?.fname || '').trim();

    const lastName = (currentUser?.lastName || currentUser?.lname || '').trim();

    const sex = form.sex;

    const birthDate = form.birthDate;



    if (!firstName || !lastName) {

      toast.error('Votre prénom et nom ne figurent pas sur votre dossier. Veuillez contacter votre conseiller.');

      return;

    }

    if (!sex) {

      toast.error('Veuillez sélectionner votre sexe.');

      return;

    }

    if (!birthDate) {

      toast.error('Veuillez renseigner votre date de naissance.');

      return;

    }



    try {

      setSubmitting(true);

      await patchClientIdentity({

        sex,

        birthDate,

      });



      await refreshUser();

      toast.success('Informations enregistrées.');

      // Si l'étape 2 (Adresse) est désactivée, passer directement à l'étape 2 (Profil, Préférences, etc.)
      // Sinon, aller à l'étape 2 (Adresse)
      if (!isConfigStepEnabled(2)) {
        // Étape 2 (Adresse) désactivée, passer directement à l'étape 2 (Profil, etc.)
        setStep(2);
        setSubStep(1);
      } else {
        // Étape 2 (Adresse) activée, aller à l'étape 2 (Adresse)
        setStep(1);
        setSubStep(2);
      }

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l\'enregistrement.");

    } finally {

      setSubmitting(false);

    }

  };



  const handleAddressSubmit = async (e: React.FormEvent) => {

    e.preventDefault();



    const address = form.address.trim();

    const postalCode = form.postalCode.trim();

    const city = form.city.trim();



    if (!address) {

      toast.error('Veuillez renseigner votre adresse.');

      return;

    }

    if (!postalCode) {

      toast.error('Veuillez renseigner votre code postal.');

      return;

    }

    if (!city) {

      toast.error('Veuillez renseigner votre ville.');

      return;

    }



    try {

      setSubmitting(true);

      await patchClientIdentity({

        address,

        postalCode,

        city,

      });



      await refreshUser();

      advanceAfterMainStepComplete(1);

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l\'enregistrement.");

    } finally {

      setSubmitting(false);

    }

  };



  const uploadSingleKycDocument = async (documentKey: KycDocumentField) => {
    const selectedFile =
      documentKey === 'identityDocument' ? identityDocument :
      documentKey === 'identityDocumentVerso' ? identityDocumentVerso :
      documentKey === 'proofOfAddress' ? proofOfAddress :
      selfiePhoto;

    if (!selectedFile) {
      toast.error('Veuillez sélectionner un fichier avant l\'envoi.');
      return;
    }

    try {
      setSubmitting(true);
      await patchClientIdentity({ kycStatus: 'submitted' }, { [documentKey]: selectedFile });
      await refreshUser();

      if (documentKey === 'identityDocument') setIdentityDocument(null);
      if (documentKey === 'identityDocumentVerso') setIdentityDocumentVerso(null);
      if (documentKey === 'proofOfAddress') setProofOfAddress(null);
      if (documentKey === 'selfiePhoto') setSelfiePhoto(null);

      toast.success('Document envoyé pour revue.');
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors de l'envoi du document.");
    } finally {
      setSubmitting(false);
    }
  };



  const handlePreferencesSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (preferences.length === 0) {

      toast.error('Veuillez sélectionner au moins une préférence.');

      return;

    }



    try {

      setSubmitting(true);

      const data = await patchClientIdentity({ preferences });

      await refreshUser();

      toast.success('Préférences enregistrées.');

      advanceStep2AfterSubmit(mergePatchClientUser(data));

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l\'enregistrement.");

    } finally {

      setSubmitting(false);

    }

  };



  const togglePreference = (id: PreferenceId) => {

    setPreferences((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  };



  const toggleMulti = (value: string, setFn: React.Dispatch<React.SetStateAction<string[]>>) => {

    setFn((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));

  };



  const handleGoalsSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!tradingObjective) {

      toast.error('Veuillez sélectionner votre objectif principal.');

      return;

    }

    if (!plannedInvestment12m) {

      toast.error('Veuillez sélectionner un montant prévu.');

      return;

    }

    try {

      setSubmitting(true);

      const data = await patchClientIdentity({ tradingObjective, plannedInvestment12m });

      await refreshUser();

      advanceStep2AfterSubmit(mergePatchClientUser(data));

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l\'enregistrement.");

    } finally {

      setSubmitting(false);

    }

  };



  const handleComplianceSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (complianceFamilyFlags.length === 0) {

      toast.error('Veuillez répondre à la question de conformité.');

      return;

    }

    try {

      setSubmitting(true);

      const data = await patchClientIdentity({ complianceFamilyFlags });

      await refreshUser();

      advanceStep2AfterSubmit(mergePatchClientUser(data));

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l\'enregistrement.");

    } finally {

      setSubmitting(false);

    }

  };



  const handleFundsSourcesSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (fundsSources.length === 0) {

      toast.error('Veuillez sélectionner au moins une source de fonds.');

      return;

    }

    try {

      setSubmitting(true);

      const data = await patchClientIdentity({ fundsSources });

      await refreshUser();

      advanceStep2AfterSubmit(mergePatchClientUser(data));

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l\'enregistrement.");

    } finally {

      setSubmitting(false);

    }

  };



  // Fonction pour déterminer si une profession nécessite un employeur
  const requiresEmployer = (profession: string): boolean => {
    // Retourner false si la profession est vide ou non sélectionnée
    if (!profession || profession.trim() === '') {
      return false;
    }
    const professionsWithoutEmployer = ['Retraité(e)', 'Étudiant(e)', 'Sans emploi'];
    return !professionsWithoutEmployer.includes(profession);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!primaryProfession) {

      toast.error('Veuillez sélectionner votre profession.');

      return;

    }

    if (!annualNetIncome) {

      toast.error('Veuillez sélectionner votre revenu annuel net.');

      return;

    }

    if (!totalLiquidities) {

      toast.error('Veuillez sélectionner le montant de vos liquidités.');

      return;

    }

    try {

      setSubmitting(true);

      const data = await patchClientIdentity({ primaryProfession, employerName: employerName.trim(), annualNetIncome, totalLiquidities });

      await refreshUser();

      toast.success('Informations enregistrées.');

      advanceStep2AfterSubmit(mergePatchClientUser(data));

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l\'enregistrement.");

    } finally {

      setSubmitting(false);

    }

  };



  const handleBack = () => {
    if (step === null) {
      // From step selection, go back to platform
      navigate('/platform');
    } else if (step === 3) {
      // From KYC, go back to previous incomplete step (no selection screen)
      if (isStepEnabled(2) && !isStep2Completed) {
        setStep(2);
        setSubStep(getNextIncompleteStep2SubStep());
      } else if (isStepEnabled(1) && !isStep1Completed) {
        setStep(1);
        setSubStep(getNextIncompleteStep1SubStep());
      } else {
        navigate('/platform');
      }
    } else if (step === 2) {
      // Within step 2, navigate through substeps backwards
      if (subStep > 1) {
        setSubStep(subStep - 1);
      } else {
        // From step 2 substep 1, go back to step 1 if needed, otherwise platform
        if (isStepEnabled(1) && !isStep1Completed) {
          setStep(1);
          setSubStep(getNextIncompleteStep1SubStep());
        } else {
          navigate('/platform');
        }
      }
    } else if (step === 1) {
      // Within step 1, navigate through substeps backwards
      if (subStep > 1) {
        // If step 2 (Address) is disabled and we're at subStep 2, skip it and go to subStep 1
        if (subStep === 2 && !isConfigStepEnabled(2)) {
          setSubStep(1);
        } else {
          setSubStep(subStep - 1);
        }
      } else {
        // From step 1 substep 1, go back to platform (no selection screen)
        navigate('/platform');
      }
    } else {
      navigate('/platform');
    }
  };

  const handleStartStep = (stepNumber: Step) => {
    if (!isStepEnabled(stepNumber)) {
      return;
    }
    setStep(stepNumber);
    setSubStep(1);
  };

  // We auto-route to the next incomplete step in an effect. While `step` is null,
  // render a lightweight placeholder so the manual selection screen never appears.
  if (step === null) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: isMobile ? '100%' : 1200, width: '100%', margin: '0 auto' }}>
        <h1 className="platform-portfolioPageTitle">Vérification du compte</h1>
        <Card style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' }}>
          <CardContent style={{ paddingTop: 18 }}>
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="text-slate-700" style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
                Ouverture de votre prochaine étape...
              </div>
              <div className="text-slate-500" style={{ fontSize: 13 }}>
                {verificationConfigLoaded ? 'Redirection en cours' : 'Chargement de la configuration'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (

    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: isMobile ? '100%' : 1200, width: '100%', margin: '0 auto' }}>
      <h1 className="platform-portfolioPageTitle">Vérification du compte</h1>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate('/platform')}
        >
          Fermer
        </Button>
      </div>



      <Card style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' }}>

        <CardHeader style={{ paddingBottom: 8 }}>

          <div
            className={cn(
              'platform-page-title',
              step === 2 && 'verification-flow-step-title',
            )}
          >

            {step === null
              ? 'Vérification du compte'
              : step === 1
                ? subStep === 1
                  ? 'Identité'
                  : 'Adresse'
                : step === 2
                  ? subStep === 1
                    ? 'Informations financières'
                    : subStep === 2
                      ? 'Sélectionnez vos préférences pour personnaliser votre expérience'
                      : subStep === 3
                        ? 'Quel de ces énoncés décrit le mieux votre principal objectif de trading avec nous ?'
                        : subStep === 4
                          ? "Êtes-vous ou l'un de vos proches membres de la famille :"
                          : 'Quelles sont vos principales sources de revenus ?'
                  : 'Vérifier votre compte'}

          </div>

        </CardHeader>



        <CardContent style={{ paddingTop: 10 }}>

          {step === null ? (
            // Step selection view
            <div className="space-y-6">
              <div className="text-center text-slate-600 mb-6" style={{ fontSize: 14 }}>
                Sélectionnez l'étape de vérification que vous souhaitez compléter
              </div>
              
              <div className="space-y-4">
                {/* Step 1 */}
                {isStepEnabled(1) && (
                <div
                  onClick={() => handleStartStep(1)}
                  style={{
                    padding: '20px',
                    border: '2px solid',
                    borderColor: isStep1Completed ? '#10b981' : '#e5e7eb',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    backgroundColor: isStep1Completed ? '#f0fdf4' : '#ffffff',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isStep1Completed) {
                      e.currentTarget.style.borderColor = '#3b82f6';
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isStep1Completed) {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {isStep1Completed ? (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle2 size={24} color="white" />
                        </div>
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid #9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#6b7280' }}>
                          1
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Étape 1 : Identité et Adresse</div>
                        <div style={{ fontSize: 14, color: '#64748b' }}>Identité et informations de contact</div>
                      </div>
                    </div>
                    {isStep1Completed && (
                      <Badge style={{ backgroundColor: '#10b981', color: 'white' }}>Complétée</Badge>
                    )}
                  </div>
                </div>
                )}

                {/* Step 2 */}
                {isStepEnabled(2) && (
                <div
                  onClick={() => {
                    const canAccess = !isStepEnabled(1) || isStep1Completed;
                    if (canAccess) {
                      handleStartStep(2);
                    } else {
                      toast.error('Veuillez d\'abord compléter l\'étape 1');
                    }
                  }}
                  style={{
                    padding: '20px',
                    border: '2px solid',
                    borderColor: isStep2Completed ? '#10b981' : ((!isStepEnabled(1) || isStep1Completed) ? '#e5e7eb' : '#d1d5db'),
                    borderRadius: '12px',
                    cursor: (!isStepEnabled(1) || isStep1Completed) ? 'pointer' : 'not-allowed',
                    backgroundColor: isStep2Completed ? '#f0fdf4' : ((!isStepEnabled(1) || isStep1Completed) ? '#ffffff' : '#f9fafb'),
                    opacity: (!isStepEnabled(1) || isStep1Completed) ? 1 : 0.6,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    const canAccess = (!isStepEnabled(1) || isStep1Completed) && !isStep2Completed;
                    if (canAccess) {
                      e.currentTarget.style.borderColor = '#3b82f6';
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const canAccess = (!isStepEnabled(1) || isStep1Completed) && !isStep2Completed;
                    if (canAccess) {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {isStep2Completed ? (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle2 size={24} color="white" />
                        </div>
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid #9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#6b7280' }}>
                          2
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Étape 2 : Informations financières</div>
                        <div style={{ fontSize: 14, color: '#64748b' }}>Profil, préférences, objectifs et conformité</div>
                      </div>
                    </div>
                    {isStep2Completed && (
                      <Badge style={{ backgroundColor: '#10b981', color: 'white' }}>Complétée</Badge>
                    )}
                  </div>
                </div>
                )}

                {/* Step 3 - Note: Step 3 in UI corresponds to step 8 (KYC) in config */}
                {isStepEnabled(8) && (
                <div
                  onClick={() => {
                    // If step 2 is disabled, allow access if step 1 is completed (or if step 1 is also disabled)
                    // If step 2 is enabled, require step 2 to be completed
                    const canAccess = isStepEnabled(2) 
                      ? isStep2Completed 
                      : (!isStepEnabled(1) || isStep1Completed);
                    if (canAccess) {
                      handleStartStep(3);
                    } else {
                      const requiredStep = isStepEnabled(2) ? 2 : 1;
                      toast.error(`Veuillez d'abord compléter l'étape ${requiredStep}`);
                    }
                  }}
                  style={{
                    padding: '20px',
                    border: '2px solid',
                    // Determine border color based on step 2 status
                    borderColor: isStep3Completed ? '#10b981' : (
                      isStepEnabled(2)
                        ? (isStep2Completed ? '#e5e7eb' : '#d1d5db')
                        : ((!isStepEnabled(1) || isStep1Completed) ? '#e5e7eb' : '#d1d5db')
                    ),
                    borderRadius: '12px',
                    cursor: (
                      isStepEnabled(2)
                        ? (isStep2Completed ? 'pointer' : 'not-allowed')
                        : ((!isStepEnabled(1) || isStep1Completed) ? 'pointer' : 'not-allowed')
                    ),
                    backgroundColor: isStep3Completed ? '#f0fdf4' : (
                      isStepEnabled(2)
                        ? (isStep2Completed ? '#ffffff' : '#f9fafb')
                        : ((!isStepEnabled(1) || isStep1Completed) ? '#ffffff' : '#f9fafb')
                    ),
                    opacity: (
                      isStepEnabled(2)
                        ? (isStep2Completed ? 1 : 0.6)
                        : ((!isStepEnabled(1) || isStep1Completed) ? 1 : 0.6)
                    ),
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    const canAccess = isStepEnabled(2)
                      ? (isStep2Completed && !isStep3Completed)
                      : ((!isStepEnabled(1) || isStep1Completed) && !isStep3Completed);
                    if (canAccess) {
                      e.currentTarget.style.borderColor = '#3b82f6';
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const canAccess = isStepEnabled(2)
                      ? (isStep2Completed && !isStep3Completed)
                      : ((!isStepEnabled(1) || isStep1Completed) && !isStep3Completed);
                    if (canAccess) {
                      e.currentTarget.style.borderColor = isStep3Completed ? '#10b981' : (
                        isStepEnabled(2)
                          ? (isStep2Completed ? '#e5e7eb' : '#d1d5db')
                          : ((!isStepEnabled(1) || isStep1Completed) ? '#e5e7eb' : '#d1d5db')
                      );
                      e.currentTarget.style.backgroundColor = isStep3Completed ? '#f0fdf4' : (
                        isStepEnabled(2)
                          ? (isStep2Completed ? '#ffffff' : '#f9fafb')
                          : ((!isStepEnabled(1) || isStep1Completed) ? '#ffffff' : '#f9fafb')
                      );
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {isStep3Completed ? (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle2 size={24} color="white" />
                        </div>
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid #9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#6b7280' }}>
                          3
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Étape 3 : Vérification KYC</div>
                        <div style={{ fontSize: 14, color: '#64748b' }}>Téléchargement des documents d'identité</div>
                      </div>
                    </div>
                    {isStep3Completed && (
                      <Badge style={{ backgroundColor: '#10b981', color: 'white' }}>Complétée</Badge>
                    )}
                  </div>
                </div>
                )}
              </div>
            </div>
          ) : step === 1 && subStep === 1 ? (

            <form onSubmit={handleIdentitySubmit} className="space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">

                  <Label htmlFor="firstName">Prénom</Label>

                  <Input

                    id="firstName"

                    value={form.firstName}

                    readOnly

                    className="bg-slate-50 text-slate-700"

                    title="Renseigné par votre conseiller — non modifiable"

                  />

                </div>



                <div className="space-y-2">

                  <Label htmlFor="middleName">Deuxième prénom</Label>

                  <Input

                    id="middleName"

                    value={form.middleName}

                    readOnly

                    className="bg-slate-50 text-slate-700"

                    title="Renseigné par votre conseiller — non modifiable"

                    placeholder="(optionnel)"

                  />

                </div>



                <div className="space-y-2">

                  <Label htmlFor="lastName">Nom de famille</Label>

                  <Input

                    id="lastName"

                    value={form.lastName}

                    readOnly

                    className="bg-slate-50 text-slate-700"

                    title="Renseigné par votre conseiller — non modifiable"

                  />

                </div>

              </div>



              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div className="space-y-2">

                  <Label htmlFor="sex">Quel est votre sexe ?</Label>

                  <Select value={form.sex} onValueChange={(value) => setForm({ ...form, sex: value as SexValue })}>

                    <SelectTrigger id="sex">

                      <SelectValue placeholder="Sélectionner" />

                    </SelectTrigger>

                    <SelectContent>

                      <SelectItem value="male">Homme</SelectItem>

                      <SelectItem value="female">Femme</SelectItem>

                      <SelectItem value="other">Autre</SelectItem>

                    </SelectContent>

                  </Select>

                </div>



                <div className="space-y-2">

                  <Label htmlFor="birthDate">Quelle est votre date de naissance ?</Label>

                  <DateInput

                    id="birthDate"

                    value={form.birthDate}

                    onChange={(value) => setForm({ ...form, birthDate: value })}

                  />

                </div>

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>

                <Button type="button" variant="platform" className="kyc-nav-button" onClick={handleBack}>

                  Retour

                </Button>

                <Button type="submit" disabled={submitting} variant="platform" className="kyc-nav-button">

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 1 && subStep === 2 && isConfigStepEnabled(2) ? (

            <form onSubmit={handleAddressSubmit} className="space-y-6">

              <div className="space-y-2">

                <Label htmlFor="address">Adresse</Label>

                <Input

                  id="address"

                  value={form.address}

                  onChange={(e) => setForm({ ...form, address: e.target.value })}

                  placeholder="Numéro et rue"

                  required

                />

              </div>



              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div className="space-y-2">

                  <Label htmlFor="postalCode">Code postal</Label>

                  <Input

                    id="postalCode"

                    value={form.postalCode}

                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}

                    placeholder="75001"

                    required

                  />

                </div>



                <div className="space-y-2">

                  <Label htmlFor="city">Ville</Label>

                  <Input

                    id="city"

                    value={form.city}

                    onChange={(e) => setForm({ ...form, city: e.target.value })}

                    placeholder="Paris"

                    required

                  />

                </div>

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>

                <Button type="button" variant="platform" className="kyc-nav-button" onClick={handleBack}>

                  Retour

                </Button>

                <Button type="submit" disabled={submitting} variant="platform" className="kyc-nav-button">

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 2 && subStep === 1 ? (

            <form onSubmit={handleProfileSubmit} className="space-y-8">

              <div>

                <div className="platform-page-title" style={{ fontSize: 'clamp(18px, 2vw, 22px)' }}>

                  Quelle est votre profession principale ?

                </div>

                <div style={{ marginTop: 10 }}>

                  <Select value={primaryProfession} onValueChange={setPrimaryProfession}>

                    <SelectTrigger>

                      <SelectValue placeholder="Profession" />

                    </SelectTrigger>

                    <SelectContent>

                      {[

                        'Comptabilité',

                        'Agriculture',

                        'Architecture/Ingénierie',

                        'Défense/Armes',

                        'Arts/Design',

                        'BTP',

                        'Services informatiques',

                        'Conseil',

                        'Services de bourse et de change',

                        'Médecine/Santé',

                        'Enseignement/Éducation',

                        'Juridique/Droit',

                        'Commerce/Vente',

                        'Ressources humaines',

                        'Marketing/Communication',

                        'Finance/Banque',

                        'Assurance',

                        'Immobilier',

                        'Transport/Logistique',

                        'Hôtellerie/Restauration',

                        'Tourisme',

                        'Médias/Journalisme',

                        'Fonction publique',

                        'Sécurité',

                        'Retraité(e)',

                        'Étudiant(e)',

                        'Sans emploi',

                        'Autre',

                      ].map((p) => (

                        <SelectItem key={p} value={p}>{p}</SelectItem>

                      ))}

                    </SelectContent>

                  </Select>

                </div>



                {requiresEmployer(primaryProfession) && (
                  <div className="space-y-2" style={{ marginTop: 14 }}>

                    <Label htmlFor="employerName">Nom de votre employeur ? (facultatif)</Label>

                    <Input

                      id="employerName"

                      value={employerName}

                      onChange={(e) => setEmployerName(e.target.value)}

                      placeholder="Ex: Société ABC"

                    />

                  </div>
                )}

              </div>



              <div>

                <div className="platform-page-title" style={{ fontSize: 'clamp(18px, 2vw, 22px)', marginTop: 18 }}>

                  Quel est votre revenu annuel net après les dépenses ?

                </div>

                <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>(en EUR)</div>

                <div style={{ marginTop: 10 }}>

                  {[

                    'De 1 à 5 millions d\'euros',

                    '500 000 € – 1 million d\'euros',

                    '200 000 € – 500 000 €',

                    '50 000 € – 200 000 €',

                    '10 000 € – 50 000 €',

                    '10 000 € ou moins',

                  ].map((label) => {

                    const selected = annualNetIncome === label;

                    return (

                      <div

                        key={label}

                        style={{

                          display: 'flex',

                          alignItems: 'center',

                          justifyContent: 'space-between',

                          padding: '18px 8px',

                          borderTop: '1px solid #eef2f7',

                        }}

                      >

                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>

                        <button

                          type="button"

                          onClick={() => setAnnualNetIncome(label)}

                          aria-label={selected ? 'Sélectionné' : 'Sélectionner'}

                          style={verificationCircleToggleStyle(selected)}

                        >

                          {selected ? <Check size={18} /> : <Plus size={18} />}

                        </button>

                      </div>

                    );

                  })}

                </div>

              </div>



              <div>

                <div className="platform-page-title" style={{ fontSize: 'clamp(18px, 2vw, 22px)' }}>

                  Quel est le montant total de vos disponibilités et de vos liquidités ?

                </div>

                <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>

                  Cela comprend les comptes d'épargne, les comptes de courtage, etc.

                </div>

                <div style={{ marginTop: 10 }}>

                  {[

                    'De 1 à 5 millions d\'euros',

                    '500 000 € – 1 million d\'euros',

                    '200 000 € – 500 000 €',

                    '50 000 € – 200 000 €',

                    '10 000 € – 50 000 €',

                    '10 000 € ou moins',

                  ].map((label) => {

                    const selected = totalLiquidities === label;

                    return (

                      <div

                        key={label}

                        style={{

                          display: 'flex',

                          alignItems: 'center',

                          justifyContent: 'space-between',

                          padding: '18px 8px',

                          borderTop: '1px solid #eef2f7',

                        }}

                      >

                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>

                        <button

                          type="button"

                          onClick={() => setTotalLiquidities(label)}

                          aria-label={selected ? 'Sélectionné' : 'Sélectionner'}

                          style={verificationCircleToggleStyle(selected)}

                        >

                          {selected ? <Check size={18} /> : <Plus size={18} />}

                        </button>

                      </div>

                    );

                  })}

                </div>

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>

                <Button type="button" variant="platform" className="kyc-nav-button" onClick={handleBack}>

                  Retour

                </Button>

                <Button

                  type="submit"

                  disabled={submitting || !primaryProfession || !annualNetIncome || !totalLiquidities}

                  variant="platform"
                  className="kyc-nav-button"

                >

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 2 && subStep === 2 ? (

            <form onSubmit={handlePreferencesSubmit}>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5" style={{ marginTop: 6 }}>

                {PREFERENCE_OPTIONS.map(({ id, label, Icon }) => {

                  const selected = preferences.includes(id);

                  return (

                    <div

                      key={id}

                      className="flex min-h-[3.75rem] min-w-0 items-center justify-between gap-5 rounded-xl border border-slate-200/90 bg-slate-50/40 px-6 py-5 sm:min-h-[4rem] sm:px-8 sm:py-6"

                    >

                      <div className="flex min-w-0 flex-1 items-center gap-4 pr-2">

                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100/80 text-slate-600">

                          <Icon size={20} className="text-slate-600" />

                        </div>

                        <div className="min-w-0 text-[15px] text-slate-900">{label}</div>

                      </div>

                      <button

                        type="button"

                        onClick={() => togglePreference(id)}

                        aria-label={selected ? 'Retirer' : 'Ajouter'}

                        className="shrink-0"

                        style={verificationCircleToggleStyle(selected)}

                      >

                        {selected ? <Check size={18} /> : <Plus size={18} />}

                      </button>

                    </div>

                  );

                })}

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>

                <Button type="button" variant="platform" className="kyc-nav-button" onClick={handleBack}>

                  Retour

                </Button>

                <Button type="submit" disabled={submitting} variant="platform" className="kyc-nav-button">

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 2 && subStep === 3 ? (

            <form onSubmit={handleGoalsSubmit} className="space-y-10">

              {/* Objective */}

              <div>

                <div style={{ marginTop: 6 }}>

                  {[

                    { id: 'short_term', label: 'Rendements à court terme', Icon: TrendingUp },

                    { id: 'extra_income', label: 'Revenus supplémentaires', Icon: Wallet },

                    { id: 'future_planning', label: "Planification de l'avenir (éducation des enfants, retraite, etc.)", Icon: Home },

                    { id: 'save_house', label: 'Épargne pour une maison', Icon: Home },

                  ].map(({ id, label, Icon }) => {

                    const selected = tradingObjective === id;

                    return (

                      <div

                        key={id}

                        style={{

                          display: 'flex',

                          alignItems: 'center',

                          justifyContent: 'space-between',

                          padding: '18px 8px',

                          borderTop: '1px solid #eef2f7',

                        }}

                      >

                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

                          <div style={{ width: 26, display: 'flex', justifyContent: 'center' }}>

                            <Icon size={18} className="text-slate-600" />

                          </div>

                          <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>

                        </div>

                        <button

                          type="button"

                          onClick={() => setTradingObjective(id)}

                          aria-label={selected ? 'Sélectionné' : 'Sélectionner'}

                          style={verificationCircleToggleStyle(selected)}

                        >

                          {selected ? <Check size={18} /> : <Plus size={18} />}

                        </button>

                      </div>

                    );

                  })}

                </div>

              </div>



              {/* Planned investment */}

              <div>

                <div className="platform-page-title" style={{ marginTop: 18, fontSize: 'clamp(18px, 2vw, 22px)' }}>

                  Quel montant prévoyez–vous d’investir au cours des 12 prochains mois ?

                </div>

                <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>au cours de cette année.</div>

                <div style={{ marginTop: 10 }}>

                  {[

                    'Au-delà de 1 million d\'€',

                    '500 000 € – 1 million d\'€',

                    '200 000 € – 500 000 €',

                    '50 000 € – 200 000 €',

                    '10 000 € – 50 000 €',

                    '10 000 € ou moins',

                  ].map((label) => {

                    const selected = plannedInvestment12m === label;

                    return (

                      <div

                        key={label}

                        style={{

                          display: 'flex',

                          alignItems: 'center',

                          justifyContent: 'space-between',

                          padding: '18px 8px',

                          borderTop: '1px solid #eef2f7',

                        }}

                      >

                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>

                        <button

                          type="button"

                          onClick={() => setPlannedInvestment12m(label)}

                          aria-label={selected ? 'Sélectionné' : 'Sélectionner'}

                          style={verificationCircleToggleStyle(selected)}

                        >

                          {selected ? <Check size={18} /> : <Plus size={18} />}

                        </button>

                      </div>

                    );

                  })}

                </div>

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>

                <Button type="button" variant="platform" className="kyc-nav-button" onClick={handleBack}>

                  Retour

                </Button>

                <Button type="submit" disabled={submitting} variant="platform" className="kyc-nav-button">

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 2 && subStep === 4 ? (

            <form onSubmit={handleComplianceSubmit} className="space-y-5">

              <div style={{ color: '#64748b', fontSize: 13 }}>Cela ne concerne pas la plupart des personnes.</div>

              {[

                { id: 'admin_or_shareholder_10pct', label: "Un administrateur ou un actionnaire à 10 % d'une société cotée en bourse.", Icon: BadgePercent },

                { id: 'brokerage_employee', label: 'Employé par une société de courtage ou une bourse de valeurs.', Icon: Scale },

                { id: 'public_official', label: 'Un responsable public de haut niveau, actuel ou ancien, élu ou nommé.', Icon: Shield },

                { id: 'none', label: "Aucune de ces options ne s'applique.", Icon: Check },

              ].map((o) => (

                <label key={o.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 6px' }}>

                  <Checkbox

                    checked={complianceFamilyFlags.includes(o.id)}

                    onCheckedChange={() => {

                      // Make "none" mutually exclusive

                      setComplianceFamilyFlags((prev) => {

                        if (o.id === 'none') return prev.includes('none') ? [] : ['none'];

                        const next = prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev.filter((x) => x !== 'none'), o.id];

                        return next;

                      });

                    }}

                  />

                  <div style={{ flex: 1 }}>

                    <div style={{ fontSize: 14, color: '#0f172a' }}>{o.label}</div>

                  </div>

                </label>

              ))}



              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>

                <Button type="button" variant="platform" className="kyc-nav-button" onClick={handleBack}>

                  Retour

                </Button>

                <Button type="submit" disabled={submitting || complianceFamilyFlags.length === 0} variant="platform" className="kyc-nav-button">

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 2 && subStep === 5 ? (

            <form onSubmit={handleFundsSourcesSubmit}>

              <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>

                Votre réponse sera considérée comme la source de fonds pour vos investissements.

              </div>

              <div style={{ marginTop: 12 }}>

                {[

                  { id: 'salary', label: 'Salaire', Icon: Briefcase },

                  { id: 'investments', label: 'Investissements', Icon: TrendingUp },

                  { id: 'savings', label: 'Économies', Icon: PiggyBank },

                  { id: 'retirement', label: 'Retraite', Icon: Landmark },

                  { id: 'inheritance', label: 'Héritage', Icon: Gift },

                  { id: 'severance', label: 'Indemnité de départ', Icon: BadgePercent },

                  { id: 'other', label: 'Autre', Icon: Plus },

                ].map(({ id, label, Icon }) => {

                  const selected = fundsSources.includes(id);

                  return (

                    <div

                      key={id}

                      style={{

                        display: 'flex',

                        alignItems: 'center',

                        justifyContent: 'space-between',

                        padding: '18px 8px',

                        borderTop: '1px solid #eef2f7',

                      }}

                    >

                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

                        <div style={{ width: 26, display: 'flex', justifyContent: 'center' }}>

                          <Icon size={18} className="text-slate-600" />

                        </div>

                        <div style={{ color: '#0f172a', fontSize: 15 }}>{label}</div>

                      </div>



                      <button

                        type="button"

                        onClick={() => toggleMulti(id, setFundsSources)}

                        aria-label={selected ? 'Retirer' : 'Ajouter'}

                        style={verificationCircleToggleStyle(selected)}

                      >

                        {selected ? <Check size={18} /> : <Plus size={18} />}

                      </button>

                    </div>

                  );

                })}

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>

                <Button type="button" variant="platform" className="kyc-nav-button" onClick={handleBack}>

                  Retour

                </Button>

                <Button type="submit" disabled={submitting || fundsSources.length === 0} variant="platform" className="kyc-nav-button">

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 3 ? (

            <div className="space-y-6">

              <div style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>

                {Object.values(kycDocumentsConfig).some((v) => v !== false)
                  ? 'Veuillez télécharger les documents suivants pour compléter votre vérification KYC.'
                  : "Aucun document n'est requis pour le moment. Vous pouvez terminer la vérification KYC."}

              </div>



              <div className="space-y-4">

                {(isKycDocumentRequested('identityDocument') || isKycDocumentRequested('identityDocumentVerso')) && (
                <div className="space-y-2">

                  <Label>Pièce d'identité</Label>

                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>

                    Carte d'identité, passeport ou permis de conduire

                  </div>

                  <div className="space-y-3">

                    {isKycDocumentRequested('identityDocument') && (
                    <div>

                      <Label htmlFor="identityDocument" style={{ fontSize: 13, marginBottom: 6, display: 'block' }}>Recto *</Label>

                      <div style={{ position: 'relative' }}>

                        <Input

                          id="identityDocument"

                          type="file"

                          accept="image/*,.pdf"
                          disabled={isKycDocumentUploadLocked('identityDocument')}

                          onChange={(e) => {

                            const file = e.target.files?.[0];

                            if (file) setIdentityDocument(file);

                          }}

                          style={{

                            opacity: 0,

                            position: 'absolute',

                            width: '100%',

                            height: '100%',

                            cursor: 'pointer',

                            zIndex: 1

                          }}

                        />

                        <div style={{

                          display: 'flex',

                          alignItems: 'center',

                          gap: 8,

                          padding: '8px 12px',

                          border: '1px solid #d1d5db',

                          borderRadius: '6px',

                          backgroundColor: '#ffffff',

                          cursor: 'pointer',

                          minHeight: '40px'

                        }}>

                          <span style={{ fontSize: 14, color: '#374151' }}>

                            {identityDocument
                              ? identityDocument.name
                              : isKycDocumentUploadLocked('identityDocument')
                                ? getKycDocumentLockedLabel('identityDocument')
                                : 'Choisir un fichier'}

                          </span>

                        </div>

                      </div>

                      {isKycDocumentUploadLocked('identityDocument') && getExistingKycDocumentUrl('identityDocument') && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                          <a href={getExistingKycDocumentUrl('identityDocument')} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                            Voir le document déjà envoyé
                          </a>
                        </div>
                      )}

                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting || !identityDocument || isKycDocumentUploadLocked('identityDocument')}
                          onClick={() => uploadSingleKycDocument('identityDocument')}
                        >
                          {isKycDocumentUploadLocked('identityDocument') ? getKycDocumentLockedButtonLabel('identityDocument') : 'Envoyer pour revue'}
                        </Button>
                      </div>

                    </div>
                    )}

                    {isKycDocumentRequested('identityDocumentVerso') && (
                    <div>

                      <Label htmlFor="identityDocumentVerso" style={{ fontSize: 13, marginBottom: 6, display: 'block' }}>Verso *</Label>

                      <div style={{ position: 'relative' }}>

                        <Input

                          id="identityDocumentVerso"

                          type="file"

                          accept="image/*,.pdf"
                          disabled={isKycDocumentUploadLocked('identityDocumentVerso')}

                          onChange={(e) => {

                            const file = e.target.files?.[0];

                            if (file) setIdentityDocumentVerso(file);

                          }}

                          style={{

                            opacity: 0,

                            position: 'absolute',

                            width: '100%',

                            height: '100%',

                            cursor: 'pointer',

                            zIndex: 1

                          }}

                        />

                        <div style={{

                          display: 'flex',

                          alignItems: 'center',

                          gap: 8,

                          padding: '8px 12px',

                          border: '1px solid #d1d5db',

                          borderRadius: '6px',

                          backgroundColor: '#ffffff',

                          cursor: 'pointer',

                          minHeight: '40px'

                        }}>

                          <span style={{ fontSize: 14, color: '#374151' }}>

                            {identityDocumentVerso
                              ? identityDocumentVerso.name
                              : isKycDocumentUploadLocked('identityDocumentVerso')
                                ? getKycDocumentLockedLabel('identityDocumentVerso')
                                : 'Choisir un fichier'}

                          </span>

                        </div>

                      </div>

                      {isKycDocumentUploadLocked('identityDocumentVerso') && getExistingKycDocumentUrl('identityDocumentVerso') && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                          <a href={getExistingKycDocumentUrl('identityDocumentVerso')} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                            Voir le document déjà envoyé
                          </a>
                        </div>
                      )}

                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={submitting || !identityDocumentVerso || isKycDocumentUploadLocked('identityDocumentVerso')}
                          onClick={() => uploadSingleKycDocument('identityDocumentVerso')}
                        >
                          {isKycDocumentUploadLocked('identityDocumentVerso') ? getKycDocumentLockedButtonLabel('identityDocumentVerso') : 'Envoyer pour revue'}
                        </Button>
                      </div>

                    </div>
                    )}

                  </div>

                </div>
                )}



                {isKycDocumentRequested('proofOfAddress') && (
                <div className="space-y-2">

                  <Label htmlFor="proofOfAddress">Justificatif de domicile *</Label>

                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>

                    Facture d'électricité, d'eau, de gaz, relevé bancaire ou avis d'imposition (moins de 3 mois)

                  </div>

                  <div style={{ position: 'relative' }}>

                    <Input

                      id="proofOfAddress"

                      type="file"

                      accept="image/*,.pdf"
                      disabled={isKycDocumentUploadLocked('proofOfAddress')}

                      onChange={(e) => {

                        const file = e.target.files?.[0];

                        if (file) setProofOfAddress(file);

                      }}

                      style={{

                        opacity: 0,

                        position: 'absolute',

                        width: '100%',

                        height: '100%',

                        cursor: 'pointer',

                        zIndex: 1

                      }}

                    />

                    <div style={{

                      display: 'flex',

                      alignItems: 'center',

                      gap: 8,

                      padding: '8px 12px',

                      border: '1px solid #d1d5db',

                      borderRadius: '6px',

                      backgroundColor: '#ffffff',

                      cursor: 'pointer',

                      minHeight: '40px'

                    }}>

                      <span style={{ fontSize: 14, color: '#374151' }}>

                        {proofOfAddress
                          ? proofOfAddress.name
                          : isKycDocumentUploadLocked('proofOfAddress')
                            ? getKycDocumentLockedLabel('proofOfAddress')
                            : 'Choisir un fichier'}

                      </span>

                    </div>

                  </div>

                  {isKycDocumentUploadLocked('proofOfAddress') && getExistingKycDocumentUrl('proofOfAddress') && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                      <a href={getExistingKycDocumentUrl('proofOfAddress')} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                        Voir le document déjà envoyé
                      </a>
                    </div>
                  )}

                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting || !proofOfAddress || isKycDocumentUploadLocked('proofOfAddress')}
                      onClick={() => uploadSingleKycDocument('proofOfAddress')}
                    >
                      {isKycDocumentUploadLocked('proofOfAddress') ? getKycDocumentLockedButtonLabel('proofOfAddress') : 'Envoyer pour revue'}
                    </Button>
                  </div>

                  {proofOfAddress && (

                    <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>

                      ✓ {proofOfAddress.name}

                    </div>

                  )}

                </div>
                )}



                {isKycDocumentRequested('selfiePhoto') && (
                <div className="space-y-2">

                  <Label htmlFor="selfiePhoto">Selfie avec pièce d'identité *</Label>

                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>

                    Prenez une photo de vous tenant votre pièce d'identité à côté de votre visage

                  </div>

                  <div style={{ position: 'relative' }}>

                    <Input

                      id="selfiePhoto"

                      type="file"

                      accept="image/*"
                      disabled={isKycDocumentUploadLocked('selfiePhoto')}

                      onChange={(e) => {

                        const file = e.target.files?.[0];

                        if (file) setSelfiePhoto(file);

                      }}

                      style={{

                        opacity: 0,

                        position: 'absolute',

                        width: '100%',

                        height: '100%',

                        cursor: 'pointer',

                        zIndex: 1

                      }}

                    />

                    <div style={{

                      display: 'flex',

                      alignItems: 'center',

                      gap: 8,

                      padding: '8px 12px',

                      border: '1px solid #d1d5db',

                      borderRadius: '6px',

                      backgroundColor: '#ffffff',

                      cursor: 'pointer',

                      minHeight: '40px'

                    }}>

                      <span style={{ fontSize: 14, color: '#374151' }}>

                        {selfiePhoto
                          ? selfiePhoto.name
                          : isKycDocumentUploadLocked('selfiePhoto')
                            ? getKycDocumentLockedLabel('selfiePhoto')
                            : 'Choisir un fichier'}

                      </span>

                    </div>

                  </div>

                  {isKycDocumentUploadLocked('selfiePhoto') && getExistingKycDocumentUrl('selfiePhoto') && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                      <a href={getExistingKycDocumentUrl('selfiePhoto')} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                        Voir le document déjà envoyé
                      </a>
                    </div>
                  )}

                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting || !selfiePhoto || isKycDocumentUploadLocked('selfiePhoto')}
                      onClick={() => uploadSingleKycDocument('selfiePhoto')}
                    >
                      {isKycDocumentUploadLocked('selfiePhoto') ? getKycDocumentLockedButtonLabel('selfiePhoto') : 'Envoyer pour revue'}
                    </Button>
                  </div>

                </div>
                )}

              </div>
            </div>

          ) : null}
        </CardContent>
      </Card>
      {step === 3 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button
            type="button"
            variant="platform"
            className="kyc-nav-button"
            onClick={handleBack}
          >
            Retour
          </Button>
          <Button
            type="button"
            variant="platform"
            className="kyc-nav-button"
            onClick={() => navigate('/platform')}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
