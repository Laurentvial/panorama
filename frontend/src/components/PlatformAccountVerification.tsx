import React, { useEffect, useMemo, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';

import { useUser } from '../contexts/UserContext';

import { ACCESS_TOKEN, CLIENT_ACCESS_TOKEN } from '../utils/constants';
import { apiCall } from '../utils/api';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

import { useIsMobile } from './ui/use-mobile';

import { Card, CardContent, CardHeader } from './ui/card';
import { Badge } from './ui/badge';

import { Button } from './ui/button';

import { Input } from './ui/input';

import { Label } from './ui/label';

import { DateInput } from './ui/date-input';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import { Checkbox } from './ui/checkbox';

import {

  ArrowLeft,

  X,

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



type SexValue = '' | 'male' | 'female' | 'other';

type Step = 1 | 2 | 3;



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

  const isMissingRequestedKycDocs =
    (isKycDocumentRequested('identityDocument') && !identityDocument) ||
    (isKycDocumentRequested('identityDocumentVerso') && !identityDocumentVerso) ||
    (isKycDocumentRequested('proofOfAddress') && !proofOfAddress) ||
    (isKycDocumentRequested('selfiePhoto') && !selfiePhoto);



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

      firstName: prev.firstName || firstName,

      lastName: prev.lastName || lastName,

      middleName: prev.middleName || middleName,

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
    if (verificationConfig && verificationConfig[stepKey] !== undefined) {
      const stepConfig = verificationConfig[stepKey];
      if (stepConfig && typeof stepConfig === 'object' && stepConfig.enabled === false) {
        return false;
      }
      return true;
    }
    return true; // Default to enabled
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
  const isConfigStepCompleted = (configStepNumber: number): boolean => {
    if (!currentUser) return false;
    
    switch (configStepNumber) {
      case 1: // Identity
        return !!(currentUser.firstName || currentUser.fname) && 
               !!(currentUser.lastName || currentUser.lname) && 
               currentUser.sex && 
               (currentUser.birthDate || currentUser.birth_date);
      
      case 2: // Address
        return !!(currentUser.address && currentUser.postalCode && currentUser.city);
      
      case 3: // Profile
        return !!(currentUser.primaryProfession || currentUser.primary_profession) && 
               currentUser.annualNetIncome && 
               currentUser.totalLiquidities;
      
      case 4: // Preferences
        return Array.isArray(currentUser.preferences) && currentUser.preferences.length > 0;
      
      case 5: // Objectives
        return !!(currentUser.tradingObjective || currentUser.trading_objective) && 
               !!(currentUser.plannedInvestment12m || currentUser.planned_investment_12m);
      
      case 6: // Compliance
        return Array.isArray(currentUser.complianceFamilyFlags) && currentUser.complianceFamilyFlags.length > 0;
      
      case 7: // Funds Sources
        return Array.isArray(currentUser.fundsSources) && currentUser.fundsSources.length > 0;
      
      case 8: // KYC
        return currentUser.kycStatus === 'approved' || currentUser.kycStatus === 'submitted';
      
      default:
        return false;
    }
  };

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

  const getNextIncompleteStep2SubStep = (): number => {
    // Step 2 substeps map to Config steps 3-7
    const map: Record<number, number> = { 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
    for (const configStep of [3, 4, 5, 6, 7]) {
      if (!isConfigStepEnabled(configStep)) continue;
      if (!isConfigStepCompleted(configStep)) return map[configStep];
    }
    // Fallback: first substep (even if already complete)
    return 1;
  };

  const getNextIncompleteStep1SubStep = (): number => {
    // Step 1 UI includes Config steps 1 (identity) and 2 (address, optional)
    if (!isConfigStepCompleted(1)) return 1;
    if (isConfigStepEnabled(2) && !isConfigStepCompleted(2)) return 2;
    return 1;
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

  const progress = useMemo(() => {
    if (!step) return { percent: 0, label: 'Sélection' };
    if (step === 1) {
      if (subStep === 1) return { percent: 10, label: 'Identité' };
      return { percent: 20, label: 'Adresse' };
    }
    if (step === 2) {
      if (subStep === 1) return { percent: 30, label: 'Profil' };
      if (subStep === 2) return { percent: 40, label: 'Préférences' };
      if (subStep === 3) return { percent: 50, label: 'Objectifs' };
      if (subStep === 4) return { percent: 65, label: 'Conformité' };
      return { percent: 75, label: 'Sources de revenus' };
    }
    return { percent: 90, label: 'KYC' };
  }, [step, subStep]);



  const handleIdentitySubmit = async (e: React.FormEvent) => {

    e.preventDefault();



    const firstName = form.firstName.trim();

    const lastName = form.lastName.trim();

    const sex = form.sex;

    const birthDate = form.birthDate;



    if (!firstName || !lastName) {

      toast.error('Veuillez renseigner votre prénom et votre nom de famille.');

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

        firstName,

        middleName: form.middleName.trim(),

        lastName,

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

      toast.success('Étape 1 complétée avec succès !');
      
      // Close verification and return to home page
      setTimeout(() => {
        navigate('/platform');
      }, 1500);

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l\'enregistrement.");

    } finally {

      setSubmitting(false);

    }

  };



  const handleKYCSubmit = async (e: React.FormEvent) => {

    e.preventDefault();



    if (isKycDocumentRequested('identityDocument') && !identityDocument) {

      toast.error('Veuillez télécharger votre pièce d\'identité (recto).');

      return;

    }

    if (isKycDocumentRequested('identityDocumentVerso') && !identityDocumentVerso) {

      toast.error('Veuillez télécharger votre pièce d\'identité (verso).');

      return;

    }

    if (isKycDocumentRequested('proofOfAddress') && !proofOfAddress) {

      toast.error('Veuillez télécharger votre justificatif de domicile.');

      return;

    }

    if (isKycDocumentRequested('selfiePhoto') && !selfiePhoto) {

      toast.error('Veuillez télécharger votre selfie.');

      return;

    }



    try {

      setSubmitting(true);

      const files: Record<string, File> = {};
      if (isKycDocumentRequested('identityDocument') && identityDocument) files.identityDocument = identityDocument;
      if (isKycDocumentRequested('identityDocumentVerso') && identityDocumentVerso) files.identityDocumentVerso = identityDocumentVerso;
      if (isKycDocumentRequested('proofOfAddress') && proofOfAddress) files.proofOfAddress = proofOfAddress;
      if (isKycDocumentRequested('selfiePhoto') && selfiePhoto) files.selfiePhoto = selfiePhoto;

      const hasFiles = Object.keys(files).length > 0;
      await patchClientIdentity({ kycStatus: 'submitted' }, hasFiles ? files : undefined);



      await refreshUser();

      toast.success('Étape 3 complétée avec succès !');
      
      // Close verification and return to home page
      setTimeout(() => {
        navigate('/platform');
      }, 1500);

    } catch (error: any) {

      toast.error(error?.message || "Erreur lors de l'enregistrement.");

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

      await patchClientIdentity({ preferences });

      await refreshUser();

      toast.success('Préférences enregistrées.');

      setSubStep(3); // Go to goals substep within step 2

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

      await patchClientIdentity({ tradingObjective, plannedInvestment12m });

      await refreshUser();

      setSubStep(4); // Go to compliance substep within step 2

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

      await patchClientIdentity({ complianceFamilyFlags });

      await refreshUser();

      setSubStep(5); // Go to funds sources substep within step 2

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

      await patchClientIdentity({ fundsSources });

      await refreshUser();

      toast.success('Étape 2 complétée avec succès !');
      
      // Vérifier si l'étape 3 est activée avant d'y accéder
      if (isStepEnabled(3)) {
        setStep(3);
        setSubStep(1);
      } else {
        // Si l'étape 3 n'est pas activée, retourner à la plateforme
        setTimeout(() => {
          navigate('/platform');
        }, 1500);
      }

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

      await patchClientIdentity({ primaryProfession, employerName: employerName.trim(), annualNetIncome, totalLiquidities });

      await refreshUser();

      toast.success('Informations enregistrées.');

      setSubStep(2); // Go to preferences substep within step 2

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
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: 980, margin: '0 auto' }}>
        <Card style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' }}>
          <CardHeader style={{ paddingBottom: 8 }}>
            <div className="platform-page-title">Vérification du compte</div>
          </CardHeader>
          <CardContent style={{ paddingTop: 10 }}>
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

    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: 980, margin: '0 auto' }}>

      {/* Top progress header (inspired by screenshot) */}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>

        <button

          type="button"

          onClick={handleBack}

          aria-label="Retour"

          style={{ border: 'none', background: 'transparent', padding: 8, cursor: 'pointer' }}

        >

          <ArrowLeft size={22} />

        </button>



        {step !== null && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>

            <div style={{ fontWeight: 600, fontSize: 14 }}>{progress.percent}% Terminer</div>

            <div style={{ width: '60%', maxWidth: 420, height: 3, backgroundColor: '#e5e7eb', borderRadius: 999 }}>

              <div style={{ width: `${progress.percent}%`, height: '100%', backgroundColor: '#22c55e', borderRadius: 999 }} />

            </div>

          </div>
        )}



        <button

          type="button"

          onClick={() => navigate('/platform')}

          aria-label="Fermer"

          style={{ border: 'none', background: 'transparent', padding: 8, cursor: 'pointer' }}

        >

          <X size={22} />

        </button>

      </div>



      <Card style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' }}>

        <CardHeader style={{ paddingBottom: 8 }}>

          <div className="platform-page-title">

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

                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}

                    required

                  />

                </div>



                <div className="space-y-2">

                  <Label htmlFor="middleName">Deuxième prénom</Label>

                  <Input

                    id="middleName"

                    value={form.middleName}

                    onChange={(e) => setForm({ ...form, middleName: e.target.value })}

                    placeholder="(optionnel)"

                  />

                </div>



                <div className="space-y-2">

                  <Label htmlFor="lastName">Nom de famille</Label>

                  <Input

                    id="lastName"

                    value={form.lastName}

                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}

                    required

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



              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>

                <Button type="submit" disabled={submitting} variant="platform">

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



              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>

                <Button type="submit" disabled={submitting} variant="platform">

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

                          style={{

                            width: 34,

                            height: 34,

                            borderRadius: '999px',

                            display: 'flex',

                            alignItems: 'center',

                            justifyContent: 'center',

                            border: selected ? 'none' : '1px solid #cbd5e1',

                            backgroundColor: selected ? '#16a34a' : 'transparent',

                            color: selected ? '#fff' : '#0f172a',

                            cursor: 'pointer',

                          }}

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

                          style={{

                            width: 34,

                            height: 34,

                            borderRadius: '999px',

                            display: 'flex',

                            alignItems: 'center',

                            justifyContent: 'center',

                            border: selected ? 'none' : '1px solid #cbd5e1',

                            backgroundColor: selected ? '#16a34a' : 'transparent',

                            color: selected ? '#fff' : '#0f172a',

                            cursor: 'pointer',

                          }}

                        >

                          {selected ? <Check size={18} /> : <Plus size={18} />}

                        </button>

                      </div>

                    );

                  })}

                </div>

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>

                <Button

                  type="submit"

                  disabled={submitting || !primaryProfession || !annualNetIncome || !totalLiquidities}

                  variant="platform"

                >

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 2 && subStep === 2 ? (

            <form onSubmit={handlePreferencesSubmit}>

              <div style={{ marginTop: 6 }}>

                {PREFERENCE_OPTIONS.map(({ id, label, Icon }) => {

                  const selected = preferences.includes(id);

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

                        onClick={() => togglePreference(id)}

                        aria-label={selected ? 'Retirer' : 'Ajouter'}

                        style={{

                          width: 34,

                          height: 34,

                          borderRadius: '999px',

                          display: 'flex',

                          alignItems: 'center',

                          justifyContent: 'center',

                          border: selected ? 'none' : '1px solid #cbd5e1',

                          backgroundColor: selected ? '#16a34a' : 'transparent',

                          color: selected ? '#fff' : '#0f172a',

                          cursor: 'pointer',

                        }}

                      >

                        {selected ? <Check size={18} /> : <Plus size={18} />}

                      </button>

                    </div>

                  );

                })}

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>

                <Button type="submit" disabled={submitting} variant="platform">

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

                          style={{

                            width: 34,

                            height: 34,

                            borderRadius: '999px',

                            display: 'flex',

                            alignItems: 'center',

                            justifyContent: 'center',

                            border: selected ? 'none' : '1px solid #cbd5e1',

                            backgroundColor: selected ? '#16a34a' : 'transparent',

                            color: selected ? '#fff' : '#0f172a',

                            cursor: 'pointer',

                          }}

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

                          style={{

                            width: 34,

                            height: 34,

                            borderRadius: '999px',

                            display: 'flex',

                            alignItems: 'center',

                            justifyContent: 'center',

                            border: selected ? 'none' : '1px solid #cbd5e1',

                            backgroundColor: selected ? '#16a34a' : 'transparent',

                            color: selected ? '#fff' : '#0f172a',

                            cursor: 'pointer',

                          }}

                        >

                          {selected ? <Check size={18} /> : <Plus size={18} />}

                        </button>

                      </div>

                    );

                  })}

                </div>

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>

                <Button type="submit" disabled={submitting} variant="platform">

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



              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>

                <Button type="submit" disabled={submitting || complianceFamilyFlags.length === 0} variant="platform">

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

                        style={{

                          width: 34,

                          height: 34,

                          borderRadius: '999px',

                          display: 'flex',

                          alignItems: 'center',

                          justifyContent: 'center',

                          border: selected ? 'none' : '1px solid #cbd5e1',

                          backgroundColor: selected ? '#16a34a' : 'transparent',

                          color: selected ? '#fff' : '#0f172a',

                          cursor: 'pointer',

                        }}

                      >

                        {selected ? <Check size={18} /> : <Plus size={18} />}

                      </button>

                    </div>

                  );

                })}

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>

                <Button type="submit" disabled={submitting || fundsSources.length === 0} variant="platform">

                  {submitting ? 'Enregistrement...' : 'Suivant'}

                </Button>

              </div>

            </form>

          ) : step === 3 ? (

            <form onSubmit={handleKYCSubmit} className="space-y-6">

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

                          onChange={(e) => {

                            const file = e.target.files?.[0];

                            if (file) setIdentityDocument(file);

                          }}

                          required={isKycDocumentRequested('identityDocument')}

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

                            {identityDocument ? identityDocument.name : 'Choisir un fichier'}

                          </span>

                        </div>

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

                          onChange={(e) => {

                            const file = e.target.files?.[0];

                            if (file) setIdentityDocumentVerso(file);

                          }}

                          required={isKycDocumentRequested('identityDocumentVerso')}

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

                            {identityDocumentVerso ? identityDocumentVerso.name : 'Choisir un fichier'}

                          </span>

                        </div>

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

                      onChange={(e) => {

                        const file = e.target.files?.[0];

                        if (file) setProofOfAddress(file);

                      }}

                      required={isKycDocumentRequested('proofOfAddress')}

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

                        {proofOfAddress ? proofOfAddress.name : 'Choisir un fichier'}

                      </span>

                    </div>

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

                      onChange={(e) => {

                        const file = e.target.files?.[0];

                        if (file) setSelfiePhoto(file);

                      }}

                      required={isKycDocumentRequested('selfiePhoto')}

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

                        {selfiePhoto ? selfiePhoto.name : 'Choisir un fichier'}

                      </span>

                    </div>

                  </div>

                </div>
                )}

              </div>



              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 18 }}>

                <Button type="submit" disabled={submitting || isMissingRequestedKycDocs} variant="platform">

                  {submitting ? 'Envoi en cours...' : 'Terminer la vérification'}

                </Button>

              </div>

            </form>

          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
